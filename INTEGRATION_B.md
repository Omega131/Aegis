# Person B — Shared Integration Guide (Stage 2: Phantom Twin)

**Author:** Member B (Gateway & Honeypot Decoys)  
**Branch:** `honeypot`  
**Shared Schema:** `schema.py` (Untouched, strictly preserved)

---

## 1. Overview of Delivered Components

| Module | Core Responsibility | Shared Schema Models |
|---|---|---|
| `gateway.py` | Connection scoring, allowlisting, fail-safe rate limiting, sticky routing, and handler dispatch | Produces `schema.RouteDecision` |
| `decoy.py` | Virtual camera filesystem, safe web admin portal, honeytokens, IOC extractor, pub/sub session emitter | Produces `schema.DecoySessionEvent` |
| `ssh_decoy.py` | Real `asyncssh` protocol listener on port `2222` (loopback), line-buffered terminal, zero host execution | Feeds `decoy.py` |
| `dev_harness.py` | Standalone FastAPI harness for independent Person B testing and demo rehearsal | Mounts routers |

---

## 2. Exact Changes to Wire into Shared `main.py`

When the team performs the sync checkpoint merge, add the following lines to `main.py`:

```python
# 1. Mount Person B API Routers
app.include_router(gateway.gateway_router)
app.include_router(decoy.decoy_router)

# 2. (Optional) Register Person B async lifespan for background SSH Decoy
# In main.py's lifespan context manager:
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await decoy.startup(host="127.0.0.1", port=2222, start_ssh=True)
    yield
    # Shutdown
    await decoy.shutdown()
```

That is all. No modifications to `edge.py`, `intel.py`, `escrow.py`, or `schema.py` are needed.

---

## 3. Interface for Member C (`intel.py` — Campaign Clustering)

Member C can consume `DecoySessionEvent` instances in two ways:

### Option A: Real-Time Event Subscription (Recommended)
Register a callback to receive events as they occur (on login attempts, commands, honeytoken hits, file evidence uploads, and disconnects):

```python
import decoy
import schema

def handle_session_event(event: schema.DecoySessionEvent) -> None:
    print(f"[Intel] Ingesting event from {event.source_ip} (Session: {event.session_id})")
    # Feed into Member C's clustering graph
    clustering_engine.ingest_event(event)

# Register the callback:
decoy.register_session_listener(handle_session_event)
```

### Option B: Pull / Polling Active Sessions
```python
import decoy

# Retrieve snapshot of all current session events:
events = decoy.get_active_sessions()

# Or query a specific session:
event = decoy.get_session_by_id("sess-abc12345")
```

### Option C: Full Provenance Report for Campaign Clustering
Member C can inspect multi-indicator records and full upload provenance:
```python
prov = decoy.get_session_provenance("sess-abc12345")
# prov["file_submissions"] -> list of uploaded artifacts with full SHA-256/MD5 and candidate indicators
# prov["referenced_urls"]   -> candidate URLs observed in command-line arguments (distinct from uploads)
# prov["referenced_files"]  -> candidate file paths referenced in commands (distinct from uploads)
```
Or via HTTP: `GET /api/decoy/provenance/{session_id}`.

---

## 4. Honeytokens & Static File Evidence Collection

### Honeytoken Trap Architecture
Fictional bait files are planted at multiple filesystem depths within `VIRTUAL_FS`:
- **Depth 1:** `/emergency_token.cfg` (Master grid access token canary)
- **Depth 2:** `/etc/camera/credentials.conf` (Master camera cloud sync canary)
- **Depth 3:** `/root/keys/vault_token.key` (Infrastructure secrets canary)
- **Depth 3:** `/var/backup/firmware_pass.enc` (Encrypted firmware canary)
- **Depth 3:** `/home/operator/.aws_keys` (Cloud storage access canary)

**Access Operations & Trigger Policy:**
- **Triggering Operations:** Explicit content reading verbs (`cat`, `head`, `tail`, `more`, `less`) and web credential backup exports trigger deception detection.
- **Non-Triggering Operations:** Passive directory listings (`ls`, `ls /etc/camera`, `ls /emergency_token.cfg`) do **NOT** trigger hits.
- **Deception Response:** When triggered, `honeytoken_hit=True` is recorded, an updated `DecoySessionEvent` is emitted to subscribers, and a repeatable, sandboxed Rickroll / "decrypting..." payload is returned inside the terminal.
- **Containment:** Zero client execution, zero browser launches, zero network downloads, and zero client-side scripts.

### Bounded File Evidence Collection
Attackers or demo tools can upload simulated artifacts via:
- **HTTP Endpoint:** `POST /api/decoy/upload` (accepts JSON with base64 `content_base64` or raw binary streams).
- **Python Module:** `decoy.submit_file_evidence(session_id, original_filename, file_bytes)`.

**Safety & Containment Controls:**
1. **Quarantine Storage:** Files are stored in a dedicated `quarantine/` directory (excluded from Git and outside web-served directories) with generated pseudo-random names: `artifact_<sha256[:16]>_<uuid>.bin`.
2. **Strict Size Limits:** Enforces a maximum upload cap of 2MB (`MAX_UPLOAD_SIZE_BYTES`). Oversized payloads are rejected with HTTP 413 / `ValueError`.
3. **Zero Host Execution:** Uploaded bytes are never executed, imported, compiled, or passed to any shell or interpreter.
4. **Zero Destination Contact:** Candidate URLs, IP addresses, and domains extracted from uploaded bytes are **never** contacted or probed.
5. **Separation of References vs. Uploads:** Command-line references (`curl http://... -o /tmp/bot`) are tracked separately in `session.referenced_urls` and `session.referenced_files`. Only actual submitted byte streams are stored in quarantine and tracked in `session.file_submissions`.

### Epistemic Framing & Schema Semantics
- **`malware_hash`:** Contains the empirical cryptographic SHA-256 digest of submitted file bytes. It is an empirical artifact digest, **not** conclusive proof that the file is malicious.
- **`c2_address`:** Contains statically extracted candidate URLs or IP addresses. It is a candidate indicator of compromise, **not** automatically confirmed C2 infrastructure.
- **`honeytoken_hit`:** Records an observed interaction with planted deception bait. It does **not** establish individual human identity or legal guilt.

### Deterministic Indicator Selection Policy (Limitation for Person C)
The shared `schema.py` defines scalar fields for `malware_hash` (`Optional[str]`) and `c2_address` (`Optional[str]`). When multiple indicators are observed, Person B applies the following deterministic selection policy:

1. **`malware_hash` Selection:**
   - **Priority 1:** SHA-256 digest of the most recently received file submission.
   - **Priority 2:** SHA-256 discovered from shell command-line strings.
   - **Priority 3:** MD5 discovered from shell command-line strings.

2. **`c2_address` Selection:**
   - **Priority 1:** Candidate URL with explicit port extracted from file submissions (e.g. `http://...:8080/...`).
   - **Priority 2:** Candidate plain URL from file submissions.
   - **Priority 3:** Candidate IP:port from file submissions.
   - **Priority 4:** Candidate URL referenced in shell command lines (`curl`/`wget`).
   - **Priority 5:** Candidate IP:port referenced in shell command lines.

> **Note for Person C:** Because the shared schema only holds one scalar indicator per field, full multi-indicator provenance is retained in local memory and accessible via `decoy.get_session_provenance(session_id)` or `GET /api/decoy/provenance/{session_id}`. Person B does not unilaterally alter the shared `schema.py`.

---

## 5. Interface for Member A (`edge.py` — Camera Mesh & Gateway Pass-Through)

The gateway evaluates whether an incoming connection is benign, suspicious, or hostile:
- **`destination == "real"`** (Score < 20.0 or allowlisted): Routed to the real device target.
- **`destination == "rate_limit"`** (Score 20.0 - 59.9): Throttled with HTTP 429.
- **`destination == "decoy"`** (Score >= 60.0): Trapped in the Phantom Twin.

Member A can inject their real camera streaming sink handler into `gateway.py`:

```python
import gateway

def camera_mesh_sink_handler(context: dict):
    # Route benign stream request to Member A's camera node
    return {"status": "FORWARDED_TO_CAMERA_MESH", "node": "cam-01"}

gateway.set_real_device_handler(camera_mesh_sink_handler)
```

---

## 6. Security & Isolation Guarantees

1. **Zero Host Execution:** No shell commands ever touch `subprocess`, `os.system`, `eval()`, or `exec()`. Every command (`ls`, `cd`, `cat`, `head`, `tail`, `more`, `less`, `pwd`, `help`, `exit`) is strictly evaluated against the in-memory `VIRTUAL_FS` dictionary.
2. **Directory Traversal Protection:** All virtual paths are normalized using `posixpath.normpath` and clamped to the virtual root (`/`). Attempts to traverse with `../../..` cannot escape.
3. **Safe Credential Handling:** Raw passwords are **never** stored in plain text, database, or telemetry events. All passwords are converted to a non-reversible cryptographic fingerprint (`masked:***[sha256:...]`).
4. **Safe File Quarantine:** Uploaded demo files are stored with generated random names in `quarantine/` (ignored by git, outside web root). Bytes are never executed, and extracted candidate addresses are never contacted.
5. **HTML Escaping:** All untrusted web inputs (`username`, `error`, parameters) are escaped via `html.escape` to neutralize XSS.
6. **No Dangerous SSH Features:** Port forwarding (TCP/X11), agent forwarding, and SFTP subsystems are explicitly disabled.
7. **Bounded Resources:** Maximum 10 concurrent connections, 120s inactivity timeout, 300s session duration cap, 2MB upload limit, and 2048-byte line buffer.
8. **Clean Imports:** No sockets, listeners, threads, or host key files are opened/created at import time.
9. **Optional MQTT:** The extra MQTT listener is isolated in `mqtt_decoy.py` and disabled by default. The core requires no MQTT dependency.

---

## 7. How to Run & Test Person B

```bash
# 1. Run all tests (unit tests, integration fixtures, SSH client test)
python -m unittest discover tests

# 2. Run Person B standalone dev server (FastAPI)
python dev_harness.py

# 3. Run with live SSH Decoy listener on 127.0.0.1:2222
python dev_harness.py --with-ssh
# or:
python run_decoys.py
```
