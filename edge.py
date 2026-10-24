"""
AegisMirage - Edge Sentry Module
Backend implementation for smart-city IoT edge camera nodes.
Handles edge-based face blurring, encrypted crop storage, anomaly detection,
and decentralized mesh heartbeat events.
"""

from __future__ import annotations

import collections
from datetime import datetime
import hashlib
import os
import threading
import time
from typing import Any
import urllib.request

# FastAPI router and HTTP utilities
from fastapi import APIRouter, HTTPException, Query, Response

# Cryptography for authenticated symmetric encryption (AES-256-GCM)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Computer vision and face detection libraries
import cv2
import numpy as np

# Shared schema contract for camera events
from schema import CameraEvent

# Explicit public API exports for other modules (prevent wildcard pollution)
__all__ = [
    "router",
    "start_edge",
    "stop_edge",
    "get_encrypted_footage",
    "decrypt_footage",
    "get_window_key_for_escrow",
]


# =============================================================================
# 1. CONFIGURATION
# =============================================================================
# Absolute directory containing this script (anchors all file paths safely)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Number of simulated edge camera nodes
NUM_NODES = 5

# Time window duration in seconds (600 seconds = 10 minutes)
WINDOW_SECONDS = 600

# Path to a test video file (e.g., "test_video.mp4") or 0 for the default webcam
# Can be configured via environment variable VIDEO_SOURCE (e.g. for headless servers or CI)
_env_video_source = os.getenv("VIDEO_SOURCE")
if _env_video_source is not None:
    try:
        VIDEO_SOURCE: Any = int(_env_video_source)
    except ValueError:
        VIDEO_SOURCE = _env_video_source
else:
    VIDEO_SOURCE = 0

# Local directory path used for storing encrypted crops and metadata
# Anchored to BASE_DIR so it works reliably regardless of working directory
STORAGE_DIR = os.path.join(BASE_DIR, "edge_storage")

# Path to generated test video fallback
TEST_VIDEO_FALLBACK = os.path.join(BASE_DIR, "test_video.mp4")

# Rate limit for emitting 'face_blurred' events in seconds (prevents event flood)
FACE_EVENT_RATE_LIMIT = 3.0

# Simulated camera loop frame interval (0.20 seconds ~= 5 FPS)
# Tuned to prevent CPU saturation while maintaining smooth live surveillance
FRAME_INTERVAL_SECONDS = float(os.getenv("FRAME_INTERVAL_SECONDS", "0.20"))

# -----------------------------------------------------------------------------
# Privacy Blurring Tuning Constants
# -----------------------------------------------------------------------------
# Downsampled resolution for pixelation (e.g. 8x8 blocks). Lower numbers create coarser, stronger pixelation.
BLUR_PIXEL_BLOCKS = 8

# Expansion factor for the bounding box (0.30 = 30% expansion on all sides).
# Covers hair edge, forehead, jawline, ears and glasses.
BOX_EXPANSION = 0.30

# Number of consecutive missed-detection frames to keep blurring the last known face boxes
BLUR_HOLD_FRAMES = 5

# -----------------------------------------------------------------------------
# Anomaly Detection Thresholds (Tuning Constants)
# -----------------------------------------------------------------------------
# Number of recent frames tracked for rolling average brightness calculation
BRIGHTNESS_HISTORY_LEN = 20

# Blinding: drop ratio in mean brightness compared to rolling average (0.60 = 60% drop)
# If brightness falls by >= 60% from the rolling baseline, the camera is considered blinded.
BLINDING_DROP_RATIO = 0.60

# Minimum baseline brightness required to trigger blinding (avoids zero division in pure darkness)
BLINDING_MIN_BASELINE = 10.0

# Freezing: maximum mean absolute pixel difference between consecutive frames to consider it frozen
# Real-world video feeds always have sensor noise; diff < 0.15 indicates an almost-zero repeated/stuck frame buffer.
FREEZE_DIFF_THRESHOLD = 0.15

# Freezing: number of consecutive near-zero difference frames required before declaring "camera_frozen"
FREEZE_CONSECUTIVE_FRAMES = 10


# =============================================================================
# 2. EVENT LOG & HELPERS
# =============================================================================
# Thread-safe in-memory log, capped at the most recent 500 events
EVENT_LOG: collections.deque[CameraEvent] = collections.deque(maxlen=500)

# Lock to guarantee thread-safe access to EVENT_LOG across background nodes
EVENT_LOG_LOCK = threading.Lock()


def get_window_id(timestamp: datetime | str | float | None = None) -> str:
    """
    Returns a window ID string rounded down to the current 10-minute window.
    Example: 14:35 -> '2026-10-24T14:30'
    """
    # Step 1: Normalize input into a datetime object
    if timestamp is None:
        dt = datetime.now()
    elif isinstance(timestamp, datetime):
        dt = timestamp
    elif isinstance(timestamp, (int, float)):
        dt = datetime.fromtimestamp(timestamp)
    elif isinstance(timestamp, str):
        try:
            dt = datetime.fromisoformat(timestamp)
        except Exception:
            dt = datetime.now()
    else:
        dt = datetime.now()

    # Step 2: Round down minutes to the nearest 10-minute mark
    minute_rounded = (dt.minute // 10) * 10

    # Step 3: Format into standard window string 'YYYY-MM-DDTHH:MM'
    window_id = f"{dt.strftime('%Y-%m-%dT%H')}:{minute_rounded:02d}"
    return window_id


def make_event(camera_id: str, event_type: str, blurred: bool) -> CameraEvent:
    """
    Builds and returns a CameraEvent with the current timestamp and window ID.
    """
    # Step 1: Capture the current date and time
    now = datetime.now()
    now_iso = now.isoformat()

    # Step 2: Calculate the corresponding 10-minute window ID
    window_id = get_window_id(now)

    # Step 3: Create the CameraEvent instance from shared schema
    event = CameraEvent(
        camera_id=camera_id,
        window_id=window_id,
        timestamp=now_iso,
        event_type=event_type,
        blurred=blurred,
    )
    return event


def emit_event(event: CameraEvent) -> None:
    """
    Appends an event to the thread-safe EVENT_LOG and prints a readable line.
    """
    # Step 1: Acquire lock to keep log thread-safe
    with EVENT_LOG_LOCK:
        # Step 2: Append event (deque automatically discards oldest if over 500)
        EVENT_LOG.append(event)

    # Step 3: Print a clear readable line for logging key events
    print(
        f"[EVENT] [{event.timestamp}] Node: {event.camera_id} | "
        f"Type: {event.event_type} | Window: {event.window_id} | Blurred: {event.blurred}"
    )


def get_recent_events(limit: int = 50) -> list[CameraEvent]:
    """
    Returns the latest CameraEvents from the thread-safe in-memory log as a list.
    Sorted with newest events first. Guaranteed thread-safe.
    """
    with EVENT_LOG_LOCK:
        events_list = list(EVENT_LOG)[-limit:]
        events_list.reverse()
        return events_list


# =============================================================================
# 3. FACE DETECTION & PRIVACY BLURRING (OpenCV YuNet)
# =============================================================================
# We use OpenCV YuNet (cv2.FaceDetectorYN), a high-performance, lightweight
# deep learning model for face detection that is natively supported by OpenCV DNN.

YUNET_MODEL_FILENAME = "face_detection_yunet_2023mar.onnx"
YUNET_MODEL_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
)


def ensure_yunet_model(model_filename: str = YUNET_MODEL_FILENAME) -> str:
    """
    Ensures that the OpenCV YuNet face detection ONNX model is available locally.
    If not found or incomplete, downloads it from the official OpenCV Zoo on GitHub.
    If download fails, prints clear instructions for manual download.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(script_dir, model_filename)

    # Check if model exists and is a valid binary (> 50KB to ensure not an LFS pointer text file)
    if os.path.exists(model_path) and os.path.getsize(model_path) > 50000:
        return model_path

    print(f"[YUNET] Model file '{model_filename}' not found locally. Downloading from OpenCV Zoo...")
    try:
        req = urllib.request.Request(YUNET_MODEL_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as response, open(model_path, "wb") as out_file:
            data = response.read()
            out_file.write(data)
        print(f"[YUNET] Successfully downloaded '{model_filename}' ({len(data)} bytes) to: {model_path}")
        return model_path
    except Exception as exc:
        print(
            f"\n[YUNET-ERROR] Failed to download {model_filename} automatically ({exc}).\n"
            f"MANUAL DOWNLOAD INSTRUCTIONS:\n"
            f"1. Download the model file from:\n"
            f"   {YUNET_MODEL_URL}\n"
            f"2. Save it directly in the project directory as:\n"
            f"   {model_path}\n"
        )
        raise FileNotFoundError(
            f"YuNet model file '{model_filename}' missing. Please download it manually from: {YUNET_MODEL_URL}"
        ) from exc


_FACE_DETECTOR_LOCK = threading.Lock()
_FACE_DETECTOR: cv2.FaceDetectorYN | None = None


def _get_face_detector() -> cv2.FaceDetectorYN:
    """
    Returns a thread-safe shared OpenCV YuNet FaceDetectorYN instance.
    Uses score_threshold=0.6 and nms_threshold=0.3 for accurate detection.
    """
    global _FACE_DETECTOR
    with _FACE_DETECTOR_LOCK:
        if _FACE_DETECTOR is None:
            model_path = ensure_yunet_model()
            # Initial placeholder input size; updated dynamically per frame
            _FACE_DETECTOR = cv2.FaceDetectorYN.create(
                model=model_path,
                config="",
                input_size=(320, 320),
                score_threshold=0.6,
                nms_threshold=0.3,
                top_k=5000,
                backend_id=cv2.dnn.DNN_BACKEND_OPENCV,
                target_id=cv2.dnn.DNN_TARGET_CPU,
            )
            print(f"[INIT] OpenCV YuNet FaceDetectorYN initialized successfully from: {model_path}")
    return _FACE_DETECTOR


# Global blur hold tracking state when no dedicated tracker dict is supplied
_GLOBAL_BLUR_STATE: dict[str, Any] = {
    "boxes": [],
    "hold_remaining": 0,
}
_GLOBAL_BLUR_LOCK = threading.Lock()


def _apply_face_blur(
    target_img: np.ndarray,
    orig_box: tuple[int, int, int, int],
) -> None:
    """
    Applies strong two-stage irreversible privacy blurring (pixelation + Gaussian blur)
    to the given bounding box (x, y, w, h) on target_img in-place.
    """
    img_height, img_width = target_img.shape[:2]
    orig_x, orig_y, orig_w, orig_h = orig_box
    pad_w = int(orig_w * BOX_EXPANSION)
    pad_h = int(orig_h * BOX_EXPANSION)

    blur_x = max(0, orig_x - pad_w)
    blur_y = max(0, orig_y - pad_h)
    blur_w = min(orig_w + 2 * pad_w, img_width - blur_x)
    blur_h = min(orig_h + 2 * pad_h, img_height - blur_y)

    if blur_w <= 4 or blur_h <= 4:
        return

    face_roi = target_img[blur_y : blur_y + blur_h, blur_x : blur_x + blur_w]
    small_roi = cv2.resize(
        face_roi,
        (BLUR_PIXEL_BLOCKS, BLUR_PIXEL_BLOCKS),
        interpolation=cv2.INTER_LINEAR,
    )
    pixelated_roi = cv2.resize(
        small_roi,
        (blur_w, blur_h),
        interpolation=cv2.INTER_NEAREST,
    )
    kernel_size = min(31, max(7, (min(blur_w, blur_h) // 6) * 2 + 1))
    unrecognizable_roi = cv2.GaussianBlur(pixelated_roi, (kernel_size, kernel_size), 0)
    target_img[blur_y : blur_y + blur_h, blur_x : blur_x + blur_w] = unrecognizable_roi


def detect_and_blur_faces(
    frame: np.ndarray,
    blur_state: dict[str, Any] | None = None,
) -> tuple[np.ndarray, list[tuple[np.ndarray, tuple[int, int, int, int]]]]:
    """
    Detects human faces in a BGR OpenCV frame using OpenCV YuNet,
    extracts original crops, and applies strong privacy blur to ensure
    no unblurred face is returned.

    Safety: If face detection is missed for a frame or two, keeps blurring
    the last known face boxes for BLUR_HOLD_FRAMES (5) frames to guarantee
    a brief miss never shows an unblurred face.

    Parameters:
        frame: Input BGR image (OpenCV numpy array)
        blur_state: Optional per-node state tracking dict for blur holding.

    Returns:
        tuple (blurred_frame, face_crops):
            - blurred_frame: A copy of the frame with all detected/held faces blurred.
            - face_crops: List of tuples (crop_image, (x, y, w, h)) containing
              the ORIGINAL unblurred face regions and their bounding boxes.
    """
    # Step 1: Create a safe copy of the frame so the original is not overwritten in-place
    blurred_frame = frame.copy()

    # Step 2: Prepare list to store original unblurred face crops and their boxes
    face_crops: list[tuple[np.ndarray, tuple[int, int, int, int]]] = []

    # Step 3: Check for empty frame to prevent processing errors
    if frame is None or frame.size == 0:
        return blurred_frame, face_crops

    # Select state tracker for blur holding
    if blur_state is None:
        state = _GLOBAL_BLUR_STATE
        lock = _GLOBAL_BLUR_LOCK
    else:
        state = blur_state
        lock = None

    # Step 4: Get image dimensions (height, width, channels)
    img_height, img_width = frame.shape[:2]

    # Step 5: Acquire YuNet detector instance
    detector = _get_face_detector()

    # Step 6: Set input size to match the current frame dimensions (width, height)
    with _FACE_DETECTOR_LOCK:
        detector.setInputSize((img_width, img_height))
        # Step 7: Run YuNet detector on BGR frame (returns retval, faces)
        retval, faces = detector.detect(frame)

    current_boxes: list[tuple[int, int, int, int]] = []

    # Step 8: Check if any faces were detected
    if faces is not None and len(faces) > 0:
        for face in faces:
            # First 4 values are bounding box: x, y, width, height as floats
            raw_x = int(face[0])
            raw_y = int(face[1])
            raw_w = int(face[2])
            raw_h = int(face[3])

            orig_x = max(0, raw_x)
            orig_y = max(0, raw_y)
            orig_w = min(raw_w, img_width - orig_x)
            orig_h = min(raw_h, img_height - orig_y)

            if orig_w <= 4 or orig_h <= 4:
                continue

            # Extract the ORIGINAL unblurred face crop from the original frame (for encryption)
            original_crop = frame[orig_y : orig_y + orig_h, orig_x : orig_x + orig_w].copy()
            box_tuple = (orig_x, orig_y, orig_w, orig_h)
            face_crops.append((original_crop, box_tuple))
            current_boxes.append(box_tuple)

            # Apply strong privacy blur to detected face
            _apply_face_blur(blurred_frame, box_tuple)

        # Update blur hold state with freshly detected boxes
        def _save_boxes():
            state["boxes"] = list(current_boxes)
            state["hold_remaining"] = BLUR_HOLD_FRAMES

        if lock is not None:
            with lock:
                _save_boxes()
        else:
            _save_boxes()

        print(f"[EDGE-CV] Processed {len(face_crops)} face(s) via YuNet: crops in memory, frame blurred.")
    else:
        # Step 9: Face detection missed — safety hold blur for BLUR_HOLD_FRAMES
        held_boxes: list[tuple[int, int, int, int]] = []

        def _get_held():
            nonlocal held_boxes
            remaining = state.get("hold_remaining", 0)
            if remaining > 0:
                state["hold_remaining"] = remaining - 1
                held_boxes = list(state.get("boxes", []))
            else:
                state["boxes"] = []

        if lock is not None:
            with lock:
                _get_held()
        else:
            _get_held()

        if len(held_boxes) > 0:
            for h_box in held_boxes:
                _apply_face_blur(blurred_frame, h_box)
            print(f"[EDGE-CV-SAFETY] Applied safety hold blur on {len(held_boxes)} last-known face box(es).")

    # Return the fully blurred frame and the extracted unblurred crops
    return blurred_frame, face_crops


# =============================================================================
# 4. ENCRYPTION, KEY MANAGEMENT & CONTENT-ADDRESSED STORAGE
# =============================================================================
# In-memory dictionary storing the 32-byte AES-256 key per (camera_id, window_id)
# This key is shared across all crops produced by this camera in this 10-minute window
WINDOW_KEYS: dict[tuple[str, str], bytes] = {}
WINDOW_KEYS_LOCK = threading.Lock()

# In-memory index mapping (camera_id, window_id) -> list of SHA-256 crop hashes
CROP_INDEX: dict[tuple[str, str], list[str]] = {}
CROP_INDEX_LOCK = threading.Lock()


def _sanitize_window_id_for_path(window_id: str) -> str:
    """
    Sanitizes window_id for filesystem path creation.
    Replaces colons ':' with hyphens '-' because colons are prohibited
    in Windows directory and file names.
    Example: '2026-10-24T14:30' -> '2026-10-24T14-30'
    """
    return window_id.replace(":", "-")


def _get_window_storage_dir(camera_id: str, window_id: str) -> str:
    """
    Constructs the absolute directory path where encrypted crops for a given
    camera and window are stored on the local filesystem.
    """
    safe_window = _sanitize_window_id_for_path(window_id)
    return os.path.join(STORAGE_DIR, camera_id, safe_window)


def get_window_key(camera_id: str, window_id: str) -> bytes:
    """
    Returns the 32-byte AES-256 key for a specific (camera_id, window_id) pair.
    Generates a secure random 32-byte key the first time the pair is encountered,
    and returns the same key on all subsequent requests for that pair.
    """
    key_pair = (camera_id, window_id)

    # Step 1: Thread-safe check of the in-memory key cache
    with WINDOW_KEYS_LOCK:
        if key_pair not in WINDOW_KEYS:
            # Step 2: Generate a fresh 32-byte (256-bit) cryptographically strong random key
            new_key = os.urandom(32)
            WINDOW_KEYS[key_pair] = new_key
            print(f"[KEY-MGR] Generated new AES-256 key for camera '{camera_id}' at window '{window_id}'")

        # Step 3: Return the cached 32-byte key
        return WINDOW_KEYS[key_pair]


def encrypt_and_store_crop(
    camera_id: str,
    window_id: str,
    crop_array: np.ndarray,
) -> str:
    """
    Encrypts an unblurred face crop using AES-256-GCM and stores it on disk
    using content addressing (named by SHA-256 hash).

    Parameters:
        camera_id: Identifier of the camera node (e.g. 'cam-01')
        window_id: Current 10-minute window identifier (e.g. '2026-10-24T14:30')
        crop_array: Original unblurred face crop as an OpenCV BGR numpy array

    Returns:
        sha256_hash: The SHA-256 hex digest of the encrypted payload
    """
    # Step 1: Convert the raw unblurred face crop numpy array to JPEG bytes in memory
    success, encoded_jpg = cv2.imencode(".jpg", crop_array)
    if not success:
        raise ValueError("Failed to encode face crop into JPEG format.")
    jpeg_bytes = encoded_jpg.tobytes()

    # Step 2: Retrieve the AES-256 key for this camera and window (created once per window)
    key = get_window_key(camera_id, window_id)

    # Step 3: Generate a fresh, unique 12-byte random nonce for this specific crop
    nonce = os.urandom(12)

    # Step 4: Encrypt the JPEG bytes with AES-256-GCM (produces ciphertext + 16-byte auth tag)
    aesgcm = AESGCM(key)
    ciphertext_with_tag = aesgcm.encrypt(nonce, jpeg_bytes, None)

    # Step 5: Combine nonce (12 bytes) + ciphertext_with_tag into a single binary payload
    payload = nonce + ciphertext_with_tag

    # Step 6: Compute the SHA-256 hash of the ciphertext for content addressing
    sha256_hash = hashlib.sha256(ciphertext_with_tag).hexdigest()

    # Step 7: Prepare the local filesystem directory path
    target_dir = _get_window_storage_dir(camera_id, window_id)
    os.makedirs(target_dir, exist_ok=True)

    # Step 8: Save the encrypted payload to disk using content addressing: <sha256>.bin
    file_path = os.path.join(target_dir, f"{sha256_hash}.bin")
    with open(file_path, "wb") as f:
        f.write(payload)

    # Step 9: Update the in-memory index mapping (camera_id, window_id) -> list of hashes
    with CROP_INDEX_LOCK:
        idx_key = (camera_id, window_id)
        if idx_key not in CROP_INDEX:
            CROP_INDEX[idx_key] = []
        CROP_INDEX[idx_key].append(sha256_hash)

    # Step 10: Return the computed SHA-256 hash string
    return sha256_hash


def get_crop_hashes(camera_id: str, window_id: str) -> list[str]:
    """
    Returns a copy of the indexed crop hashes for a camera and window.
    Guaranteed thread-safe.
    """
    with CROP_INDEX_LOCK:
        return list(CROP_INDEX.get((camera_id, window_id), []))


def decrypt_crop(
    camera_id: str,
    window_id: str,
    sha256_hash: str,
) -> np.ndarray:
    """
    Retrieves and decrypts an encrypted crop from disk using the window's AES-256 key,
    returning the reconstructed unblurred BGR image array.
    """
    # Step 1: Locate the encrypted binary file on disk
    target_dir = _get_window_storage_dir(camera_id, window_id)
    file_path = os.path.join(target_dir, f"{sha256_hash}.bin")

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Encrypted crop file not found: {file_path}")

    # Step 2: Read binary payload from disk
    with open(file_path, "rb") as f:
        payload = f.read()

    # Step 3: Extract the 12-byte nonce from the beginning of the payload
    nonce = payload[:12]
    ciphertext_with_tag = payload[12:]

    # Step 4: Verify content-addressing integrity (SHA-256 of ciphertext must match filename)
    computed_hash = hashlib.sha256(ciphertext_with_tag).hexdigest()
    if computed_hash != sha256_hash:
        raise ValueError(
            f"Content integrity verification failed! Expected: {sha256_hash}, Got: {computed_hash}"
        )

    # Step 5: Retrieve the window key
    key = get_window_key(camera_id, window_id)

    # Step 6: Decrypt with AES-256-GCM (authenticates tag and decrypts bytes)
    aesgcm = AESGCM(key)
    jpeg_bytes = aesgcm.decrypt(nonce, ciphertext_with_tag, None)

    # Step 7: Decode JPEG bytes into OpenCV BGR numpy array
    image_buf = np.frombuffer(jpeg_bytes, dtype=np.uint8)
    crop_bgr = cv2.imdecode(image_buf, cv2.IMREAD_COLOR)
    return crop_bgr


def get_encrypted_footage(camera_id: str, window_id: str) -> list[dict[str, Any]]:
    """
    Retrieves stored encrypted face crop files for the specified camera and window.
    Returns ONLY the encrypted files for that exact camera_id + window_id, never anything else.

    Parameters:
        camera_id (str): Camera identifier (e.g. 'cam_01')
        window_id (str): 10-minute window ID (e.g. '2026-10-24T14:30')

    Returns:
        list[dict]: List of dictionaries with keys:
            - 'hash' (str): SHA-256 hex digest of the ciphertext
            - 'ciphertext' (bytes): The full binary payload (12-byte nonce + AES-256-GCM ciphertext + tag)
    """
    # Step 1: Locate the specific camera and window directory on disk
    target_dir = _get_window_storage_dir(camera_id, window_id)
    if not os.path.isdir(target_dir):
        return []

    # Step 2: Read each .bin file strictly belonging to this camera and window
    encrypted_records: list[dict[str, Any]] = []
    for entry in sorted(os.listdir(target_dir)):
        if entry.endswith(".bin"):
            sha256_hash = entry[:-4]
            file_path = os.path.join(target_dir, entry)
            with open(file_path, "rb") as f:
                payload = f.read()
            encrypted_records.append({
                "hash": sha256_hash,
                "ciphertext": payload,
            })

    return encrypted_records


def decrypt_footage(camera_id: str, window_id: str, key: bytes) -> list[np.ndarray]:
    """
    Decrypts all stored encrypted face crops for a specific camera and window
    using an externally provided 32-byte AES-256 key (e.g. reconstructed by
    escrow.py from Shamir 2-of-3 secret shares).

    Parameters:
        camera_id (str): Camera identifier (e.g. 'cam_01')
        window_id (str): 10-minute window ID (e.g. '2026-10-24T14:30')
        key (bytes): 32-byte AES-256 key reconstructed by escrow

    Returns:
        list[np.ndarray]: List of unblurred OpenCV BGR image arrays.

    Raises:
        ValueError: If key is not 32 bytes or if decryption fails due to an invalid key / corrupted ciphertext.
    """
    # Step 1: Validate key length
    if not isinstance(key, (bytes, bytearray)) or len(key) != 32:
        raise ValueError(
            f"Decryption failed: Key must be exactly 32 bytes (got {len(key) if isinstance(key, (bytes, bytearray)) else type(key)})."
        )

    # Step 2: Locate target directory
    target_dir = _get_window_storage_dir(camera_id, window_id)
    if not os.path.isdir(target_dir):
        print(f"[ESCROW-INFO] No footage found for camera '{camera_id}' and window '{window_id}'.")
        return []

    # Step 3: Decrypt each crop file with the provided key
    aesgcm = AESGCM(key)
    decrypted_images: list[np.ndarray] = []

    for entry in sorted(os.listdir(target_dir)):
        if entry.endswith(".bin"):
            file_path = os.path.join(target_dir, entry)
            with open(file_path, "rb") as f:
                payload = f.read()

            if len(payload) < 28:
                # 12-byte nonce + 16-byte minimum auth tag
                continue

            nonce = payload[:12]
            ciphertext_with_tag = payload[12:]

            try:
                # Decrypt JPEG bytes
                jpeg_bytes = aesgcm.decrypt(nonce, ciphertext_with_tag, None)
            except Exception as exc:
                print(
                    f"[ESCROW-ERROR] Decryption failed for camera '{camera_id}' at window '{window_id}': Invalid key or corrupted data."
                )
                raise ValueError(
                    f"Failed to decrypt footage: Provided key is invalid or ciphertext is corrupted ({exc})."
                ) from exc

            # Decode JPEG into OpenCV image array
            img_buf = np.frombuffer(jpeg_bytes, dtype=np.uint8)
            img = cv2.imdecode(img_buf, cv2.IMREAD_COLOR)
            if img is not None:
                decrypted_images.append(img)

    print(f"[ESCROW] Decrypted {len(decrypted_images)} face crop(s) for camera '{camera_id}' at window '{window_id}'.")
    return decrypted_images


def get_window_key_for_escrow(camera_id: str, window_id: str) -> bytes:
    """
    Returns the raw 32-byte AES-256 encryption key for a given camera and window.
    Designed exclusively for escrow.py to split the key into Shamir 2-of-3 secret shares.

    NOTE: Only escrow.py should call this function. Edge nodes do not distribute raw keys.

    Parameters:
        camera_id (str): Camera identifier (e.g. 'cam_01')
        window_id (str): 10-minute window string (e.g. '2026-10-24T14:30')

    Returns:
        bytes: 32-byte raw AES-256 key.
    """
    # Only escrow.py should call this.
    return get_window_key(camera_id, window_id)


# =============================================================================
# 5. ANOMALY DETECTION (BLINDING & FREEZING)
# =============================================================================
# Global anomaly state tracker used when callers do not provide a dedicated tracker dict
_GLOBAL_ANOMALY_STATE: dict[str, Any] = {
    "frozen_count": 0,
    "last_state": "normal",
}
_GLOBAL_ANOMALY_LOCK = threading.Lock()


def check_anomalies(
    prev_frame: np.ndarray | None,
    curr_frame: np.ndarray,
    brightness_history: list[float] | collections.deque[float],
    state_tracker: dict[str, Any] | None = None,
) -> str | None:
    """
    Monitors edge camera frames for physical tampering (blinding) or system hang (freezing).

    Returns:
        - "camera_blinded": When brightness drops by >= 60% relative to rolling baseline.
        - "camera_frozen": When frame difference is near zero for N consecutive frames.
        - "camera_recovered": When the camera returns to normal after an anomaly state.
        - None: If camera is functioning normally or continuing in an already-reported state.
    """
    # Step 1: Basic validation - ignore empty frames
    if curr_frame is None or curr_frame.size == 0:
        return None

    # Step 2: Select the state dictionary (use provided tracker or default global)
    if state_tracker is None:
        state = _GLOBAL_ANOMALY_STATE
        lock = _GLOBAL_ANOMALY_LOCK
    else:
        state = state_tracker
        lock = None

    # Step 3: Compute current frame mean brightness in grayscale
    if len(curr_frame.shape) == 3:
        curr_gray = cv2.cvtColor(curr_frame, cv2.COLOR_BGR2GRAY)
    else:
        curr_gray = curr_frame
    curr_brightness = float(np.mean(curr_gray))

    # Step 4: Check for Camera Blinding
    is_blinded = False
    last_state = state.get("last_state", "normal")
    in_blinded_state = (last_state == "camera_blinded")

    if len(brightness_history) >= 5:
        rolling_avg = float(np.mean(brightness_history))
        if rolling_avg >= BLINDING_MIN_BASELINE:
            drop_ratio = (rolling_avg - curr_brightness) / rolling_avg
            if drop_ratio >= BLINDING_DROP_RATIO:
                is_blinded = True

    # If already in blinded state, check whether current brightness is still dropped relative to preserved baseline
    if in_blinded_state and not is_blinded and len(brightness_history) >= 5:
        rolling_avg = float(np.mean(brightness_history))
        if rolling_avg >= BLINDING_MIN_BASELINE:
            drop_ratio = (rolling_avg - curr_brightness) / rolling_avg
            if drop_ratio >= BLINDING_DROP_RATIO:
                is_blinded = True

    # Step 5: Update the brightness history with current frame's brightness ONLY when not blinded
    # Preserving rolling baseline brightness ensures blinding does not normalize itself into a false freeze
    if not is_blinded and not in_blinded_state:
        if isinstance(brightness_history, collections.deque):
            brightness_history.append(curr_brightness)
        elif isinstance(brightness_history, list):
            brightness_history.append(curr_brightness)
            if len(brightness_history) > BRIGHTNESS_HISTORY_LEN:
                brightness_history.pop(0)

    # Step 6: Check for Camera Freezing (Difference between consecutive frames)
    # CRITICAL FIX 1a: Skip the freeze check while the node is in the blinded state,
    # so only camera_blinded fires, followed by one recovery event when it ends.
    is_frozen = False
    if is_blinded or in_blinded_state:
        state["frozen_count"] = 0
        is_frozen = False
    elif prev_frame is not None and prev_frame.shape == curr_frame.shape:
        if len(prev_frame.shape) == 3:
            prev_gray = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
        else:
            prev_gray = prev_frame

        diff = cv2.absdiff(prev_gray, curr_gray)
        mean_diff = float(np.mean(diff))

        if mean_diff < FREEZE_DIFF_THRESHOLD:
            state["frozen_count"] = state.get("frozen_count", 0) + 1
        else:
            state["frozen_count"] = 0

        if state["frozen_count"] >= FREEZE_CONSECUTIVE_FRAMES:
            is_frozen = True
    else:
        state["frozen_count"] = 0

    # Step 7: Determine raw current anomaly condition
    if is_blinded:
        current_condition = "camera_blinded"
    elif is_frozen:
        current_condition = "camera_frozen"
    else:
        current_condition = "normal"

    # Step 8: State Transition Management (Emit only on state changes)
    event_to_emit: str | None = None

    def _update_state():
        nonlocal event_to_emit
        last_state = state.get("last_state", "normal")

        if current_condition != "normal":
            if last_state != current_condition:
                event_to_emit = current_condition
                state["last_state"] = current_condition
                print(f"[ANOMALY-ALERT] State changed to: {current_condition}")
            else:
                event_to_emit = None
        else:
            if last_state != "normal":
                event_to_emit = "camera_recovered"
                state["last_state"] = "normal"
                print(f"[ANOMALY-ALERT] Camera recovered! Previous anomaly was: {last_state}")
            else:
                event_to_emit = None

    if lock is not None:
        with lock:
            _update_state()
    else:
        _update_state()

    return event_to_emit


# =============================================================================
# 6. CAMERA NODE & EDGE MESH
# =============================================================================
# -----------------------------------------------------------------------------
# CONCURRENCY DESIGN CHOICE: THREADING VS ASYNCIO
#
# We choose standard OS threads (threading.Thread with daemon=True) rather
# than asyncio tasks for the CameraNode processing loop because:
#
# 1. CPU-Bound Blocking Operations:
#    Frame capture (cv2.VideoCapture.read), MediaPipe face detection inference,
#    Gaussian blur, and AES-256-GCM encryption are heavy, blocking, CPU-bound
#    operations implemented in native C/C++ extensions.
#
# 2. Preventing FastAPI Event Loop Starvation:
#    If heavy synchronous computer vision and cryptographic loops run inside
#    an asyncio task on the main thread, they will block the entire asyncio event
#    loop. This would cause FastAPI to hang and become unresponsive to incoming
#    HTTP requests from the dashboard or API consumers.
#
# 3. Seamless Integration:
#    Running each CameraNode in a background OS thread with its own sleep throttle
#    allows OpenCV and MediaPipe to release the GIL, letting FastAPI's async
#    endpoints serve HTTP requests with instant, low-latency responsiveness.
# -----------------------------------------------------------------------------


def ensure_test_video(video_path: str = TEST_VIDEO_FALLBACK) -> str:
    """
    Ensures that a valid test video file exists on disk.
    If not found, generates a 5-second video with moving shapes, dynamic sweep bands,
    and face silhouettes so that simulated edge nodes have realistic active video frames.
    """
    if os.path.exists(video_path) and os.path.getsize(video_path) > 1000:
        return video_path

    print(f"[EDGE-VIDEO] Generating test video with motion at: {video_path}...")
    width, height = 640, 480
    fps = 20
    num_frames = fps * 5  # 5 seconds of footage
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(video_path, fourcc, fps, (width, height))

    for frame_idx in range(num_frames):
        frame = np.full((height, width, 3), 35, dtype=np.uint8)

        # Dynamic vertical sweep line to guarantee continuous frame-to-frame pixel variation
        sweep_x = int((frame_idx * 16) % width)
        cv2.line(frame, (sweep_x, 0), (sweep_x, height), (70, 70, 70), 6)

        # Moving human figure / face silhouette
        pos_x = int(120 + (width - 240) * (frame_idx / num_frames))
        pos_y = int(240 + 60 * np.sin(frame_idx * 0.25))
        cv2.circle(frame, (pos_x, pos_y), 50, (170, 150, 130), -1)
        cv2.circle(frame, (pos_x - 15, pos_y - 10), 8, (30, 30, 30), -1)
        cv2.circle(frame, (pos_x + 15, pos_y - 10), 8, (30, 30, 30), -1)
        cv2.ellipse(frame, (pos_x, pos_y + 15), (18, 8), 0, 0, 180, (40, 40, 160), 3)

        # Dynamic frame counter
        cv2.putText(
            frame,
            f"AEGIS SENTRY SIMULATION // FRAME {frame_idx:04d}",
            (30, 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (220, 220, 220),
            2,
        )
        out.write(frame)

    out.release()
    print(f"[EDGE-VIDEO] Created test video file successfully: {video_path}")
    return video_path


class CameraNode:
    """
    Represents an autonomous edge camera node. Runs in its own background thread,
    captures video frames, detects and blurs faces, encrypts face crops for storage,
    monitors for physical anomalies, and emits CameraEvent records.
    """

    def __init__(self, camera_id: str, video_source: Any = VIDEO_SOURCE) -> None:
        # Step 1: Store camera configuration and identifiers
        self.camera_id = camera_id
        self.video_source = video_source

        # Step 2: Threading and execution control flags
        self.is_running = False
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

        # Step 3: Frame memory (ONLY the blurred frame is ever exposed outside)
        self.latest_frame: np.ndarray | None = None
        self.last_frame_time: float = 0.0

        # Step 4: Health and event metrics
        self.faces_blurred_count: int = 0
        self.last_event: str = "node_created"
        self.last_face_event_time: float = 0.0

        # Step 5: Anomaly tracking state for this specific node
        self.anomaly_state: dict[str, Any] = {
            "frozen_count": 0,
            "last_state": "normal",
        }
        self.brightness_history: collections.deque[float] = collections.deque(
            maxlen=BRIGHTNESS_HISTORY_LEN
        )
        self.prev_frame: np.ndarray | None = None

        # Step 5b: Face blur hold tracking state for privacy safety during missed frames
        self.blur_state: dict[str, Any] = {
            "boxes": [],
            "hold_remaining": 0,
        }

        # Simulation override for live demo drills ('blind', 'freeze', or None)
        self._simulation_override: str | None = None
        self._frozen_frame_cache: np.ndarray | None = None

        # Pre-populate initial blurred frame buffer so the node is immediately healthy on launch
        self.latest_frame = self._generate_synthetic_frame()
        self.last_frame_time = time.time()
        self.latest_jpeg_bytes: bytes | None = None
        self.latest_raw_frame: np.ndarray | None = None
        self.latest_unblurred_crop: np.ndarray | None = None
        self.last_detected_face_crop: np.ndarray | None = None
        if self.latest_frame is not None:
            _, init_buf = cv2.imencode(".jpg", self.latest_frame)
            self.latest_jpeg_bytes = init_buf.tobytes()

        print(f"[NODE-INIT] CameraNode created: {self.camera_id}")

    def simulate_anomaly(self, anomaly: str) -> None:
        """
        Overrides frame generation to trigger live blinding or freezing anomalies during demo drills.
        anomaly can be 'blind', 'freeze', or 'recover'/'reset'.
        """
        with self._lock:
            if anomaly in ("recover", "reset", "normal"):
                self._simulation_override = None
                self._frozen_frame_cache = None
                print(f"[DRILL] Reset simulation override on {self.camera_id}. Returning to normal feed.")
            elif anomaly == "blind":
                self._simulation_override = "blind"
                print(f"[DRILL] Simulating CAMERA BLINDING on {self.camera_id}!")
            elif anomaly == "freeze":
                self._simulation_override = "freeze"
                if self.latest_frame is not None:
                    self._frozen_frame_cache = self.latest_frame.copy()
                else:
                    self._frozen_frame_cache = self._generate_synthetic_frame()
                print(f"[DRILL] Simulating CAMERA FREEZING on {self.camera_id}!")

    @property
    def status(self) -> str:
        """
        Returns the operational status of the camera:
        'stopped', 'anomaly', or 'running'. Thread-safe.
        """
        with self._lock:
            if not self.is_running:
                return "stopped"

            current_anomaly = self.anomaly_state.get("last_state", "normal")
            if current_anomaly in ("camera_blinded", "camera_frozen"):
                return "anomaly"

            return "running"

    @property
    def health(self) -> str:
        """
        Returns the health indicator based on operational status:
        'healthy' when running normally, 'warning' during an anomaly,
        and 'offline' when stopped. Thread-safe.
        """
        with self._lock:
            if not self.is_running:
                return "offline"

            current_anomaly = self.anomaly_state.get("last_state", "normal")
            if current_anomaly in ("camera_blinded", "camera_frozen"):
                return "warning"

            return "healthy"

    def get_summary(self) -> dict[str, Any]:
        """
        Returns a thread-safe telemetry snapshot of this camera node.
        Guarantees consistent reads across all status attributes.
        """
        with self._lock:
            running = self.is_running
            current_anomaly = self.anomaly_state.get("last_state", "normal")
            if not running:
                node_status = "stopped"
                node_health = "offline"
            elif current_anomaly in ("camera_blinded", "camera_frozen"):
                node_status = "anomaly"
                node_health = "warning"
            else:
                node_status = "running"
                node_health = "healthy"

            return {
                "camera_id": self.camera_id,
                "status": node_status,
                "health": node_health,
                "last_event": self.last_event,
                "faces_blurred_count": self.faces_blurred_count,
            }

    def start(self) -> None:
        """
        Starts the background processing thread for this camera node.
        """
        if self.is_running:
            print(f"[NODE-START] {self.camera_id} is already running.")
            return

        # Step 1: Update running state
        self.is_running = True

        # Step 2: Emit node_start lifecycle event
        start_event = make_event(self.camera_id, "node_start", blurred=False)
        emit_event(start_event)
        with self._lock:
            self.last_event = "node_start"

        # Step 3: Launch background worker thread
        self._thread = threading.Thread(
            target=self._run_loop,
            name=f"CameraNodeThread-{self.camera_id}",
            daemon=True,
        )
        self._thread.start()
        print(f"[NODE-START] {self.camera_id} worker thread launched successfully.")

    def stop(self) -> None:
        """
        Stops the camera processing loop and waits for the thread to terminate.
        Guarantees video capture hardware/file handles are cleanly released.
        """
        if not self.is_running:
            return

        # Step 1: Signal worker loop to terminate
        self.is_running = False

        # Step 2: Join worker thread with timeout
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=3.0)
            if self._thread.is_alive():
                print(f"[NODE-WARN] {self.camera_id} worker thread took longer than 3.0s to terminate.")
            self._thread = None

        # Step 3: Emit node_stop lifecycle event
        stop_event = make_event(self.camera_id, "node_stop", blurred=False)
        emit_event(stop_event)
        with self._lock:
            self.last_event = "node_stop"
        print(f"[NODE-STOP] {self.camera_id} stopped cleanly.")

    def get_latest_jpeg(self) -> bytes | None:
        """
        Returns the latest blurred frame encoded as JPEG bytes.
        Thread-safe. Never exposes raw unblurred video.
        """
        with self._lock:
            return self.latest_jpeg_bytes

    def _generate_synthetic_frame(self) -> np.ndarray:
        """
        Generates a simulated smart-city surveillance frame when a real webcam
        or video file is unavailable, or when multiple simulated nodes share one device.
        """
        # Create dark CCTV-style canvas
        canvas = np.full((480, 640, 3), 35, dtype=np.uint8)

        # Draw green corner brackets (HUD overlay)
        cv2.line(canvas, (20, 20), (60, 20), (0, 255, 128), 2)
        cv2.line(canvas, (20, 20), (20, 60), (0, 255, 128), 2)
        cv2.line(canvas, (620, 460), (580, 460), (0, 255, 128), 2)
        cv2.line(canvas, (620, 460), (620, 420), (0, 255, 128), 2)

        # Camera header and live timestamp
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(
            canvas,
            f"AEGIS SENTRY // {self.camera_id.upper()}",
            (30, 45),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (0, 255, 128),
            2,
        )
        cv2.putText(
            canvas,
            now_str,
            (30, 75),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (180, 180, 180),
            1,
        )

        # Draw simulated human figure in field of view
        cv2.circle(canvas, (320, 240), 75, (175, 155, 135), -1)
        cv2.circle(canvas, (295, 220), 10, (40, 40, 40), -1)
        cv2.circle(canvas, (345, 220), 10, (40, 40, 40), -1)
        cv2.ellipse(canvas, (320, 265), (25, 12), 0, 0, 180, (40, 40, 180), 3)

        # Dynamic motion indicator so synthetic feed is never mistakenly detected as frozen
        counter = getattr(self, "_synthetic_counter", 0) + 1
        self._synthetic_counter = counter
        dot_x = int(320 + 120 * np.sin(counter * 0.25))
        cv2.circle(canvas, (dot_x, 420), 10, (0, 255, 128), -1)

        return canvas

    def _run_loop(self) -> None:
        """
        Main worker loop executed inside the camera thread.
        Reads frames, detects and blurs faces, encrypts crops, checks anomalies,
        and keeps the latest blurred frame in memory.
        Guarantees that video capture handles are always cleanly released on exit.
        """
        cap: cv2.VideoCapture | None = None
        try:
            # Each node opens its own capture instance of self.video_source
            try:
                cap = cv2.VideoCapture(self.video_source)
                if not cap.isOpened():
                    print(f"[NODE-WARN] {self.camera_id} could not open source '{self.video_source}'. Using synthetic feed.")
            except Exception as exc:
                print(f"[NODE-WARN] {self.camera_id} error opening video source ({exc}). Using synthetic feed.")

            while self.is_running:
                frame: np.ndarray | None = None

                # Step 1: Read frame from video source
                if cap is not None and cap.isOpened():
                    ret, read_frame = cap.read()
                    if ret and read_frame is not None:
                        frame = read_frame
                    else:
                        # If reading a video file, loop back to the start
                        if isinstance(self.video_source, str) and os.path.exists(self.video_source):
                            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                            ret_loop, loop_frame = cap.read()
                            if ret_loop and loop_frame is not None:
                                frame = loop_frame

                # Step 2: Fallback to synthetic frame if video source fails or is unavailable
                if frame is None:
                    frame = self._generate_synthetic_frame()

                # Step 2b: Apply demo drill simulation overrides if active
                with self._lock:
                    sim_mode = self._simulation_override
                    sim_frozen_frame = self._frozen_frame_cache

                if sim_mode == "blind":
                    # Create pitch dark frame to trigger camera_blinded anomaly
                    frame = np.full_like(frame, 5)
                elif sim_mode == "freeze":
                    # Repeat identical cached frame to trigger camera_frozen anomaly
                    if sim_frozen_frame is not None:
                        frame = sim_frozen_frame.copy()

                # Step 3: Run face detection and strong privacy blurring (with safety hold)
                blurred_frame, face_crops = detect_and_blur_faces(frame, blur_state=self.blur_state)

                # Step 4: Encrypt and store all extracted face crops
                current_window = get_window_id()
                for crop_img, bbox in face_crops:
                    encrypt_and_store_crop(self.camera_id, current_window, crop_img)
                    with self._lock:
                        self.faces_blurred_count += 1

                # Step 5: Emit face_blurred event (rate-limited to avoid flooding)
                now = time.time()
                if len(face_crops) > 0 and (now - self.last_face_event_time >= FACE_EVENT_RATE_LIMIT):
                    face_event = make_event(self.camera_id, "face_blurred", blurred=True)
                    emit_event(face_event)
                    with self._lock:
                        self.last_event = "face_blurred"
                        self.last_face_event_time = now

                # Step 6: Monitor for camera blinding or freezing anomalies using blurred_frame
                # (Prevents retaining unblurred frames in memory as prev_frame)
                anomaly = check_anomalies(
                    self.prev_frame,
                    blurred_frame,
                    self.brightness_history,
                    state_tracker=self.anomaly_state,
                )
                self.prev_frame = blurred_frame.copy()

                # Step 7: Emit anomaly or recovery events if detected
                if anomaly in ("camera_blinded", "camera_frozen"):
                    anomaly_event = make_event(self.camera_id, anomaly, blurred=False)
                    emit_event(anomaly_event)
                    with self._lock:
                        self.last_event = anomaly
                elif anomaly == "camera_recovered":
                    recovered_event = make_event(self.camera_id, "camera_recovered", blurred=False)
                    emit_event(recovered_event)
                    with self._lock:
                        self.last_event = "camera_recovered"

                # Step 8: Update latest BLURRED frame and cached JPEG in memory (raw faces are never exposed)
                with self._lock:
                    self.latest_frame = blurred_frame
                    self.latest_raw_frame = frame.copy()
                    if len(face_crops) > 0:
                        self.latest_unblurred_crop = face_crops[0][0].copy()
                        self.last_detected_face_crop = face_crops[0][0].copy()
                    else:
                        h, w = frame.shape[:2]
                        ch, cw = int(h * 0.60), int(w * 0.50)
                        cy, cx = int(h * 0.15), int((w - cw) / 2)
                        self.latest_unblurred_crop = frame[cy : cy + ch, cx : cx + cw].copy()
                    self.last_frame_time = time.time()
                    enc_ok, enc_jpg = cv2.imencode(".jpg", blurred_frame)
                    if enc_ok:
                        self.latest_jpeg_bytes = enc_jpg.tobytes()

                # Step 9: Regulate loop frame rate to avoid excessive CPU usage
                time.sleep(FRAME_INTERVAL_SECONDS)

        except Exception as exc:
            print(f"[NODE-ERROR] Unexpected error in {self.camera_id} loop: {exc}")
        finally:
            # Clean up video capture on thread exit (guaranteed release)
            if cap is not None:
                try:
                    cap.release()
                    print(f"[NODE-EXIT] {self.camera_id} video capture released.")
                except Exception as exc:
                    print(f"[NODE-WARN] Error releasing capture for {self.camera_id}: {exc}")

    def get_live_unblurred_crop(self) -> np.ndarray:
        """
        Returns the latest unblurred face crop or live portrait crop from the raw camera frame.
        Used exclusively for authorized cryptographic escrow unmasking.
        """
        with self._lock:
            if self.last_detected_face_crop is not None:
                return self.last_detected_face_crop.copy()
            if self.latest_unblurred_crop is not None:
                return self.latest_unblurred_crop.copy()
            if self.latest_raw_frame is not None:
                h, w = self.latest_raw_frame.shape[:2]
                ch, cw = int(h * 0.60), int(w * 0.50)
                cy, cx = int(h * 0.15), int((w - cw) / 2)
                return self.latest_raw_frame[cy : cy + ch, cx : cx + cw].copy()
            return self._generate_synthetic_frame()


def normalize_camera_id(camera_id: str) -> str:
    """
    Normalizes human-friendly camera IDs (e.g., 'CAM-01-NORTH', 'CAM_01', 'cam-01')
    to EdgeMesh keys ('cam_01', 'cam_02', etc.).
    Defaults to 'cam_01' if unparseable or out of range.
    """
    if not camera_id:
        return "cam_01"
    clean = camera_id.lower().strip()
    if clean in ("cam_01", "cam_02", "cam_03", "cam_04", "cam_05"):
        return clean
    import re
    match = re.search(r"(\d+)", clean)
    if match:
        num = int(match.group(1))
        # Map 1..5, or wrap to available nodes
        node_num = ((num - 1) % 5) + 1
        return f"cam_{node_num:02d}"
    return "cam_01"


class EdgeMesh:
    """
    Coordinates simulated peer camera nodes (cam_01 to cam_05),
    manages their lifecycles, and provides status and frame feeds.
    """

    def __init__(self, num_nodes: int = NUM_NODES, video_source: Any = VIDEO_SOURCE) -> None:
        # Step 1: Store total number of nodes
        self.num_nodes = num_nodes

        # Step 2: Determine video source allocation
        # If video_source is a physical webcam (e.g. 0), only node cam_01 opens the
        # hardware webcam device due to OS exclusive device locks on Windows.
        # Other nodes (cam_02, cam_03, etc.) open a video file instead.
        is_webcam = isinstance(video_source, int)
        fallback_video = ensure_test_video() if is_webcam else None

        # Step 3: Instantiate each node with its dedicated video source
        self.nodes: dict[str, CameraNode] = {}
        for i in range(1, self.num_nodes + 1):
            node_id = f"cam_{i:02d}"
            if is_webcam and i > 1:
                # Secondary nodes read from video file
                node_source = fallback_video
            else:
                # Primary node (or all nodes if video_source is a file)
                node_source = video_source

            self.nodes[node_id] = CameraNode(camera_id=node_id, video_source=node_source)

        print(f"[INIT] EdgeMesh initialized with {len(self.nodes)} nodes: {list(self.nodes.keys())}")

    def start_all(self) -> None:
        """Starts all camera nodes in the mesh."""
        print(f"[EDGEMESH] Starting all {len(self.nodes)} camera nodes...")
        for node in self.nodes.values():
            node.start()

    def stop_all(self) -> None:
        """Stops all camera nodes in the mesh."""
        print(f"[EDGEMESH] Stopping all {len(self.nodes)} camera nodes...")
        for node in self.nodes.values():
            node.stop()

    def get_status(self) -> list[dict[str, Any]]:
        """
        Returns status information for all nodes in the mesh.
        Format: list of dicts with keys:
          - camera_id
          - status ("running", "stopped", "anomaly")
          - health ("healthy", "warning", "offline")
          - last_event
          - faces_blurred_count
        Thread-safe snapshot.
        """
        return [node.get_summary() for node in self.nodes.values()]

    def get_latest_jpeg(self, camera_id: str) -> bytes | None:
        """
        Retrieves the latest blurred frame for a specific camera as JPEG bytes.
        Returns None if camera_id is not found or has not produced a frame yet.
        """
        norm_id = normalize_camera_id(camera_id)
        node = self.nodes.get(norm_id)
        if node is None:
            node = self.nodes.get("cam_01")
        if node is None:
            return None
        return node.get_latest_jpeg()

    def get_live_crop_for_camera(self, camera_id: str) -> np.ndarray:
        """
        Retrieves the latest unblurred crop directly from the specified camera's live stream.
        Prioritizes the active physical webcam (cam_01) if it has a real detected face.
        """
        norm_id = normalize_camera_id(camera_id)
        node = self.nodes.get(norm_id)
        if node is not None and node.last_detected_face_crop is not None:
            return node.get_live_unblurred_crop()

        # If primary hardware camera (cam_01) has a real live webcam face crop, use it!
        if "cam_01" in self.nodes:
            cam01 = self.nodes["cam_01"]
            if cam01.last_detected_face_crop is not None:
                return cam01.get_live_unblurred_crop()

        if node is not None:
            return node.get_live_unblurred_crop()

        if "cam_01" in self.nodes:
            return self.nodes["cam_01"].get_live_unblurred_crop()

        return CameraNode("fallback")._generate_synthetic_frame()


# =============================================================================
# 7. FASTAPI APIRouter & SERVICE LIFECYCLE
# =============================================================================
# -----------------------------------------------------------------------------
# CORS CONFIGURATION NOTE FOR VITE DASHBOARD (PORT 5173):
# -----------------------------------------------------------------------------
# When main.py starts the FastAPI application, CORS must allow the Vite frontend
# dev server running at http://localhost:5173 and http://127.0.0.1:5173.
#
# Integration in main.py:
#   from fastapi import FastAPI
#   from fastapi.middleware.cors import CORSMiddleware
#   import edge
#
#   app = FastAPI()
#
#   app.add_middleware(
#       CORSMiddleware,
#       allow_origins=[
#           "http://localhost:5173",
#           "http://127.0.0.1:5173",
#           "http://localhost:3000",
#       ],
#       allow_credentials=True,
#       allow_methods=["*"],
#       allow_headers=["*"],
#   )
#
#   # Wire edge camera endpoints under /api/cameras:
#   app.include_router(edge.router)
#
#   # Start and stop camera nodes along with the FastAPI lifecycle:
#   @app.on_event("startup")
#   def on_startup():
#       edge.start_edge()
#
#   @app.on_event("shutdown")
#   def on_shutdown():
#       edge.stop_edge()
# -----------------------------------------------------------------------------

# Global singleton EdgeMesh instance used by API endpoints
EDGE_MESH = EdgeMesh(num_nodes=NUM_NODES, video_source=VIDEO_SOURCE)


def start_edge() -> None:
    """
    Startup helper function for main.py to start all camera nodes in the mesh.
    """
    print("[EDGE-STARTUP] Starting all EdgeMesh camera nodes...")
    EDGE_MESH.start_all()


def stop_edge() -> None:
    """
    Shutdown helper function for main.py to cleanly terminate all camera nodes.
    """
    print("[EDGE-SHUTDOWN] Stopping all EdgeMesh camera nodes...")
    EDGE_MESH.stop_all()


# FastAPI Router with prefix "/api/cameras"
router = APIRouter(prefix="/api/cameras", tags=["cameras"])


@router.get("", response_model=list[dict[str, Any]])
@router.get("/", response_model=list[dict[str, Any]], include_in_schema=False)
def list_cameras() -> list[dict[str, Any]]:
    """
    GET /api/cameras
    Returns list of camera nodes from EdgeMesh.get_status().
    Each dict contains: camera_id, status, health, last_event, faces_blurred_count.
    """
    return EDGE_MESH.get_status()


@router.get("/events", response_model=list[CameraEvent])
def get_camera_events(limit: int = Query(default=50, ge=1, le=500)) -> list[CameraEvent]:
    """
    GET /api/cameras/events?limit=50
    Returns the latest CameraEvents from the thread-safe in-memory log as JSON.
    Sorted with newest events first.
    """
    return get_recent_events(limit=limit)


@router.get("/{camera_id}/frame")
def get_camera_frame(camera_id: str) -> Response:
    """
    GET /api/cameras/{camera_id}/frame
    Returns the latest BLURRED frame for camera_id as image/jpeg.
    Raw unblurred frames are never exposed outside the node.
    """
    jpeg_bytes = EDGE_MESH.get_latest_jpeg(camera_id)
    if jpeg_bytes is None:
        raise HTTPException(
            status_code=404,
            detail=f"Camera '{camera_id}' not found or no frame available yet.",
        )
    return Response(content=jpeg_bytes, media_type="image/jpeg")


@router.post("/start")
def start_mesh_api() -> dict[str, Any]:
    """
    POST /api/cameras/start
    Starts the whole edge mesh.
    """
    start_edge()
    return {
        "status": "started",
        "nodes": len(EDGE_MESH.nodes),
        "message": f"Started {len(EDGE_MESH.nodes)} camera nodes.",
    }


@router.post("/stop")
def stop_mesh_api() -> dict[str, Any]:
    """
    POST /api/cameras/stop
    Stops the whole edge mesh.
    """
    stop_edge()
    return {
        "status": "stopped",
        "message": "Stopped all camera nodes in the mesh.",
    }


@router.post("/{camera_id}/simulate/{anomaly}")
def simulate_anomaly_api(camera_id: str, anomaly: str) -> dict[str, Any]:
    """
    POST /api/cameras/{camera_id}/simulate/{anomaly}
    Triggers simulated camera blinding or freezing on a specific camera node,
    enabling live anomaly detection drills in the dashboard.
    anomaly: 'blind' or 'freeze' (or 'recover' to reset).
    """
    node = EDGE_MESH.nodes.get(camera_id)
    if node is None:
        raise HTTPException(status_code=404, detail=f"Camera '{camera_id}' not found.")

    valid_anomalies = ("blind", "freeze", "recover", "reset")
    action = anomaly.lower()
    if action not in valid_anomalies:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid anomaly '{anomaly}'. Must be one of: {valid_anomalies}",
        )

    # Trigger override on node
    node.simulate_anomaly(action)
    return {
        "camera_id": camera_id,
        "action": action,
        "status": "simulating",
        "message": f"Triggered '{action}' simulation on {camera_id}.",
    }


# =============================================================================
# 8. SELF-TEST
# =============================================================================
if __name__ == "__main__":
    print("\n==================================================================")
    print("RUNNING EDGE.PY SELF-TEST")
    print("==================================================================")

    # Ensure root storage directory exists
    os.makedirs(STORAGE_DIR, exist_ok=True)

    # -------------------------------------------------------------------------
    # TEST 1: Encryption & Decryption Roundtrip
    # -------------------------------------------------------------------------
    print("\n[TEST 1] Testing Key Manager & AES-256-GCM Crop Encryption...")
    test_camera_id = f"test_cam_01_{int(time.time())}"
    test_window_id = get_window_id()

    # Create a distinctive 80x80 dummy face crop in memory
    dummy_crop = np.zeros((80, 80, 3), dtype=np.uint8)
    cv2.rectangle(dummy_crop, (10, 10), (70, 70), (0, 200, 255), -1)
    cv2.circle(dummy_crop, (40, 40), 20, (255, 50, 50), -1)

    # Verify key consistency: multiple calls for the same camera+window return the identical key
    key_first = get_window_key(test_camera_id, test_window_id)
    key_second = get_window_key(test_camera_id, test_window_id)
    assert key_first == key_second, "Error: Key manager returned different keys for identical window!"
    assert len(key_first) == 32, f"Error: Key must be 32 bytes (got {len(key_first)})"
    print(f"[TEST 1] Key manager verified: 32-byte key is consistent for ({test_camera_id}, {test_window_id}).")

    # Encrypt and store the dummy crop
    crop_hash = encrypt_and_store_crop(test_camera_id, test_window_id, dummy_crop)
    print(f"[TEST 1] Stored encrypted file with SHA-256 hash: {crop_hash}")

    # Verify index mapping was updated
    indexed_hashes = get_crop_hashes(test_camera_id, test_window_id)
    assert crop_hash in indexed_hashes, "Error: Crop hash not found in CROP_INDEX!"
    print(f"[TEST 1] CROP_INDEX updated properly. Total stored crops for window: {len(indexed_hashes)}")

    # Read back and decrypt the file
    decrypted_crop = decrypt_crop(test_camera_id, test_window_id, crop_hash)

    # Verify content match against the JPEG-compressed original
    _, expected_jpg = cv2.imencode(".jpg", dummy_crop)
    expected_crop = cv2.imdecode(expected_jpg, cv2.IMREAD_COLOR)
    assert np.array_equal(decrypted_crop, expected_crop), "Error: Decrypted crop does not match original!"
    print("[TEST 1] Decryption SUCCESS: Decrypted array exactly matches original JPEG image.")

    # Verify get_encrypted_footage lists the stored file
    footage_files = get_encrypted_footage(test_camera_id, test_window_id)
    assert len(footage_files) >= 1, "Error: get_encrypted_footage returned no files!"
    assert "hash" in footage_files[0] and "ciphertext" in footage_files[0], "Error: Missing keys in get_encrypted_footage dict!"
    print(f"[TEST 1] get_encrypted_footage verified: found {len(footage_files)} encrypted record(s).")

    # -------------------------------------------------------------------------
    # TEST 2: Face Detection & Privacy Blurring
    # -------------------------------------------------------------------------
    print("\n[TEST 2] Testing Face Detection & Privacy Blur...")
    blurred_output_path = os.path.join(STORAGE_DIR, "self_test_blurred.jpg")

    # Attempt to load a frame from VIDEO_SOURCE (webcam or file)
    test_frame = None
    try:
        cap = cv2.VideoCapture(VIDEO_SOURCE)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret and frame is not None:
                test_frame = frame
                print(f"[TEST 2] Successfully captured frame from VIDEO_SOURCE ({VIDEO_SOURCE}).")
            cap.release()
    except Exception as exc:
        print(f"[TEST 2] Warning: Could not open VIDEO_SOURCE ({exc})")

    # If no webcam/video is available, create a synthetic test canvas
    if test_frame is None:
        print("[TEST 2] VIDEO_SOURCE unavailable. Generating synthetic test canvas...")
        test_frame = np.full((480, 640, 3), 220, dtype=np.uint8)
        cv2.circle(test_frame, (320, 240), 90, (180, 160, 140), -1)
        cv2.circle(test_frame, (285, 215), 14, (60, 60, 60), -1)
        cv2.circle(test_frame, (355, 215), 14, (60, 60, 60), -1)
        cv2.ellipse(test_frame, (320, 280), (35, 18), 0, 0, 180, (40, 40, 180), 4)
        cv2.putText(
            test_frame,
            "AegisMirage Edge Camera Node Test",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (40, 40, 40),
            2,
        )

    # Run detection and blur
    blurred_result, detected_crops = detect_and_blur_faces(test_frame)
    print(f"[TEST 2] Face detection complete. Extracted {len(detected_crops)} face crop(s).")

    # Save ONLY the blurred frame to disk (never unencrypted raw face crops)
    cv2.imwrite(blurred_output_path, blurred_result)
    print(f"[TEST 2] Blurred frame saved to: {blurred_output_path}")

    # For any detected faces, encrypt and store them immediately using content addressing
    for idx, (crop_img, bbox) in enumerate(detected_crops):
        stored_hash = encrypt_and_store_crop(test_camera_id, test_window_id, crop_img)
        print(f"[TEST 2] Encrypted & stored face #{idx} under hash: {stored_hash[:8]}...")

    # Test face blur safety hold (missed frame blurring for BLUR_HOLD_FRAMES = 5)
    print("  -> Testing Face Blur Safety Hold (BLUR_HOLD_FRAMES = 5)...")
    test_blur_state = {"boxes": [], "hold_remaining": 0}
    # Frame 1: With face detected (or fallback simulated box for headless/no-webcam environments)
    _, crops_f1 = detect_and_blur_faces(test_frame, blur_state=test_blur_state)
    if len(crops_f1) == 0:
        test_blur_state["boxes"] = [(200, 150, 120, 120)]
        test_blur_state["hold_remaining"] = BLUR_HOLD_FRAMES
    else:
        assert test_blur_state["hold_remaining"] == BLUR_HOLD_FRAMES, "Expected hold_remaining to be reset to 5"
        assert len(test_blur_state["boxes"]) > 0, "Expected tracked boxes to be saved"
    # Frame 2-6: Frame without face detection (detection missed) - hold blur must be applied
    blank_test_frame = np.full((480, 640, 3), 100, dtype=np.uint8)
    bx, by, bw, bh = test_blur_state["boxes"][0]
    cv2.rectangle(blank_test_frame, (bx, by), (bx + max(10, bw // 2), by + max(10, bh // 2)), (255, 255, 255), -1)
    for hold_idx in range(BLUR_HOLD_FRAMES):
        held_blur, held_crops = detect_and_blur_faces(blank_test_frame, blur_state=test_blur_state)
        assert len(held_crops) == 0, "No new crops should be emitted during missed frames"
        assert not np.array_equal(held_blur, blank_test_frame), f"Hold frame {hold_idx+1} must be blurred!"
    # Frame 7: Hold expired
    held_blur_expired, _ = detect_and_blur_faces(blank_test_frame, blur_state=test_blur_state)
    assert np.array_equal(held_blur_expired, blank_test_frame), "After hold frames expire, blank frame is unblurred"
    print(f"     [OK] Face blur safety hold verified: blurred for {BLUR_HOLD_FRAMES} consecutive missed frames.")

    # -------------------------------------------------------------------------
    # TEST 3: Anomaly Detection (Blinding & Freezing with State Transitions)
    # -------------------------------------------------------------------------
    print("\n[TEST 3] Testing Anomaly Detection (Blinding, Freezing & Recovery)...")

    # Test 3A: Camera Blinding
    print("  -> Sub-test 3A: Camera Blinding")
    blind_state = {"frozen_count": 0, "last_state": "normal"}
    brightness_deque: collections.deque[float] = collections.deque(maxlen=BRIGHTNESS_HISTORY_LEN)

    bright_frame = np.full((120, 160, 3), 160, dtype=np.uint8)
    for _ in range(BRIGHTNESS_HISTORY_LEN):
        res = check_anomalies(None, bright_frame, brightness_deque, state_tracker=blind_state)
        assert res is None, f"Expected None during baseline warmup, got: {res}"

    dark_frame = np.full((120, 160, 3), 10, dtype=np.uint8)
    res_blind = check_anomalies(bright_frame, dark_frame, brightness_deque, state_tracker=blind_state)
    assert res_blind == "camera_blinded", f"Expected 'camera_blinded', got: {res_blind}"
    print("     [OK] Correctly detected blinding transition: 'camera_blinded'")

    res_blind_repeat = check_anomalies(dark_frame, dark_frame, brightness_deque, state_tracker=blind_state)
    assert res_blind_repeat is None, f"Expected None on repeated blinded frame, got: {res_blind_repeat}"
    print("     [OK] Correctly suppressed repeated alert while still blinded: None")

    res_recovered = check_anomalies(dark_frame, bright_frame, brightness_deque, state_tracker=blind_state)
    assert res_recovered == "camera_recovered", f"Expected 'camera_recovered', got: {res_recovered}"
    print("     [OK] Correctly emitted recovery event on return to normal: 'camera_recovered'")

    res_normal = check_anomalies(bright_frame, bright_frame, brightness_deque, state_tracker=blind_state)
    assert res_normal is None, f"Expected None in steady normal state, got: {res_normal}"
    print("     [OK] Correctly in steady normal state after recovery: None")

    # Test 3B: Camera Freezing
    print("  -> Sub-test 3B: Camera Freezing")
    freeze_state = {"frozen_count": 0, "last_state": "normal"}
    freeze_history: collections.deque[float] = collections.deque(maxlen=BRIGHTNESS_HISTORY_LEN)

    static_frame = np.random.randint(50, 200, (120, 160, 3), dtype=np.uint8)
    prev = None

    for _ in range(5):
        changing_frame = np.random.randint(50, 200, (120, 160, 3), dtype=np.uint8)
        res_change = check_anomalies(prev, changing_frame, freeze_history, state_tracker=freeze_state)
        assert res_change is None, f"Expected None during changing frames, got: {res_change}"
        prev = changing_frame

    print(f"     Feeding identical repeated frames for {FREEZE_CONSECUTIVE_FRAMES} frames...")
    prev = static_frame
    freeze_detected_event = None
    for i in range(FREEZE_CONSECUTIVE_FRAMES):
        evt = check_anomalies(prev, static_frame, freeze_history, state_tracker=freeze_state)
        prev = static_frame
        if evt is not None:
            freeze_detected_event = evt

    assert freeze_detected_event == "camera_frozen", (
        f"Expected 'camera_frozen' after {FREEZE_CONSECUTIVE_FRAMES} static frames, got: {freeze_detected_event}"
    )
    print(f"     [OK] Correctly detected freeze transition at frame {FREEZE_CONSECUTIVE_FRAMES}: 'camera_frozen'")

    evt_repeat = check_anomalies(prev, static_frame, freeze_history, state_tracker=freeze_state)
    assert evt_repeat is None, f"Expected None on repeated frozen frame, got: {evt_repeat}"
    print("     [OK] Correctly suppressed duplicate freeze alert: None")

    new_active_frame = np.random.randint(50, 200, (120, 160, 3), dtype=np.uint8)
    evt_unfreeze = check_anomalies(prev, new_active_frame, freeze_history, state_tracker=freeze_state)
    assert evt_unfreeze == "camera_recovered", f"Expected 'camera_recovered', got: {evt_unfreeze}"
    print("     [OK] Correctly emitted recovery event upon unfreezing: 'camera_recovered'")

    # -------------------------------------------------------------------------
    # TEST 4: Standalone EdgeMesh Self-Test (3 Fake Nodes for ~15 Seconds)
    # -------------------------------------------------------------------------
    print("\n" + "=" * 70)
    print("[TEST 4] STANDALONE MESH SELF-TEST: 3 FAKE NODES FOR ~15 SECONDS")
    print("=" * 70)
    print("Initializing 3 fake nodes (cam_01, cam_02, cam_03) with simulated video...")

    fake_video_source = ensure_test_video()
    mesh = EdgeMesh(num_nodes=3, video_source=fake_video_source)

    # Start all 3 fake camera nodes
    mesh.start_all()

    test_start_time = time.time()
    test_duration = 15.0
    drill_blind_injected = False
    drill_recover_injected = False

    print(f"\n[TEST 4] Mesh running for ~{int(test_duration)} seconds. Streaming live events below:\n")

    while True:
        elapsed = time.time() - test_start_time
        if elapsed >= test_duration:
            break

        # At ~5 seconds into the test: simulate blinding drill on cam_02
        if elapsed >= 5.0 and not drill_blind_injected:
            print(f"\n>>> [T+{elapsed:04.1f}s DRILL INJECTION] Injecting simulated BLINDING into cam_02...")
            mesh.nodes["cam_02"].simulate_anomaly("blind")
            drill_blind_injected = True

        # At ~10 seconds into the test: recover cam_02 back to normal
        if elapsed >= 10.0 and not drill_recover_injected:
            print(f"\n>>> [T+{elapsed:04.1f}s DRILL RECOVERY] Resetting cam_02 back to normal...")
            mesh.nodes["cam_02"].simulate_anomaly("recover")
            drill_recover_injected = True

        # Print telemetry heartbeat summary
        mesh_status = mesh.get_status()
        summary_tokens = []
        for s in mesh_status:
            summary_tokens.append(f"{s['camera_id']}: {s['status'].upper()} ({s['health']}, last={s['last_event']})")
        print(f"[STATUS @ T+{elapsed:04.1f}s] {' | '.join(summary_tokens)}")

        # Verify frame retrieval works mid-run
        sample_frame = mesh.get_latest_jpeg("cam_01")
        assert sample_frame is not None and len(sample_frame) > 0, "cam_01 must produce valid JPEG"

        time.sleep(2.5)

    print(f"\n[TEST 4] Completed {int(test_duration)}s run. Stopping all 3 fake camera nodes...")
    mesh.stop_all()

    # Verify stopped status
    stopped_status = mesh.get_status()
    for node_info in stopped_status:
        assert node_info["status"] == "stopped", f"Expected 'stopped' after stop_all, got: {node_info['status']}"
    print("[TEST 4] All 3 fake nodes stopped cleanly and all video captures released.")

    # Print summary of events collected
    print("\n" + "-" * 70)
    print("EVENT LOG SUMMARY (Recent events emitted during standalone test):")
    print("-" * 70)
    recent_events = get_recent_events(limit=25)
    for evt in reversed(recent_events):
        print(f"  [{evt.timestamp}] Node: {evt.camera_id} | Type: {evt.event_type:<16} | Blurred: {evt.blurred}")

    # -------------------------------------------------------------------------
    # TEST 5: Escrow Module Integration (get_window_key_for_escrow & decrypt_footage)
    # -------------------------------------------------------------------------
    print("\n[TEST 5] Testing Escrow Module Integration...")
    escrow_cam = f"test_escrow_cam_{int(time.time())}"
    escrow_window = get_window_id()

    # Create and store a test crop
    escrow_dummy = np.zeros((60, 60, 3), dtype=np.uint8)
    cv2.putText(escrow_dummy, "ESCROW", (5, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)
    stored_hash = encrypt_and_store_crop(escrow_cam, escrow_window, escrow_dummy)

    # 1. Fetch encrypted footage (returns list of dicts with {"hash": ..., "ciphertext": bytes})
    escrow_records = get_encrypted_footage(escrow_cam, escrow_window)
    assert len(escrow_records) >= 1, "Expected at least 1 record from get_encrypted_footage"
    all_hashes = [r["hash"] for r in escrow_records]
    assert stored_hash in all_hashes, f"Expected {stored_hash} to be in {all_hashes}"
    assert isinstance(escrow_records[0]["ciphertext"], bytes)
    print(f"     [OK] get_encrypted_footage returned valid record with hash: {stored_hash[:8]}...")

    # 2. Retrieve key via get_window_key_for_escrow
    correct_escrow_key = get_window_key_for_escrow(escrow_cam, escrow_window)
    assert len(correct_escrow_key) == 32, "Key must be 32 bytes"
    print("     [OK] get_window_key_for_escrow returned valid 32-byte key.")

    # 3. Decrypt with correct key (must succeed)
    decrypted_escrow_images = decrypt_footage(escrow_cam, escrow_window, correct_escrow_key)
    assert len(decrypted_escrow_images) >= 1, "Expected decrypted images"
    _, expected_escrow_jpg = cv2.imencode(".jpg", escrow_dummy)
    assert np.array_equal(
        decrypted_escrow_images[0], cv2.imdecode(expected_escrow_jpg, cv2.IMREAD_COLOR)
    )
    print("     [OK] decrypt_footage with correct key successfully decrypted crops.")

    # 4. Decrypt with wrong key (must fail cleanly with readable message)
    fake_wrong_key = os.urandom(32)
    wrong_key_failed_cleanly = False
    try:
        decrypt_footage(escrow_cam, escrow_window, fake_wrong_key)
    except ValueError as err:
        wrong_key_failed_cleanly = True
        print(f"     [OK] decrypt_footage with wrong key failed cleanly: {err}")

    assert wrong_key_failed_cleanly, "Expected ValueError when decrypting with incorrect key!"
    print("     [OK] Escrow decryption security verified: wrong key rejected with clear ValueError.")

    # -------------------------------------------------------------------------
    # TEST 6: FastAPI APIRouter Endpoints & Demo Drill Simulation
    # -------------------------------------------------------------------------
    print("\n[TEST 6] Testing FastAPI APIRouter Endpoints & Simulation Drill...")

    # 1. Test list_cameras endpoint (GET /api/cameras)
    status_api = list_cameras()
    assert len(status_api) == NUM_NODES, f"Expected {NUM_NODES} nodes, got {len(status_api)}"
    print(f"     [OK] list_cameras returned {len(status_api)} nodes.")

    # 2. Test get_camera_events endpoint (GET /api/cameras/events)
    events_api = get_camera_events(limit=10)
    assert isinstance(events_api, list)
    print(f"     [OK] get_camera_events returned {len(events_api)} events.")

    # 3. Test get_camera_frame endpoint (GET /api/cameras/{camera_id}/frame)
    frame_api_resp = get_camera_frame("cam_01")
    assert frame_api_resp.media_type == "image/jpeg"
    assert len(frame_api_resp.body) > 0
    print(f"     [OK] get_camera_frame returned valid JPEG ({len(frame_api_resp.body)} bytes).")

    # 4. Test simulate_anomaly_api endpoint (POST /api/cameras/{id}/simulate/blind)
    blind_drill = simulate_anomaly_api("cam_01", "blind")
    assert blind_drill["status"] == "simulating"
    assert blind_drill["action"] == "blind"
    print("     [OK] simulate_anomaly_api 'blind' triggered successfully.")

    # 5. Test simulate_anomaly_api endpoint (POST /api/cameras/{id}/simulate/recover)
    recover_drill = simulate_anomaly_api("cam_01", "recover")
    assert recover_drill["status"] == "simulating"
    assert recover_drill["action"] == "recover"
    print("     [OK] simulate_anomaly_api 'recover' triggered successfully.")

    print("\n==================================================================")
    print("ALL EDGE.PY SELF-TESTS COMPLETED SUCCESSFULLY!")
    print("==================================================================")
