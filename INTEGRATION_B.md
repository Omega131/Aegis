# Person B — Comprehensive Integration Guide (Stage 2: Phantom Twin Decoy & Gateway)

**Author:** Member B (Gateway Router & Honeypot Decoys)  
**Branch:** `honeypot`  
**Shared Schema:** `schema.py` (Strictly preserved, zero unilateral schema changes)  
**Status:** Ready for integration with Person A (`edge.py`) and Person C (`intel.py`)

---

## Table of Contents
1. [Exact Imports for `main.py`](#1-exact-imports-for-mainpy)
2. [Startup & Shutdown Hooks](#2-startup--shutdown-hooks)
3. [Router Registration](#3-router-registration)
4. [How Person C Receives DecoySessionEvent Updates](#4-how-person-c-receives-decoysessionevent-updates)
5. [Event Ordering and Duplicate/Update Handling](#5-event-ordering-and-duplicateupdate-handling)
6. [Gateway Real-Target Configuration](#6-gateway-real-target-configuration)
7. [Operator Endpoint Paths and Authentication Expectations](#7-operator-endpoint-paths-and-authentication-expectations)
8. [Dashboard Page Registration](#8-dashboard-page-registration)
9. [Required Dependency Additions & Compatible Versions](#9-required-dependency-additions--compatible-versions)
10. [Environment Variables and Ports](#10-environment-variables-and-ports)
11. [Known Limitations and Remaining Team Decisions](#11-known-limitations-and-remaining-team-decisions)
12. [Security & Containment Audit Summary](#12-security--containment-audit-summary)

---

## 1. Exact Imports for `main.py`

When wiring Person B into the shared `main.py`, include the following exact imports:

```python
# Person B Modules (Stage 2: Phantom Twin Decoy & Gateway Router)
import decoy
import gateway
```

*(Note: `ssh_decoy.py` and `mqtt_decoy.py` are managed internally by `decoy.py` and do NOT need to be imported directly by `main.py`).*

---

## 2. Startup & Shutdown Hooks

Person B provides explicit async lifecycle hooks (`startup` and `shutdown`) that manage the `asyncssh` server listener, host key generation, and background session managers without import-time side effects.

### Integration in FastAPI Lifespan Manager

In `main.py`, integrate Person B hooks into the application's `@asynccontextmanager` lifespan function:

```python
import contextlib
import os
from fastapi import FastAPI
import decoy
import gateway

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # =========================================================================
    # Startup Phase
    # =========================================================================
    # Configure SSH listener options from environment
    start_ssh = os.environ.get("AEGIS_START_SSH", "1") == "1"
    ssh_host = os.environ.get("AEGIS_SSH_HOST", "127.0.0.1")
    ssh_port = int(os.environ.get("AEGIS_SSH_PORT", "2222"))

    # Initialize Person B honeypot core and optional live SSH socket listener
    await decoy.startup(host=ssh_host, port=ssh_port, start_ssh=start_ssh)
    print(f"[*] Person B Decoy core initialized (SSH active={start_ssh} on {ssh_host}:{ssh_port})")

    yield

    # =========================================================================
    # Shutdown Phase
    # =========================================================================
    print("[*] Shutting down Person B Decoy listeners...")
    await decoy.shutdown()
    print("[*] Person B Decoy shutdown complete.")

# Initialize shared application
app = FastAPI(
    title="AegisMirage Unified Platform",
    lifespan=lifespan,
)
```

---

## 3. Router Registration

Person B provides two FastAPI `APIRouter` instances:
1. `gateway.gateway_router`: Manages routing evaluations, decision history, and gateway summaries.
2. `decoy.decoy_router`: Manages fake camera web portal, evidence uploads, operator telemetry, and active decoy sessions.

### Registration Snippet in `main.py`

```python
# Mount Person B Routers
app.include_router(gateway.gateway_router)
app.include_router(decoy.decoy_router)
```

### Registered Endpoint Prefixes

| Router | Path Prefix | Purpose |
|---|---|---|
| `gateway.gateway_router` | `/api/gateway/evaluate` | On-demand route evaluation (real vs rate_limit vs decoy) |
| `gateway.gateway_router` | `/api/gateway/decisions` | Historical query of all computed routing decisions |
| `gateway.gateway_router` | `/api/gateway/summary` | Aggregate gateway metrics (real, rate_limit, decoy counts) |
| `decoy.decoy_router` | `/api/decoy/web/login` | Fake camera admin portal (HTML trap for web crawlers) |
| `decoy.decoy_router` | `/api/decoy/web/device` | Fake camera settings & backup export trap |
| `decoy.decoy_router` | `/api/decoy/sessions` | List of all active sessions (`schema.DecoySessionEvent`) |
| `decoy.decoy_router` | `/api/decoy/sessions/{session_id}` | Single session event lookup |
| `decoy.decoy_router` | `/api/decoy/simulate/command` | Virtual command execution for integration testing & UI drills |
| `decoy.decoy_router` | `/api/decoy/upload` | Bounded file evidence ingestion endpoint |
| `decoy.decoy_router` | `/api/decoy/provenance/{session_id}` | Full local audit and multi-indicator provenance report |
| `decoy.decoy_router` | `/api/decoy/operator/telemetry` | Operator-facing aggregated dashboard telemetry |
| `decoy.decoy_router` | `/api/decoy/operator/sessions/{session_id}` | Operator-facing detailed session drill-down |

---

## 4. How Person C Receives DecoySessionEvent Updates

Person C (`intel.py` — Campaign Clustering) can ingest `schema.DecoySessionEvent` objects via three supported mechanisms:

### Option A: Real-Time Event Subscription (Recommended)
Register a callback with Person B's event dispatcher. The callback is invoked synchronously whenever new telemetry occurs (login attempt, command executed, honeytoken tripped, file uploaded, or connection closed):

```python
import decoy
import schema

def on_decoy_session_update(event: schema.DecoySessionEvent) -> None:
    """Invoked in real-time on every session state change."""
    print(f"[Intel Cluster] Ingesting event from {event.source_ip} (Session: {event.session_id})")
    # Feed into Person C's campaign clustering algorithm
    intel_cluster_engine.process_session_event(event)

# Register the callback during application startup:
decoy.register_session_listener(on_decoy_session_update)

# If unsubscribing later:
# decoy.unregister_session_listener(on_decoy_session_update)
```

### Option B: In-Memory Polling / Batch Retrieval
Query the active sessions directly via Python module calls:

```python
import decoy

# Retrieve all active session events adhering to schema.DecoySessionEvent:
all_events: list[schema.DecoySessionEvent] = decoy.get_active_sessions()

# Retrieve a specific session:
event: schema.DecoySessionEvent | None = decoy.get_session_by_id("sess-abc12345")
```

### Option C: Detailed Multi-Indicator Provenance Lookup
For deep forensic clustering where multiple files, hashes, or URLs were observed in a single session:

```python
prov = decoy.get_session_provenance("sess-abc12345")
# prov["file_submissions"]      -> List of uploaded artifacts (SHA-256, MD5, size, quarantine path)
# prov["referenced_urls"]        -> URLs observed in command-line arguments (e.g. wget http://...)
# prov["referenced_files"]       -> File paths referenced in command-line arguments
# prov["command_hashes"]         -> Hashes mentioned in command strings
# prov["command_c2_candidates"]  -> C2 domains/IPs extracted from command strings
```
*(Also accessible via HTTP: `GET /api/decoy/provenance/{session_id}`).*

---

## 5. Event Ordering and Duplicate/Update Handling

### Lifecycle Progression Model
A decoy session's telemetry progresses monotonically along a predictable event timeline:

```
[1. Authentication]  ---> [2. Commands Executed] ---> [3. Honeytoken Tripped] ---> [4. File Evidence] ---> [5. Disconnect]
failed_logins count       commands list appends       honeytoken_hit = True       malware_hash set          session closed
                                                                                  c2_address set
```

### Duplicate & Update Handling Guidance for Person C
1. **Shared Session ID:** Every event update emitted for the same ongoing interaction shares the exact same `session_id`.
2. **Monotonic Upsert Rule:** Person C's clustering engine **MUST** treat incoming events with a previously seen `session_id` as state **updates/upserts**, not as distinct sessions.
3. **Cumulative Fields:**
   - `commands`: Monotonically grows. Earlier commands are never removed or reordered.
   - `honeytoken_hit`: Latching boolean. Once set to `True`, it remains `True` for the remainder of the session.
   - `failed_logins`: Monotonically non-decreasing counter.
   - `malware_hash` & `c2_address`: Populated upon evidence submission or static IOC extraction; deterministic priority applies if multiple indicators occur.
4. **Ordering Assurance:** Because Python's synchronous callback dispatcher notifies subscribers inline, events are guaranteed to arrive in the exact causal order in which the attacker triggered them.

---

## 6. Gateway Real-Target Configuration

### Decision vs. Enforcement Architecture
1. **Computing a `RouteDecision`:** The Gateway computes a typed `schema.RouteDecision(source_ip, destination, score, reason)`. Destination is one of `"real"`, `"rate_limit"`, or `"decoy"`.
2. **Enforcing the Route:** Returning `destination="real"` does **NOT** forward network packets by itself. An injectable handler must execute the actual dispatch.

### Person A Real Device Handler Registration
Person A (`edge.py`) registers their physical or simulated camera handler with the gateway:

```python
import gateway

def forward_to_camera_mesh(context: dict) -> dict:
    """
    Invoked when gateway decides destination='real'.
    Dispatches traffic to Person A's real camera device or RTSP streaming pipeline.
    """
    source_ip = context.get("source_ip")
    action = context.get("action", "stream")
    print(f"[Gateway] Forwarding legitimate connection from {source_ip} to Camera Mesh")
    return {
        "status": "DELIVERED_TO_CAMERA",
        "camera_id": "cam-smart-01",
        "stream_url": "rtsp://10.0.0.50:554/live/ch0",
    }

# Register Person A's handler:
gateway.set_real_device_handler(forward_to_camera_mesh)
```

### Fallback Fixture Behavior
If Person A has not yet registered a real device handler (e.g. during standalone testing), the gateway defaults to `LocalMockRealDeviceFixture`, which logs the delivery and returns a clean pass-through record without crashing.

### Allowlist & Authentication Semantics
- Gateway allowlisted IPs (e.g. `127.0.0.1`, `10.0.0.50`, `192.168.1.10`) always receive `destination="real"`.
- **Critical Security Notice:** Allowlisting routes network traffic to the real device target, but does **NOT** bypass real-device authentication. Person A's camera node must still independently verify credentials.

---

## 7. Operator Endpoint Paths and Authentication Expectations

### Operator Endpoint Paths

| Method | Endpoint Path | Description |
|---|---|---|
| `GET` | `/api/decoy/operator/telemetry` | Aggregated dashboard view: active sessions, correlated gateway routes, summary stats, and epistemic disclaimers. |
| `GET` | `/api/decoy/operator/sessions/{session_id}` | Detailed session view: command log, honeytokens, uploaded file records, extracted indicators, and provenance. |

### Authentication Architecture & Expectations
- **Upstream Project Skeleton Status:** The shared repository currently lacks a centralized operator authentication module.
- **Person B Local-Only Development Policy:**
  - Callers connecting from loopback development peers (`127.0.0.1`, `::1`, `localhost`, `testclient`) are permitted access for seamless local demo and development testing.
  - Callers presenting a valid header (`X-Operator-Token: dev-operator-token-2026` or `Authorization: Bearer dev-operator-token-2026`) are permitted.
  - Remote callers lacking valid credentials are strictly rejected with HTTP `403 Forbidden` (`Operator endpoint restricted: centralized operator auth is absent`).
- **Decoy Listener Isolation Guarantee:**
  - Operator endpoints reside strictly on the FastAPI application.
  - Public decoy listeners (SSH on port 2222, MQTT on 1883, fake web camera login) **never** expose operator routes or records to attackers.

---

## 8. Dashboard Page Registration

Person B's Decoy Activity page is implemented in React + TypeScript using existing project conventions inside `dashboard/src/pages/decoy/`.

### Export Structure
- Page component: `DecoyPage` exported from `dashboard/src/pages/decoy/index.ts`.
- CSS styling: Self-contained in `dashboard/src/pages/decoy/decoy.css`.

### Registration Snippet in `dashboard/src/App.tsx`
```tsx
import { DecoyPage } from './pages/decoy'

// Inside the active page router/switch block:
case 'decoy':
  return <DecoyPage />
```

### Dashboard Features
- **Stat Cards:** Total Sessions, Trapped Decoy Sessions, Real/Allowed Routing Decisions, Honeytoken Hits, Quarantined Uploads.
- **Live Telemetry Polling:** Periodic background polling (configurable, default 4s) with manual refresh and pause controls.
- **Session Table:** Displays source IP, service badge (SSH/Web), failed login count, honeytoken alert badge, command count, and correlated gateway destination & score.
- **Detail Drill-Down Modal:** Deep inspection of full command history, submitted file evidence (SHA-256 digests, file sizes, quarantine filenames), candidate C2 addresses, and epistemic disclaimers.
- **Graceful States:** Loading skeletons, error alerts with retry buttons, and empty-state guidance.

---

## 9. Required Dependency Additions & Compatible Versions

To support the genuine `asyncssh` server listener and protocol requirements, the following dependencies are required:

### Proposed Lines for `requirements.txt`
```text
asyncssh>=2.14.0
cryptography>=42.0.0
```

*(Optional standalone MQTT interface requires `paho-mqtt>=2.0.0`).*

### Compatibility
- Compatible with Python 3.10, 3.11, 3.12, 3.13, and 3.14.
- All dependencies are pure or standard binary wheels available on PyPI.
- Verified in project virtual environment: `asyncssh 2.21.0` and `cryptography 44.0.2`.

---

## 10. Environment Variables and Ports

### Configuration Parameters

| Environment Variable | Default Value | Description |
|---|---|---|
| `AEGIS_START_SSH` | `0` (or `1` if `--with-ssh` passed) | Controls whether live `asyncssh` server listener starts on boot. |
| `AEGIS_SSH_HOST` | `127.0.0.1` | Loopback bind address for SSH honeypot listener. |
| `AEGIS_SSH_PORT` | `2222` | TCP port for SSH honeypot listener. |
| `AEGIS_SEED_FIXTURES`| `1` | Automatically seeds mock gateway decisions and decoy sessions in `dev_harness.py`. |
| `PORT` | `8000` | HTTP port for FastAPI management and web portal. |

### Network Port Allocation

| Port | Service | Bound Interface | Access Scope |
|---|---|---|---|
| `8000` | FastAPI Web App & Operator APIs | `127.0.0.1` | Local operator & browser UI |
| `2222` | `asyncssh` Honeypot Server | `127.0.0.1` | Simulated attacker / SSH client |
| `1883` / `18883` | `paho-mqtt` Decoy Broker (Optional) | `127.0.0.1` | Simulated IoT telemetry |
| `5173` | Vite Frontend Dev Server | `localhost` | React Dashboard UI |

---

## 11. Known Limitations and Remaining Team Decisions

### 1. Schema Gap: Missing Camera / Window Association in `DecoySessionEvent`
> [!IMPORTANT]
> **Strict Schema Adherence:** Person B strictly preserves the shared `schema.py` without unilateral edits.
> 
> **The Gap:** In `schema.py`, Person A's `CameraEvent` defines `camera_id` and `window_id`. Person C's `CaseRequest` requires `camera_id`, `window_id`, and `campaign_id`. However, `DecoySessionEvent` contains:
> `session_id`, `source_ip`, `service`, `failed_logins`, `commands`, `honeytoken_hit`, `malware_hash`, `c2_address`.
> It has **NO** `camera_id` and **NO** `window_id` fields.
> 
> **Policy:** Person B does not invent fictional camera associations. The team must decide:
> - **Option 1 (Clustering Inference):** Person C's clustering engine correlates an attacker's `source_ip` or session timestamp with Person A's camera subnet to infer `camera_id`.
> - **Option 2 (Schema Update):** The team jointly agrees to add `camera_id: str | None = None` and `window_id: str | None = None` to `DecoySessionEvent` in `schema.py`.

### 2. Scalar Indicator Limitation in `schema.py`
`DecoySessionEvent` defines `malware_hash: str | None` and `c2_address: str | None` as single scalar strings. When an attacker uploads multiple files or references multiple candidate C2s in shell commands, Person B applies a deterministic priority rule (most recent file upload SHA-256; first URL with port), while preserving the full list in `decoy.get_session_provenance(session_id)`. The team should decide if `schema.py` will remain scalar or expand to lists.

### 3. Centralized Operator Authentication
The team needs a unified operator authentication strategy across Person A, Person B, and Person C routers once merged into `main.py`.

---

## 12. Security & Containment Audit Summary

Person B's implementation has been rigorously audited against the security review checklist:

| Security Vector | Implementation Defense | Status |
|---|---|---|
| **Host Command Execution** | Zero execution: every shell command is strictly evaluated against the in-memory Python `VIRTUAL_FS` dict. `subprocess`, `os.system`, `eval`, and `exec` are completely absent. | PASSED |
| **SSH Port Forwarding** | `AegisSSHServer` explicitly overrides `server_requested`, `tcpip_forwarding_requested`, and agent forwarding to return `False`. SFTP is disabled. | PASSED |
| **Path Traversal** | Virtual filesystem path resolution uses `posixpath.normpath` and clamps strictly to `/`. Uploaded files are stored in `quarantine/` with generated UUID names outside web directories. | PASSED |
| **Stored XSS** | Web login templates use `html.escape` on all dynamic parameters; JSON APIs emit plain text; React components render escaped text nodes. | PASSED |
| **Raw Password Logging** | Raw passwords are never stored in session records, logs, or emitted events. `safe_credential_summary` stores only masked characters + truncated SHA-256 digest. | PASSED |
| **Unbounded Input** | Strict size limits enforced: 2048-byte terminal line buffer, 2MB file upload cap, 10 concurrent SSH connections, 120s idle timeout, and LRU source IP cache. | PASSED |
| **Import-Time Side Effects** | Zero sockets, listeners, file writes, or threads started at import time. All initialization occurs inside explicit async startup hooks. | PASSED |

---

## 13. Verification Commands

```bash
# 1. Run all backend tests (unit tests, integration fixtures, SSH client test)
.\venv\Scripts\python.exe -m unittest discover tests

# 2. Run frontend lint and build checks
cd dashboard
npm run lint
npm run build
cd ..

# 3. Launch Person B standalone development harness
.\venv\Scripts\python.exe dev_harness.py --with-ssh
```
