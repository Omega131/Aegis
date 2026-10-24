# Real SSH and MQTT Protocol Interfaces — AegisMirage Phantom Twin

**Owner:** Member B — Stage 2 (Phantom Twin Core Decoy & Protocol Listeners)  
**Security Boundary:** All listeners bind to **loopback (`127.0.0.1`)** by default.

---

## 1. Real SSH Decoy Server (`ssh_decoy.py`)

A genuine SSH server listener running on port `2222` powered by `asyncssh`.
It provides an interactive, simulated shell environment while enforcing strict least-privilege security restrictions.

### Host Key Management
- Development RSA host keys are generated at first run (`decoy_ssh_host_key`).
- Host keys are strictly kept out of Git via [`.gitignore`](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/.gitignore).

### Security Restrictions (Least Privilege)
- **Host Execution:** ZERO OS execution. Commands are routed strictly to the in-memory virtual camera filesystem in `decoy.py`.
- **Port Forwarding:** `tcp_forwarding` and `x11_forwarding` are completely disabled.
- **Agent Forwarding:** `agent_forwarding=False`.
- **SFTP / Subsystems:** Subsystems and SFTP are disabled (`sftp_factory=None`).
- **Resource Bounds:**
  - Maximum concurrent connections: 10
  - Inactivity timeout: 120 seconds
  - Maximum command line input: 2048 bytes

### Safe Authentication Logging
- Raw passwords are **NEVER** stored in plain text or telemetry databases.
- Passwords are fingerprinted using a non-reversible SHA-256 digest (`masked:***[sha256:<hash>]`).
- **Explicit Demo Authentication Policy:**
  - To allow testers and judges to enter the decoy and study the trap, common Mirai/IoT demo credentials succeed:
    - `root:root`
    - `root:123456`
    - `root:xc3511`
    - `admin:admin`
    - `default:default`
    - `demo_operator:SmartCity2026!`
  - Any unknown credentials fail and increment the attacker's threat score in `schema.DecoySessionEvent`.

### Connecting via Standard SSH Client
From any terminal:
```bash
ssh -p 2222 root@127.0.0.1 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null
# Enter password: root
```

Try commands inside the shell:
```bash
root@aegis-cam:~# pwd
root@aegis-cam:~# uname -a
root@aegis-cam:~# ls /etc/camera
root@aegis-cam:~# cat /etc/camera/credentials.conf
# --> Triggers Honeytoken and outputs the Rickroll reverse-trap response!
```

---

## 2. Real MQTT 3.1.1 Decoy Server (`mqtt_decoy.py`)

A real binary MQTT 3.1.1 protocol listener running on port `1883` over TCP.
Accepts connections from standard MQTT clients (`paho-mqtt`, `mosquitto_sub`, `mosquitto_pub`, IoT gateways).

### Fictional Camera Telemetry & Config Topics

| Topic | Purpose | Example Payload |
|---|---|---|
| `aegis/cameras/cam-01/telemetry` | Live camera performance metrics | `{"camera_id": "cam-smart-04", "fps": 30, "status": "ONLINE", "cpu_temp_c": 43.8}` |
| `aegis/cameras/cam-01/config` | Device streaming & detector settings | `{"resolution": "1920x1080", "night_vision": "auto", "h264_bitrate_kbps": 4096}` |
| `aegis/cameras/cam-01/alerts` | Perimeter motion & tamper triggers | `{"event": "motion_detected", "zone": "south_gate"}` |
| `aegis/cameras/cam-01/vault_credentials` | **Honeytoken Bait Topic** | Subscribing or publishing to this topic immediately trips `honeytoken_hit = True`! |

### In-Memory Message Bus
- State, retained messages, and subscriptions are managed in an in-memory dictionary.
- **No external bridge:** Packets are never sent to external IoT infrastructure or physical devices.

### Safe Authentication Policy
- Supports anonymous connections and demo credentials (`camera_node:demoPass2026`, `admin:admin`).
- Passwords are fingerprinted with SHA-256, never stored in plain text.

### Connecting via MQTT Clients

#### Using `mosquitto_sub` (Terminal 1)
```bash
mosquitto_sub -h 127.0.0.1 -p 1883 -t "aegis/cameras/cam-01/telemetry"
```

#### Using `mosquitto_pub` (Terminal 2)
```bash
# Publish an alert
mosquitto_pub -h 127.0.0.1 -p 1883 -t "aegis/cameras/cam-01/alerts" -m '{"event": "tamper_detected"}'

# Access the honeytoken bait topic to trip the alert
mosquitto_pub -h 127.0.0.1 -p 1883 -t "aegis/cameras/cam-01/vault_credentials" -m '{"action": "dump_keys"}'
```

---

## 3. Containerization Architecture (Least Privilege)

The setup is containerized using Docker and Docker Compose with defense-in-depth:

```text
[Host Loopback 127.0.0.1]
   ├── 127.0.0.1:8000 ──> [aegis-operator container] (FastAPI + Dashboard)
   ├── 127.0.0.1:2222 ──> [aegis-decoy container]    (SSH Decoy)
   └── 127.0.0.1:1883 ──> [aegis-decoy container]    (MQTT Decoy)
```

- **Separation of Services:** Decoy honeypots (`aegis-decoy`) run separately from operator APIs (`aegis-operator`).
- **Unprivileged User:** Both containers run as `USER 10001:10001` (`aegis`), preventing root privilege escalation.
- **Capabilities Dropped:** `cap_drop: [ ALL ]` and `security_opt: [ "no-new-privileges:true" ]`.
- **Read-Only Root Filesystem:** Root filesystem is mounted read-only with a temporary 64MB `tmpfs` at `/tmp`.
- **No Host Volume Mounts:** No host filesystem directories are mounted into the containers.

---

## 4. Honest Protocol Capability & Untested Feature Report

### SSH Decoy (`ssh_decoy.py`)
- **Tested & Verified:**
  - Password authentication via real `asyncssh` client.
  - Interactive pseudo-terminal shell with line-buffered input.
  - Virtual filesystem navigation and command execution (`pwd`, `uname`, `ls`, `cat`).
  - Honeytoken access detection and Rickroll payload transmission.
  - Denial of TCP port forwarding (`ChannelOpenError`).
  - Rejection of invalid credentials (`PermissionDenied`).
- **Untested / Un-scoped:**
  - Public-key authentication is not enabled (decoy relies on password auth to trap credential-spraying botnets).
  - PTY window resize signals (`SIGWINCH` / `TIOCSWINSZ`) are not dynamically handled; standard terminal dimensions (80x24) are assumed.

### MQTT Decoy (`mqtt_decoy.py`)
- **Tested & Verified:**
  - MQTT 3.1.1 protocol handshake (CONNECT, CONNACK, SUBSCRIBE, SUBACK, PUBLISH, PUBACK, PINGREQ, PINGRESP, DISCONNECT).
  - Client connections using `paho-mqtt`.
  - Topic subscription, retained message dispatch, and publication capture.
  - Honeytoken bait topic trip detection.
  - In-memory broadcast isolation.
- **Untested / Un-scoped:**
  - MQTT QoS 2 (`EXACTLY_ONCE` 4-step handshake) is not implemented; QoS 0 (`AT_MOST_ONCE`) and QoS 1 (`AT_LEAST_ONCE`) are implemented.
  - MQTT v5.0 features (e.g. User Properties, Topic Aliases, Shared Subscriptions) are not implemented (MQTT v3.1.1 is standard for embedded IoT).
  - MQTTS (TLS encryption on port 8883) is un-scoped for the local loopback demo.
