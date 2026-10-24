# EDGE_HANDOFF.md

## 1. Escrow Functions (for Member C)
`edge.py` provides three functions for the escrow module (`escrow.py`):

1. **`get_window_key_for_escrow(camera_id: str, window_id: str) -> bytes`**
   - Retrieves the 32-byte raw AES-256 symmetric key for splitting into Shamir shares.
   - Example:
     ```python
     key = edge.get_window_key_for_escrow("cam_01", "2026-10-24T14:30")
     ```

2. **`get_encrypted_footage(camera_id: str, window_id: str) -> list[dict[str, Any]]`**
   - Fetches all stored ciphertext payloads for that camera and window without needing a key. Each dict contains `{"hash": str, "ciphertext": bytes}`.
   - Example:
     ```python
     records = edge.get_encrypted_footage("cam_01", "2026-10-24T14:30")
     ```

3. **`decrypt_footage(camera_id: str, window_id: str, key: bytes) -> list[np.ndarray]`**
   - Decrypts stored face crops using the reconstructed 32-byte key. Returns unblurred BGR OpenCV images; raises `ValueError` if the key is invalid or data is corrupt.
   - Example:
     ```python
     images = edge.decrypt_footage("cam_01", "2026-10-24T14:30", reconstructed_key)
     ```

---

## 2. Integration Lines for `main.py`
Add the following lines to `main.py`:

```python
# 1. Mount API routes
app.include_router(edge.router)

# 2. Lifecycle hooks
@app.on_event("startup")
def startup_event():
    edge.start_edge()

@app.on_event("shutdown")
def shutdown_event():
    edge.stop_edge()
```

---

## 3. Dependencies (`requirements.txt`)
Required libraries for `edge.py`:
```text
opencv-python>=4.8.0
numpy>=1.24.0
cryptography>=41.0.0
```
> **Note:** `mediapipe` is no longer used. Face detection uses OpenCV YuNet (`cv2.FaceDetectorYN`).

---

## 4. Model Weights File
`face_detection_yunet_2023mar.onnx` must sit in the same directory as `edge.py` (project root).

---

## 5. API Routes & Emitted Event Types

### API Routes under `/api/cameras`
- `GET /api/cameras`: Returns telemetry snapshots of all mesh nodes (`camera_id`, `status`, `health`, `last_event`, `faces_blurred_count`).
- `GET /api/cameras/events?limit=50`: Returns audit log of recent `CameraEvent` items.
- `GET /api/cameras/{camera_id}/frame`: Returns latest blurred frame as JPEG image.
- `POST /api/cameras/start`: Starts the background camera mesh.
- `POST /api/cameras/stop`: Stops the camera mesh and releases capture devices.
- `POST /api/cameras/{camera_id}/simulate/{anomaly}`: Injects simulated drill (`blind`, `freeze`, or `recover`).

### Event Types Emitted (`CameraEvent.event_type`)
- `node_start`: Node initialized and background loop started (`blurred=False`).
- `node_stop`: Node stopped cleanly (`blurred=False`).
- `face_blurred`: Faces detected, cropped, encrypted to storage, and obscured (`blurred=True`).
- `camera_blinded`: Physical lens blinding detected via >=60% brightness drop (`blurred=False`).
- `camera_frozen`: Video feed freeze detected via repeated static frames (`blurred=False`).
- `camera_recovered`: Node returned to normal operation following an anomaly (`blurred=False`).
