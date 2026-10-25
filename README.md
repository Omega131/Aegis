<h1 align="center">Aegis Mirage</h1>

<p align="center">
  <img src="assets/aegis_shield.png" alt="Aegis Mirage Logo" width="180" />
</p>

<h2 align="center"><strong>Zero-Trust Smart City Surveillance & Cyber-Physical Deception.</strong><br> Live Edge Privacy. Phantom Twin Honeypots. Multi-Party Shamir Escrow.</h2>

<details>
<summary style="font-size: 24px; font-weight: bold; cursor: pointer;"><h1>Table of Contents</h1></summary>

- [Architecture Overview](#architecture-overview)
- [The Problem](#the-problem)
- [Our Solution](#our-solution)
- [What gets stored on the edge & server?](#what-gets-stored-on-the-edge--server)
- [Cryptographic Escrow & Quorum Process](#cryptographic-escrow--quorum-process)
  - [1. Ephemeral Per-Window Key Generation & AES-256-GCM Storage](#1-ephemeral-per-window-key-generation--aes-256-gcm-storage)
  - [2. Shamir 2-of-3 Secret Sharing Split](#2-shamir-2-of-3-secret-sharing-split)
  - [3. Tamper-Evident Hash-Chained Audit Ledger](#3-tamper-evident-hash-chained-audit-ledger)
- [Phantom Twin Deception & Honeypot Engine](#phantom-twin-deception--honeypot-engine)
  - [1. Connection Hostility Scoring & Gateway Routing](#1-connection-hostility-scoring--gateway-routing)
  - [2. AsyncSSH & MQTT Honeytokens](#2-asyncssh--mqtt-honeytokens)
  - [3. Threat Intel Graph Clustering & HASSH Attribution](#3-threat-intel-graph-clustering--hassh-attribution)
- [Installation & Setup Guide](#installation--setup-guide)
  - [1. Backend Setup](#1-backend-setup)
  - [2. Frontend Setup](#2-frontend-setup)
  - [3. Running Test Suites](#3-running-test-suites)
  - [4. Docker Deployment](#4-docker-deployment)
- [Repository Structure](#repository-structure)
- [License](#license)

</details>

# Architecture Overview

![Aegis Architecture](assets/smart_city_diorama.jpg)

## The Problem

### The False Choice Between Safety and Human Dignity

Every morning, millions of people walk down municipal streets—walking children to school, heading to medical clinics, meeting loved ones, or exercising their fundamental right to peaceful assembly. They do not think of themselves as telemetry or facial datasets.

Yet modern smart cities have quietly forced an unfair trade-off: **to be safe, citizens must surrender their privacy.**

Municipalities have deployed thousands of networked cameras and IoT sensors across public squares, transit lines, and neighborhoods. While intended to deter crime and speed up emergency response, conventional surveillance architectures suffer from four deeply human points of failure:

1. **The Involuntary Panopticon**  
   Standard municipal cameras broadcast live, high-resolution, unblurred facial imagery across public networks 24 hours a day. Anyone with network access—from contractors and operators to unauthorized intruders—can track ordinary citizens across town. The basic human dignity of walking through one's own community without being cataloged has been treated as acceptable collateral damage.

2. **Fragile Guardians in Fragile Neighborhoods**  
   The physical devices entrusted with community safety—traffic cameras, school zone monitors, and utility sensors—are notoriously fragile. Built on low-cost embedded Linux boards, riddled with default manufacturer passwords, and left unpatched, they are routinely hijacked by automated botnets. Instead of protecting public spaces, compromised cameras become open spyglasses inside them.

3. **The Unchecked Power of the "All-or-Nothing" Switch**  
   In today's control rooms, trust is an absolute light switch. A single login credential or administrative subpoena often grants unilateral power to unmask weeks of historical footage across an entire neighborhood. There is no friction, no judicial quorum, and no second person in the room. When the authority to strip away a citizen's privacy rests in the hands of a single individual, abuse of power and unauthorized surveillance become inevitable.

4. **Defenders Fighting in the Dark**  
   When hostile adversaries or state-sponsored intrusion sets probe municipal cameras, defenders are left playing a passive guessing game. Traditional firewalls merely drop packets, while standalone honeypots sit isolated in labs without deflecting attacks away from real infrastructure. Defenders have had no way to actively deceive intruders, study their techniques, and protect real physical camera feeds in real time.

Aegis Mirage replaces this broken compromise with a fundamental civic principle: **privacy by default, transparency by cryptographic design, and active deception by necessity.**

## Our Solution

1. **In-Memory Face Detection & Privacy Blurring (`edge.py`)**  
   Every camera frame is intercepted in memory before streaming. A lightweight neural detector (`YuNet ONNX`) detects faces and applies coarse pixelation with dynamic bounding box expansion. Public RTSP streams (`port 554`) and analyst feeds only ever display privacy-blurred footage.

2. **Content-Addressed AES-256-GCM Storage (`edge.py`)**  
   Original unblurred facial crops are isolated in memory, encrypted using **AES-256-GCM** with an ephemeral 32-byte key generated once per 10-minute window, and stored on disk indexed strictly by their SHA-256 ciphertext hash (`<sha256>.bin`). The raw image is never saved in plaintext.

3. **Shamir 2-of-3 Break-Glass Escrow (`escrow.py`)**  
   The AES-256 decryption key for each window is immediately split into 3 Shamir secret shares distributed across independent municipal custodians (e.g. Municipal Police, Privacy Ombudsman, Judicial Officer). Any 2 custodians must vote to approve an unmask request before the key can be reconstructed.

4. **Tamper-Evident Hash-Chained Audit Ledger (`escrow.py`)**  
   Every unmask request, custodian vote, and honeytoken trigger is logged into an append-only, cryptographic hash-chained audit ledger (`current_hash = SHA-256(index + timestamp + action + actor + details + prev_hash)`). Unauthorized attempts trigger an immutable denial entry written **before** returning an HTTP 403.

5. **Dynamic Perimeter Routing & Gateway (`gateway.py`)**  
   The gateway inspects inbound connections on ports 22, 80, 554, 1883, and 2222. Legitimate administrative traffic with valid credentials routes to real devices. Suspicious scans, dictionary brute-force, or high-hostility probes are dynamically diverted into the **Phantom Twin Decoy**.

6. **Phantom Twin Honeypot Sandbox (`decoy.py`, `ssh_decoy.py`, `mqtt_decoy.py`)**  
   A high-interaction virtual IoT sandbox simulates Dropbear SSH (port 2222) and MQTT (port 1883). The honeypot traps malware uploads, calculates SHA-256 fingerprints, extracts candidate C2 domains, and deploys rigged honeytokens (`/etc/camera/credentials.conf`, `emergency_token.cfg`).

7. **Automated Threat Campaign Clustering (`intel.py`)**  
   Correlates threat actors across rotating IPs using shared C2 addresses, payload hashes, and Salesforce HASSH SSH client fingerprints (`MD5(kex;ciphers;mac;compression)`), generating real-time connected-components graphs.

## What gets stored on the edge & server?

The system stores encrypted blobs and cryptographic audit chains:

| Component | Storage Path | Type | Description |
| :--- | :--- | :--- | :--- |
| **Encrypted Crops** | `edge_storage/<cam>/<window>/<hash>.bin` | Binary Blob | AES-256-GCM encrypted unblurred face crops with 12-byte nonce & 16-byte auth tag. Content-addressed by SHA-256. |
| **Audit Ledger** | `escrow.audit_log.chain` | Hash-Chained JSON | Cryptographic append-only blocks tracking unmask attempts, custodian approvals, and honeytoken hits. |
| **System Metadata** | `aegismirage.db` | SQLite 3 | Cross-session operational flags and subsystem configuration. |
| **Quarantined Malware** | `quarantine/artifact_<hash>.bin` | Binary Blob | Attacker payloads captured via honeypot upload API with extracted IoCs. |
| **HASSH Signatures** | `intel.HASSH_DATABASE` | In-Memory DB | Fingerprint dictionary mapping SSH client negotiation strings to known botnets (Mirai, Paramiko, BlackEnergy). |

## Cryptographic Escrow & Quorum Process

### 1. Ephemeral Per-Window Key Generation & AES-256-GCM Storage
- For every 10-minute surveillance window (e.g. `2026-10-24T14:30`), a cryptographically secure 256-bit symmetric key is generated via `os.urandom(32)`.
- When an edge camera detects a face, it encrypts the unblurred JPEG crop with AES-256-GCM using a unique 12-byte nonce.
- The ciphertext payload is saved to disk named by its SHA-256 hash. The plaintext key is discarded from memory once split into Shamir shares.

### 2. Shamir 2-of-3 Secret Sharing Split
- The raw 32-byte key $K$ is treated as an integer and split using Shamir's Secret Sharing scheme with threshold $k=2$ and total shares $n=3$:
  $$f(x) = K + a_1 x \pmod p$$
- Shares are distributed across independent custodians:
  1. `custodian-1`: Lead Cyber Investigator
  2. `custodian-2`: Municipal Privacy Commissioner
  3. `custodian-3`: Chief Magistrate / Judiciary
- A single custodian alone cannot decrypt anything. Reconstructing $K$ requires any 2 valid shares via Lagrange interpolation.

### 3. Tamper-Evident Hash-Chained Audit Ledger
- All operations (access requests, custodian votes, releases, and denials) append a new block to the audit ledger:
  $$H_i = \text{SHA-256}(i \parallel t \parallel \text{action} \parallel \text{actor} \parallel \text{details} \parallel H_{i-1})$$
- The ledger integrity can be independently verified at any time via `GET /escrow/audit-log/verify`.

## Phantom Twin Deception & Honeypot Engine

### 1. Connection Hostility Scoring & Gateway Routing
- Inbound connections are dynamically evaluated by [`gateway.py`](gateway.py) based on IP reputation, authentication failures, and port targeting.
- When an attacker's hostility score exceeds the threshold, the gateway transparently reroutes traffic to port `2222` (AsyncSSH decoy) without closing the socket.

### 2. AsyncSSH & MQTT Honeytokens
- Decoy environments simulate realistic ARM64 Linux directories with armed honeytokens:
  - `/etc/camera/credentials.conf`
  - `/emergency_token.cfg`
- Accessing or reading these honeytokens immediately spikes the threat score to `9.8`, triggers reverse payload alerts, and initiates custodian quorum cases.

### 3. Threat Intel Graph Clustering & HASSH Attribution
- Attackers rotating egress IP addresses are correlated via shared C2 infrastructure, payload SHA-256 hashes, and HASSH fingerprints.
- Automatically clusters isolated sessions into organized campaign graphs (`CMP-001`, `CMP-002`).

## Installation & Setup Guide

### 1. Backend Setup
Ensure Python 3.10+ is installed:
```powershell
# Windows
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
Backend API documentation is live at `http://127.0.0.1:8000/docs`.

### 2. Frontend Setup
Run the analyst dashboard:
```bash
cd dashboard
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

### 3. Running Test Suites
Aegis includes automated test suites covering edge encryption, honeypot protocol interfaces, and full-pipeline drills:
```bash
python -m unittest tests.test_person_b
python -m unittest tests.test_full_pipeline
python -m unittest tests.test_ssh_mqtt_interfaces
```

### 4. Docker Deployment
Deploy with hardened least-privilege containers:
```bash
docker compose up --build
```

## Repository Structure

```text
Aegis/
├── assets/                     # Architecture diagrams and branding assets
├── dashboard/                  # React + TypeScript + Vite analyst dashboard
│   ├── src/
│   │   ├── api/                # Typed REST client & API bindings
│   │   ├── components/         # Common widgets (StatCard, Badge, CityMiniMap) & AppShell
│   │   ├── context/            # Global AppContext (routing, toasts, devices, theme)
│   │   └── pages/              # Active routes: city, cameras, decoy, campaigns, hacker, settings
│   ├── public/                 # Favicons and static demo media
│   └── package.json
├── docs/                       # Technical specifications & design system
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
├── edge.py                     # Edge camera mesh network & face blur
├── decoy.py                    # Phantom Twin honeypot engine
├── ssh_decoy.py                # AsyncSSH daemon (port 2222)
├── mqtt_decoy.py               # MQTT broker daemon (port 1883)
├── gateway.py                  # Traffic scoring & routing
├── intel.py                    # Threat intelligence & campaign clustering
├── escrow.py                   # Shamir break-glass escrow & audit log
├── main.py                     # Unified FastAPI application entrypoint
├── requirements.txt            # Python dependencies
└── README.md
```

## License

MIT. See [LICENSE](LICENSE).