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

# Rate limit for emitting 'face_blurred' events in seconds (prevents event flood)
FACE_EVENT_RATE_LIMIT = 3.0

# Simulated camera loop frame interval (0.06 seconds ~= 16 FPS)
FRAME_INTERVAL_SECONDS = 0.06

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
# Real-world video feeds always have sensor noise; diff < 0.5 indicates a repeated/stuck frame buffer.
FREEZE_DIFF_THRESHOLD = 0.5

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
    if len(brightness_history) >= 5:
        rolling_avg = float(np.mean(brightness_history))
        if rolling_avg >= BLINDING_MIN_BASELINE:
            drop_ratio = (rolling_avg - curr_brightness) / rolling_avg
            if drop_ratio >= BLINDING_DROP_RATIO:
                is_blinded = True

    # Step 5: Update the brightness history with current frame's brightness
    if isinstance(brightness_history, collections.deque):
        brightness_history.append(curr_brightness)
    elif isinstance(brightness_history, list):
        brightness_history.append(curr_brightness)
        if len(brightness_history) > BRIGHTNESS_HISTORY_LEN:
            brightness_history.pop(0)

    # Step 6: Check for Camera Freezing (Difference between consecutive frames)
    is_frozen = False
    if prev_frame is not None and prev_frame.shape == curr_frame.shape:
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

        print(f"[NODE-INIT] CameraNode created: {self.camera_id}")

    @property
    def status(self) -> str:
        """
        Returns the operational status of the camera:
        'stopped', 'anomaly', or 'running'.
        """
        if not self.is_running:
            return "stopped"

        current_anomaly = self.anomaly_state.get("last_state", "normal")
        if current_anomaly in ("camera_blinded", "camera_frozen"):
            return "anomaly"

        return "running"

    @property
    def health(self) -> str:
        """
        Returns the health indicator based on recent frame processing activity:
        'healthy', 'degraded', or 'offline'.
        """
        if not self.is_running:
            return "offline"

        # If a frame was processed within the last 3 seconds, node is healthy
        if time.time() - self.last_frame_time < 3.0:
            return "healthy"

        return "degraded"

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
        """
        if not self.is_running:
            return

        # Step 1: Signal loop to terminate
        self.is_running = False

        # Step 2: Join thread with timeout
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=2.0)
            self._thread = None

        # Step 3: Emit node_stop lifecycle event
        stop_event = make_event(self.camera_id, "node_stop", blurred=False)
        emit_event(stop_event)
        self.last_event = "node_stop"
        print(f"[NODE-STOP] {self.camera_id} stopped cleanly.")

    def get_latest_jpeg(self) -> bytes | None:
        """
        Returns the latest blurred frame encoded as JPEG bytes.
        Thread-safe. Never exposes raw unblurred video.
        """
        with self._lock:
            if self.latest_frame is None:
                return None
            success, encoded_jpg = cv2.imencode(".jpg", self.latest_frame)
            if success:
                return encoded_jpg.tobytes()
            return None

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

        return canvas

    def _run_loop(self) -> None:
        """
        Main worker loop executed inside the camera thread.
        Reads frames, detects and blurs faces, encrypts crops, checks anomalies,
        and keeps the latest blurred frame in memory.
        """
        cap: cv2.VideoCapture | None = None
        try:
            cap = cv2.VideoCapture(self.video_source)
        except Exception as exc:
            print(f"[NODE-WARN] {self.camera_id} could not open video source ({exc}). Using synthetic feed.")

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

            # Step 3: Run face detection and strong privacy blurring
            blurred_frame, face_crops = detect_and_blur_faces(frame)

            # Step 4: Encrypt and store all extracted face crops
            current_window = get_window_id()
            for crop_img, bbox in face_crops:
                encrypt_and_store_crop(self.camera_id, current_window, crop_img)
                self.faces_blurred_count += 1

            # Step 5: Emit face_blurred event (rate-limited to avoid flooding)
            now = time.time()
            if len(face_crops) > 0 and (now - self.last_face_event_time >= FACE_EVENT_RATE_LIMIT):
                face_event = make_event(self.camera_id, "face_blurred", blurred=True)
                emit_event(face_event)
                self.last_event = "face_blurred"
                self.last_face_event_time = now

            # Step 6: Monitor for camera blinding or freezing anomalies
            anomaly = check_anomalies(
                self.prev_frame,
                frame,
                self.brightness_history,
                state_tracker=self.anomaly_state,
            )
            self.prev_frame = frame.copy()

            # Step 7: Emit anomaly or recovery events if detected
            if anomaly in ("camera_blinded", "camera_frozen"):
                anomaly_event = make_event(self.camera_id, anomaly, blurred=False)
                emit_event(anomaly_event)
                self.last_event = anomaly
            elif anomaly == "camera_recovered":
                recovered_event = make_event(self.camera_id, "recovered", blurred=False)
                emit_event(recovered_event)
                self.last_event = "recovered"

            # Step 8: Update latest BLURRED frame in memory (raw faces are never exposed)
            with self._lock:
                self.latest_frame = blurred_frame
                self.last_frame_time = time.time()

            # Step 9: Regulate loop frame rate to avoid excessive CPU usage
            time.sleep(FRAME_INTERVAL_SECONDS)

        # Clean up video capture on thread exit
        if cap is not None and cap.isOpened():
            cap.release()
            print(f"[NODE-EXIT] {self.camera_id} video capture released.")


class EdgeMesh:
    """
    Coordinates simulated peer camera nodes (cam_01 to cam_05),
    manages their lifecycles, and provides status and frame feeds.
    """

    def __init__(self, num_nodes: int = NUM_NODES, video_source: Any = VIDEO_SOURCE) -> None:
        # Step 1: Store total number of nodes
        self.num_nodes = num_nodes

        # Step 2: Internal map of active CameraNode instances: cam_01 .. cam_05
        self.nodes: dict[str, CameraNode] = {}
        for i in range(1, self.num_nodes + 1):
            node_id = f"cam_{i:02d}"
            self.nodes[node_id] = CameraNode(camera_id=node_id, video_source=video_source)

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
          - health ("healthy", "degraded", "offline")
          - last_event
          - faces_blurred_count
        """
        status_list: list[dict[str, Any]] = []
        for node in self.nodes.values():
            status_list.append(
                {
                    "camera_id": node.camera_id,
                    "status": node.status,
                    "health": node.health,
                    "last_event": node.last_event,
                    "faces_blurred_count": node.faces_blurred_count,
                }
            )
        return status_list

    def get_latest_jpeg(self, camera_id: str) -> bytes | None:
        """
        Retrieves the latest blurred frame for a specific camera as JPEG bytes.
        Returns None if camera_id is not found or has not produced a frame yet.
        """
        node = self.nodes.get(camera_id)
        if node is None:
            return None
        return node.get_latest_jpeg()


# =============================================================================
# 7. SELF-TEST
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
    # TEST 4: EdgeMesh & CameraNode Lifecycles
    # -------------------------------------------------------------------------
    print("\n[TEST 4] Testing CameraNode & EdgeMesh Multi-Node Orchestration...")
    mesh = EdgeMesh(num_nodes=3)

    # Start all camera nodes
    mesh.start_all()

    # Let nodes process frames and emit initial events
    time.sleep(0.5)

    # Check status report
    mesh_status = mesh.get_status()
    print(f"[TEST 4] Mesh status report: {mesh_status}")
    assert len(mesh_status) == 3, f"Expected 3 nodes in status list, got: {len(mesh_status)}"

    for node_info in mesh_status:
        assert node_info["status"] in ("running", "anomaly"), f"Unexpected node status: {node_info['status']}"
        assert node_info["health"] in ("healthy", "degraded"), f"Unexpected node health: {node_info['health']}"
        assert node_info["last_event"] in ("node_start", "face_blurred", "normal"), (
            f"Unexpected last event: {node_info['last_event']}"
        )

    # Test JPEG frame retrieval
    frame_bytes = mesh.get_latest_jpeg("cam_01")
    assert frame_bytes is not None and len(frame_bytes) > 0, "Expected valid JPEG bytes from cam_01"
    print(f"[TEST 4] Successfully retrieved latest blurred frame for cam_01 ({len(frame_bytes)} bytes).")

    # Stop all camera nodes cleanly
    mesh.stop_all()

    # Verify stopped status
    stopped_status = mesh.get_status()
    for node_info in stopped_status:
        assert node_info["status"] == "stopped", f"Expected 'stopped' after stop_all, got: {node_info['status']}"
    print("[TEST 4] All mesh nodes stopped successfully.")

    print("\n==================================================================")
    print("ALL EDGE.PY SELF-TESTS COMPLETED SUCCESSFULLY!")
    print("==================================================================")
