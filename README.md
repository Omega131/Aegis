# Aeigs (formerly AegisMirage)

**Aeigs** is an integrated cyber-physical deception and smart city defense platform engineered for zero-trust surveillance, edge privacy protection, and active threat containment. It bridges real-time privacy-blurred camera mesh feeds, interactive Phantom Twin honeypots (SSH/MQTT/Web), dynamic perimeter routing, automated threat campaign graph clustering, and a cryptographic break-glass Shamir escrow unmasking ledger.

---

## 🏛️ Architecture Overview

The backend operates as an integrated single-process architecture where modules communicate directly in Python with zero inter-service network friction:

* **[`edge.py`](edge.py)**: Edge camera mesh network with real-time in-memory face detection, privacy blurring, and AES-256-GCM content-addressed encrypted storage.
* **[`decoy.py`](decoy.py)**: Phantom Twin deception engine providing simulated SSH and web honeypot environments, honeytoken tripwires, and malware quarantine.
* **[`ssh_decoy.py`](ssh_decoy.py)** & **[`mqtt_decoy.py`](mqtt_decoy.py)**: Protocol daemons for AsyncSSH (port 2222) and MQTT (port 1883) honeypots.
* **[`gateway.py`](gateway.py)**: Dynamic connection scoring and perimeter traffic diversion (routes legitimate users to cameras; traps adversaries in decoys).
* **[`intel.py`](intel.py)**: Threat intelligence engine with automated campaign clustering, Salesforce HASSH client fingerprinting, MITRE ATT&CK mapping, and blast-radius weighting.
* **[`escrow.py`](escrow.py)**: Cryptographic break-glass unmasking engine powered by Shamir's 2-of-3 Secret Sharing and a tamper-evident, append-only hash-chained audit log.
* **[`main.py`](main.py)**: FastAPI application entrypoint wiring all modules, lifecycle event listeners, REST APIs, and mounting the dashboard.
* **[`schema.py`](schema.py)**: Central typed Pydantic models shared across all subsystem boundaries.

---

## 📁 Repository Structure

```text
Aegis/
├── dashboard/                  # React + TypeScript + Vite frontend application
│   ├── src/
│   │   ├── api/                # Typed REST client & API bindings
│   │   ├── components/         # Reusable UI widgets & AppShell layout
│   │   ├── context/            # Global AppContext (routing, toasts, devices, theme)
│   │   └── pages/              # Active routes: city, cameras, decoy, campaigns, hacker, settings
│   ├── public/                 # Static assets, branding logos, and demo samples
│   ├── index.html
│   └── package.json
├── docs/                       # Technical specifications & architectural guides
│   ├── DESIGN_SYSTEM.md        # Color tokens, typography, and styling system
│   ├── EDGE_HANDOFF.md         # Edge camera & escrow cryptographic API specs
│   ├── FRONTEND_INTEGRATION.md # Dashboard integration notes
│   ├── INTEGRATION_AUDIT.md    # Cryptographic audit ledger verification
│   ├── INTEGRATION_B.md        # Gateway routing & decoy integration details
│   ├── PERSON_B_PLAN.md        # Honeypot protocol implementation plan
│   └── SSH_MQTT_INTERFACES.md  # AsyncSSH and Paho-MQTT protocol interface specs
├── tests/                      # Automated Python test suites
│   ├── test_full_pipeline.py   # Full integration end-to-end pipeline verification
│   ├── test_person_b.py        # Decoy honeypot & gateway test suite
│   └── test_ssh_mqtt_interfaces.py # Live SSH and MQTT protocol interface tests
├── docker-compose.yml          # Least-privilege multi-container configuration
├── Dockerfile                  # Hardened non-root Python container specification
├── requirements.txt            # Python dependencies
└── README.md
```

---

## 🚀 Quickstart

### 1. Python Backend
Activate the virtual environment and start the unified FastAPI server:
```powershell
# Windows
.\venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
API documentation is automatically available at `http://127.0.0.1:8000/docs`.

### 2. Frontend Dashboard
Run the Vite development server:
```bash
cd dashboard
npm install
npm run dev
```
The dashboard will open at `http://localhost:5173`.

### 3. Run Automated Tests
```bash
python -m unittest tests.test_person_b
python -m unittest tests.test_full_pipeline
python -m unittest tests.test_ssh_mqtt_interfaces
```

### 4. Docker Deployment
```bash
docker compose up --build
```