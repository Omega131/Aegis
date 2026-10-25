# Person B — Implementation Plan & Integration Notes
**Role:** Member B — Decoy & Gateway (Stage 2: Phantom Twin)  
**Branch:** `honeypot`  
**Repository:** `Aegis/`  
**Files Owned:**
- `gateway.py`
- `decoy.py`
- `dashboard/src/pages/decoy/` (`DecoyPage.tsx`)
- Person B tests: `tests/test_person_b.py`

---

## 1. Scope & System Architecture

According to the **AegisMirage Build Reference** (`work_plan.pdf`), Stage 2 operates between incoming network probes and core campaign intelligence.
The goal of Stage 2 is to:
1. **Differentiate & Filter (Gateway Routing):** Prevent legitimate traffic and camera operations from disruption while intercepting hostile scans and brute-force traffic.
2. **Entrap & Study (Phantom Twin Decoy):** Safely isolate hostile actors inside realistic decoy services (SSH and camera admin web UI) with a mock filesystem.
3. **Trigger High-Confidence Alarms (Honeytokens):** Lure attackers into bait files that immediately confirm malicious intent and trigger the internal sandbox Rickroll sequence.
4. **Extract Telemetry & IOCs:** Collect command logs, malware hashes, and C2 URLs/IPs into `schema.DecoySessionEvent` objects to feed Member C's Campaign Clustering engine.

---

## 2. Shared Schema Contract Alignment

Person B's code imports and instantiates models from `schema.py` without modifying the contract:

| Model | Producer | Key Fields | Purpose |
|---|---|---|---|
| `RouteDecision` | `gateway.py` | `source_ip`, `destination` (`real`, `rate_limit`, `decoy`), `score`, `reason` | Emitted when a connecting IP is scored and assigned a target path. |
| `DecoySessionEvent` | `decoy.py` | `session_id`, `source_ip`, `service`, `failed_logins`, `commands`, `honeytoken_hit`, `malware_hash`, `c2_address` | Emitted and continuously updated during an attacker session. Directly consumed by Member C (`intel.py`). |

---

## 3. Unresolved Inputs & Clarifications

1. **Real-Device Routing Target:**
   - *Issue:* In a live city deployment, non-malicious traffic routes to real physical IoT cameras or stream endpoints. In this hackathon demo build, there are no physical cameras attached.
   - *Resolution / Assumption:* `gateway.py` designates `"real_device"` (or a simulated safe sink handler `http://127.0.0.1:8000/api/real-device`) as the destination. Safe requests route to this mock pass-through rather than the decoy. When Member A's camera mesh provides streaming endpoints, they can attach here seamlessly.
2. **Fail-Safe Thresholds:**
   - Allow-list IPs (e.g. `127.0.0.1`, operator subnets) **always** route to `real`.
   - Score `< 20`: `real` (low risk).
   - Score `20 - 59`: `rate_limit` (Fail-safe default: uncertain cases are throttled, never silently decoyed into a fake environment).
   - Score `>= 60`: `decoy` (high risk / confirmed hostile reconnaissance / credential spraying).
3. **Sticky Routing:**
   - To maintain deception realism, once a `source_ip` is routed to `decoy`, all subsequent actions in that session remain routed to `decoy`.
4. **Third-Party Dependency (`asyncssh`):**
   - The team's `requirements.txt` currently includes `fastapi`, `uvicorn`, `pydantic`.
   - For running the live SSH socket listener, `asyncssh` is required. To respect team ownership rules, we do not silently modify `requirements.txt` without showing the proposed one-line diff. `decoy.py` is written to support both native direct simulation and live `asyncssh` server bindings.

---

## 4. Proposed Main API Wiring (For Team Review)

When wiring Person B into `main.py`, the following lightweight FastAPI router endpoints will be exposed:
- `POST /api/gateway/route`: Evaluates and records routing for an incoming request.
- `GET /api/gateway/decisions`: Returns recent `RouteDecision` history.
- `GET /api/decoy/sessions`: Returns all active and historic `DecoySessionEvent` objects for the dashboard and Member C.
- `POST /api/decoy/simulate/command`: Simulates shell command input in a session (used by demo scripts and dashboard).
- `POST /api/decoy/web/login`: Fake camera admin login endpoint.

---

## 5. Person B Component Architecture

### `gateway.py`
- `TrafficScorer`: Calculates heuristic risk score based on failed logins, default IoT password lists (`admin/admin`, `root/123456`, `default/default`), and probed services.
- `StickyRouter`: Maintains session persistence mapping `source_ip -> destination`.
- `evaluate_route(source_ip, service, attempted_credentials, port)`: Computes score and returns `RouteDecision`.

### `decoy.py`
- `VirtualFileSystem`: Realistic in-memory hierarchical directory tree (`/etc`, `/bin`, `/var/log`, `/root`, etc.).
- `Honeytokens`: Bait files placed at multiple depths:
  - `/etc/camera/credentials.conf`
  - `/root/keys/vault_token.key`
  - `/var/backup/firmware_pass.enc`
- `CommandInterpreter`: Evaluates `ls`, `cd`, `cat`, `pwd`, `whoami`, `uname`, `curl`, `wget`.
  - When a honeytoken is read, triggers `honeytoken_hit = True` and returns the sandboxed Rickroll payload:
    ```
    🎵 Never gonna give you up, never gonna let you down...
    [AegisMirage Trap Tripped: Honeypot Bait File Accessed]
    ```
- `IOCExtractor`: Parses command arguments and uploaded script buffers for:
  - C2 domains and IP addresses (`c2_address`)
  - Malware payload hashes (`malware_hash` - MD5/SHA-256)
- Emits and updates `DecoySessionEvent` in real time.

### `dashboard/src/pages/decoy/DecoyPage.tsx`
- Live telemetry cards: Active decoy sessions, honeytoken triggers, traffic routing distribution.
- Attacker terminal / keystroke monitor.
- Interactive demo simulator for live hackathon drill presentation.
