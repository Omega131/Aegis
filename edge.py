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
from typing import Any

# Cryptography for authenticated symmetric encryption (AES-256-GCM)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Computer vision and face detection libraries
import cv2
import mediapipe as mp
import numpy as np

# Shared schema contract for camera events
from schema import CameraEvent


# =============================================================================
# 1. CONFIGURATION
# =============================================================================
# Number of simulated edge camera nodes
NUM_NODES = 5

# Time window duration in seconds (600 seconds = 10 minutes)
WINDOW_SECONDS = 600

# Path to a test video file (e.g., "test_video.mp4") or 0 for the default webcam
VIDEO_SOURCE = 0

# Local directory path used for storing encrypted crops and metadata
STORAGE_DIR = "edge_storage/"


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


# =============================================================================
# 3. FACE DETECTION & PRIVACY BLURRING (MediaPipe)
# =============================================================================
# We use MediaPipe Face Detection because the BlazeFace model weights are
# bundled directly inside the pip package wheel. This avoids any external ONNX
# or weights download steps (unlike OpenCV YuNet which requires downloading
# face_detection_yunet_2023mar.onnx from an external server).

_FACE_DETECTOR_LOCK = threading.Lock()
_FACE_DETECTOR: mp.solutions.face_detection.FaceDetection | None = None


def _get_face_detector() -> mp.solutions.face_detection.FaceDetection:
    """
    Returns a thread-safe shared MediaPipe FaceDetection instance.
    model_selection=0 is optimized for short-range faces (within 2 meters),
    ideal for IoT/surveillance camera feeds.
    """
    global _FACE_DETECTOR
    with _FACE_DETECTOR_LOCK:
        if _FACE_DETECTOR is None:
            # Step 1: Access MediaPipe's face detection solution
            mp_face_detection = mp.solutions.face_detection
            # Step 2: Instantiate detector (model_selection=0, confidence threshold 0.5)
            _FACE_DETECTOR = mp_face_detection.FaceDetection(
                model_selection=0,
                min_detection_confidence=0.5,
            )
            print("[INIT] MediaPipe Face Detection initialized successfully.")
    return _FACE_DETECTOR


def detect_and_blur_faces(
    frame: np.ndarray,
) -> tuple[np.ndarray, list[tuple[np.ndarray, tuple[int, int, int, int]]]]:
    """
    Detects human faces in a BGR OpenCV frame, extracts original crops,
    and applies strong privacy blur to ensure no unblurred face is returned.

    Parameters:
        frame: Input BGR image (OpenCV numpy array)

    Returns:
        tuple (blurred_frame, face_crops):
            - blurred_frame: A copy of the frame with all detected faces blurred.
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

    # Step 4: Get image dimensions (height, width, channels)
    img_height, img_width = frame.shape[:2]

    # Step 5: Convert BGR frame to RGB because MediaPipe requires RGB format
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # Step 6: Run MediaPipe face detector on the RGB frame
    detector = _get_face_detector()
    results = detector.process(rgb_frame)

    # Step 7: Check if any faces were detected
    if not results.detections:
        # No faces detected; return copy of frame and empty crops list
        return blurred_frame, face_crops

    # Step 8: Loop through every detected face
    for detection in results.detections:
        # Step 8a: Extract relative bounding box from MediaPipe detection
        bbox = detection.location_data.relative_bounding_box
        raw_x = int(bbox.xmin * img_width)
        raw_y = int(bbox.ymin * img_height)
        raw_w = int(bbox.width * img_width)
        raw_h = int(bbox.height * img_height)

        # Step 8b: Clamp bounding box coordinates to ensure they stay within image bounds
        x = max(0, raw_x)
        y = max(0, raw_y)
        w = min(raw_w, img_width - x)
        h = min(raw_h, img_height - y)

        # Step 8c: Skip invalid or tiny zero-area bounding boxes
        if w <= 4 or h <= 4:
            continue

        # Step 8d: Extract the ORIGINAL unblurred face crop from the original frame
        original_crop = frame[y : y + h, x : x + w].copy()
        face_crops.append((original_crop, (x, y, w, h)))

        # Step 8e: Apply strong privacy blur (pixelation + Gaussian blur) to the ROI
        face_roi = blurred_frame[y : y + h, x : x + w]

        # Strong pixelation: shrink ROI to 1/10th size then blow it back up
        small_w = max(1, w // 10)
        small_h = max(1, h // 10)
        temp_small = cv2.resize(face_roi, (small_w, small_h), interpolation=cv2.INTER_LINEAR)
        pixelated_roi = cv2.resize(temp_small, (w, h), interpolation=cv2.INTER_NEAREST)

        # Gaussian blur pass on top of pixelation to prevent any reconstruction
        kernel_size = min(31, max(5, (min(w, h) // 4) * 2 + 1))
        unrecognizable_roi = cv2.GaussianBlur(pixelated_roi, (kernel_size, kernel_size), 0)

        # Step 8f: Replace the face area in blurred_frame with the blurred ROI
        blurred_frame[y : y + h, x : x + w] = unrecognizable_roi

    # Step 9: Print event summary if faces were processed
    if len(face_crops) > 0:
        print(f"[EDGE-CV] Processed {len(face_crops)} face(s): crops in memory, frame blurred.")

    # Step 10: Return the fully blurred frame and the extracted unblurred crops
    return blurred_frame, face_crops


# =============================================================================
# 4. ENCRYPTION, KEY MANAGEMENT & CONTENT-ADDRESSED STORAGE
# =============================================================================
# -----------------------------------------------------------------------------
# CRYPTOGRAPHY BACKGROUND & DESIGN EXPLANATION:
#
# 1. AES-GCM (Galois/Counter Mode):
#    AES-GCM is an "Authenticated Encryption with Associated Data" (AEAD) cipher.
#    Unlike older modes (like CBC or ECB), AES-GCM guarantees both:
#      - Confidentiality: No one can inspect or view the raw face crop without
#        possessing the 32-byte secret key.
#      - Authenticity / Integrity: An authentication tag (16 bytes) is generated
#        alongside the ciphertext. If even a single bit of the file on disk is
#        tampered with, decryption will immediately raise an error.
#
# 2. Why the Nonce Must Be Unique:
#    "Nonce" stands for "Number used ONCE". In GCM mode, the key and nonce
#    together generate a pseudo-random keystream. If the exact same key and
#    nonce are ever reused to encrypt two different face crops, the keystream
#    is identical. An attacker can XOR the two ciphertexts together, removing
#    the encryption and exposing the underlying data!
#    Therefore, we generate a fresh, cryptographically random 12-byte nonce
#    for EVERY single crop.
#
# 3. What "Content Addressing" Means Here:
#    Instead of naming stored files with arbitrary sequential numbers (like
#    crop1.bin, crop2.bin) or timestamps, each file is named after the SHA-256
#    hash of its encrypted payload (<sha256>.bin).
#    This provides:
#      - Deduplication: Identical encrypted payloads cannot collide or duplicate.
#      - Self-Verification: The file's integrity can be checked by hashing its
#        contents and verifying that it matches the filename.
#      - Tamper-Evidence: Modifying the file on disk invalidates its filename.
# -----------------------------------------------------------------------------

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
    # Storing the nonce together with ciphertext allows the recipient to decrypt it later
    payload = nonce + ciphertext_with_tag

    # Step 6: Compute the SHA-256 hash of the ciphertext for content addressing
    sha256_hash = hashlib.sha256(ciphertext_with_tag).hexdigest()

    # Step 7: Prepare the local filesystem directory path (e.g., edge_storage/cam-01/2026-10-24T14-30/)
    target_dir = _get_window_storage_dir(camera_id, window_id)
    os.makedirs(target_dir, exist_ok=True)

    # Step 8: Save the encrypted payload to disk using content addressing: <sha256>.bin
    # Note: RAW UNENCRYPTED FACES ARE NEVER WRITTEN TO DISK!
    file_path = os.path.join(target_dir, f"{sha256_hash}.bin")
    with open(file_path, "wb") as f:
        f.write(payload)

    # Step 9: Update the in-memory index mapping (camera_id, window_id) -> list of hashes
    with CROP_INDEX_LOCK:
        idx_key = (camera_id, window_id)
        if idx_key not in CROP_INDEX:
            CROP_INDEX[idx_key] = []
        CROP_INDEX[idx_key].append(sha256_hash)

    print(
        f"[STORAGE] Stored encrypted crop: {file_path} "
        f"(Camera: {camera_id}, Window: {window_id}, Hash: {sha256_hash[:8]}...)"
    )

    # Step 10: Return the computed SHA-256 hash string
    return sha256_hash


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


def get_encrypted_footage(camera_id: str, window_id: str) -> list[str]:
    """
    Retrieves stored encrypted footage crops for a specific camera and window.
    Returns a list of file paths to the encrypted .bin files.
    """
    # Step 1: Look up directory on disk
    target_dir = _get_window_storage_dir(camera_id, window_id)
    if not os.path.isdir(target_dir):
        return []

    # Step 2: Collect all .bin files in alphabetical order
    bin_files: list[str] = []
    for entry in sorted(os.listdir(target_dir)):
        if entry.endswith(".bin"):
            bin_files.append(os.path.join(target_dir, entry))

    return bin_files


# =============================================================================
# 5. REMAINING PLACEHOLDERS
# =============================================================================
class CameraNode:
    """
    Represents an individual simulated edge camera node running in its own thread.
    """

    def __init__(self, camera_id: str, video_source: Any = VIDEO_SOURCE) -> None:
        # Step 1: Save the camera identifier
        self.camera_id = camera_id
        # Step 2: Save the video source (webcam index or video path)
        self.video_source = video_source
        # Step 3: Flag indicating if the camera node loop is running
        self.is_running = False
        print(f"[INIT] CameraNode created: {self.camera_id}")

    def start(self) -> None:
        """Starts the camera capture and processing loop."""
        pass

    def stop(self) -> None:
        """Stops the camera capture and processing loop."""
        pass


def check_anomalies(camera_id: str, face_count: int) -> list[str]:
    """
    Checks for edge anomalies (e.g. loitering, crowding, tampering).
    Placeholder: returns an empty list of detected anomaly tags.
    """
    return []


class EdgeMesh:
    """
    Coordinates simulated peer camera nodes and monitors network health.
    """

    def __init__(self, num_nodes: int = NUM_NODES) -> None:
        # Step 1: Store total number of nodes
        self.num_nodes = num_nodes
        # Step 2: Internal map of active CameraNode instances
        self.nodes: dict[str, CameraNode] = {}
        print(f"[INIT] EdgeMesh initialized with {self.num_nodes} node slots")

    def start_all(self) -> None:
        """Starts all camera nodes in the mesh."""
        pass

    def stop_all(self) -> None:
        """Stops all camera nodes in the mesh."""
        pass


# =============================================================================
# 6. SELF-TEST
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
    test_camera_id = "camera-node-01"
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
    indexed_hashes = CROP_INDEX.get((test_camera_id, test_window_id), [])
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
    print(f"[TEST 1] get_encrypted_footage verified: found {len(footage_files)} encrypted .bin file(s).")

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

    print("\n==================================================================")
    print("ALL EDGE.PY SELF-TESTS COMPLETED SUCCESSFULLY!")
    print("==================================================================")
