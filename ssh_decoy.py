"""
AegisMirage Real SSH Honeypot Protocol Interface.

Owner: Member B — Stage 2 (Phantom Twin Core Decoy)

Features:
1. Maintained SSH server using `asyncssh`.
2. Generates an ephemeral or local development host key (kept out of Git via .gitignore).
3. Simulated interactive virtual shell routed ONLY to the decoy engine (no host execution).
4. Disables all dangerous features:
   - Port forwarding (TCP/X11) disabled
   - Agent forwarding disabled
   - SFTP & subsystems disabled
   - No host shell/subprocess execution
5. Safe authentication logging:
   - Passwords are NEVER stored in raw plaintext (stored as SHA-256 fingerprint / masked).
   - Explicit demo auth behavior: common demo credentials (`admin:admin`, `root:root`, `root:123456`, `root:xc3511`)
     and demo operator credentials grant access to simulate getting trapped in the virtual camera.
6. Resource bounds:
   - Max concurrent connections: 10
   - Connection inactivity timeout: 120 seconds
   - Max input line size: 2048 bytes
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import pathlib
import time
from typing import Dict, Optional, Tuple

import asyncssh

import decoy

# =============================================================================
# Constants & Resource Limits
# =============================================================================

DEFAULT_SSH_PORT = 2222
DEFAULT_SSH_HOST = "127.0.0.1"  # Bound to loopback by default for safety

MAX_CONCURRENT_CONNECTIONS = 10
CONNECTION_TIMEOUT_SECONDS = 120.0
MAX_SESSION_DURATION_SECONDS = 300.0
MAX_INPUT_LINE_BYTES = 2048

HOST_KEY_FILE = pathlib.Path("decoy_ssh_host_key")

# Recognized demo credentials that allow an attacker to enter the trapped decoy
DEMO_VALID_CREDENTIALS = {
    ("root", "root"),
    ("root", "123456"),
    ("root", "xc3511"),
    ("admin", "admin"),
    ("admin", "123456"),
    ("default", "default"),
    ("demo_operator", "SmartCity2026!"),
}


# =============================================================================
# Host Key Generation (Kept out of Git)
# =============================================================================

def get_or_generate_host_key() -> asyncssh.SSHKey:
    """
    Loads existing host key or generates a new 2048-bit RSA key.
    The file `decoy_ssh_host_key` is matched by .gitignore and never committed.
    """
    if HOST_KEY_FILE.exists():
        try:
            return asyncssh.read_private_key(str(HOST_KEY_FILE))
        except Exception as e:
            print(f"[SSH Decoy] Error reading host key file, generating fresh key: {e}")

    # Generate new RSA private key
    key = asyncssh.generate_private_key("ssh-rsa", key_size=2048)
    try:
        HOST_KEY_FILE.write_bytes(key.export_private_key())
        print(f"[SSH Decoy] Generated new development host key at {HOST_KEY_FILE} (gitignored)")
    except Exception as e:
        print(f"[SSH Decoy] Warning: Could not write host key to disk (using in-memory): {e}")

    return key


# =============================================================================
# Safe Credential Fingerprinting
# =============================================================================

def safe_credential_summary(password: str) -> str:
    """
    Converts a raw password into a non-reversible cryptographic fingerprint
    and masked string. Raw passwords are NEVER logged or stored.
    """
    if not password:
        return "<empty>"
    sha_fp = hashlib.sha256(password.encode("utf-8")).hexdigest()[:12]
    masked = password[0] + ("*" * max(1, len(password) - 2)) + (password[-1] if len(password) > 1 else "")
    return f"masked:{masked}[sha256:{sha_fp}]"


# =============================================================================
# Interactive Shell Terminal Session
# =============================================================================

class AegisSSHTerminalSession(asyncssh.SSHServerSession):
    """
    Interactive virtual terminal session.
    Routes every typed command strictly to `decoy.execute_decoy_command`.
    Does NOT invoke any OS shell, subprocess, or local file execution.
    """

    def __init__(self, server: AegisSSHServer) -> None:
        self.server = server
        self.chan: Optional[asyncssh.SSHServerChannel] = None
        self.buffer = ""
        self.session_id: str = server.session_id
        self.source_ip: str = server.peer_ip
        self.start_time: float = time.time()
        self.last_active: float = time.time()

    def connection_made(self, chan: asyncssh.SSHServerChannel) -> None:
        self.chan = chan

    def connection_lost(self, exc: Optional[Exception]) -> None:
        """Called when terminal session connection is lost."""
        decoy.end_decoy_session(self.session_id)

    def shell_requested(self) -> bool:
        """Called when interactive shell is requested."""
        return True

    def session_started(self) -> None:
        """Sends the initial decoy Linux banner and prompt upon session start."""
        if not self.chan:
            return
        banner = (
            "\r\n"
            "AegisOS SmartCam IoT Linux 5.10.0-arm64 (aarch64)\r\n"
            "Camera Node ID: cam-smart-04 [Perimeter Gateway Node]\r\n"
            "Firmware: v2.14-stable | Authorized maintenance access only.\r\n"
            "\r\n"
        )
        self.chan.write(banner)
        self.chan.write("root@aegis-cam:~# ")

    def data_received(self, data: str, datatype: Optional[int] = None) -> None:
        """Handles keystrokes and line-buffered command execution."""
        if not self.chan:
            return

        now = time.time()
        # Enforce max session duration
        if now - self.start_time > MAX_SESSION_DURATION_SECONDS:
            self.chan.write("\r\n[-] Session duration limit (300s) exceeded. Disconnecting.\r\n")
            self.chan.close()
            decoy.end_decoy_session(self.session_id)
            return

        # Enforce idle/inactivity timeout
        if now - self.last_active > CONNECTION_TIMEOUT_SECONDS:
            self.chan.write("\r\n[-] Session idle timeout (120s) exceeded. Disconnecting.\r\n")
            self.chan.close()
            decoy.end_decoy_session(self.session_id)
            return

        self.last_active = now

        # Check line length limit
        if len(self.buffer) + len(data) > MAX_INPUT_LINE_BYTES:
            self.chan.write("\r\n[-] Error: Command line exceeds maximum input buffer (2048 bytes).\r\n")
            self.chan.close()
            decoy.end_decoy_session(self.session_id)
            return

        for char in data:
            if char in ("\r", "\n"):
                self.chan.write("\r\n")
                command = self.buffer.strip()
                self.buffer = ""

                if command:
                    # Handle shell termination
                    if command.lower() in ("exit", "logout", "quit"):
                        self.chan.write("Connection closed by foreign host.\r\n")
                        self.chan.close()
                        decoy.end_decoy_session(self.session_id)
                        return

                    # Execute command in virtual decoy filesystem sandbox
                    output, event = decoy.execute_decoy_command(self.session_id, command)

                    # Ensure output has CRLF for SSH terminal
                    formatted_output = output.replace("\r\n", "\n").replace("\n", "\r\n")
                    self.chan.write(formatted_output)

                # Prompt for next command
                self.chan.write("root@aegis-cam:~# ")
            elif char in ("\x08", "\x7f"):  # Backspace
                if self.buffer:
                    self.buffer = self.buffer[:-1]
                    self.chan.write("\b \b")
            elif char == "\x03":  # Ctrl+C
                self.buffer = ""
                self.chan.write("^C\r\nroot@aegis-cam:~# ")
            elif char == "\x04":  # Ctrl+D (EOF)
                self.chan.write("exit\r\n")
                self.chan.close()
                decoy.end_decoy_session(self.session_id)
                return
            else:
                self.buffer += char
                # Echo character back to terminal
                self.chan.write(char)


# =============================================================================
# SSH Server Implementation
# =============================================================================

class AegisSSHServer(asyncssh.SSHServer):
    """
    Custom asyncssh server enforcing honeypot policies:
    - Bounded connections
    - Safe credential logging (no raw passwords)
    - Disabled port forwarding, agent forwarding, and SFTP
    """

    active_connections: int = 0

    def __init__(self) -> None:
        self.session_id: str = f"ssh-{os.urandom(4).hex()}"
        self.peer_ip: str = "127.0.0.1"

    def connection_made(self, conn: asyncssh.SSHServerConnection) -> None:
        """Enforces connection limit and records peer IP."""
        AegisSSHServer.active_connections += 1
        peername = conn.get_extra_info("peername")
        self.peer_ip = peername[0] if peername else "127.0.0.1"
        print(f"[SSH Decoy] Connection established from {self.peer_ip} (Active: {AegisSSHServer.active_connections})")

        if AegisSSHServer.active_connections > MAX_CONCURRENT_CONNECTIONS:
            print(f"[SSH Decoy] Max connections ({MAX_CONCURRENT_CONNECTIONS}) reached. Disconnecting {self.peer_ip}")
            conn.close()

    def connection_lost(self, exc: Optional[Exception]) -> None:
        AegisSSHServer.active_connections = max(0, AegisSSHServer.active_connections - 1)
        print(f"[SSH Decoy] Connection closed from {self.peer_ip} (Remaining: {AegisSSHServer.active_connections})")
        decoy.end_decoy_session(self.session_id)

    # -------------------------------------------------------------------------
    # Disabled Dangerous Features (Least Privilege)
    # -------------------------------------------------------------------------

    def server_requested(self, listen_host: str, listen_port: int) -> bool:
        """Deny remote port forwarding."""
        return False

    def tcpip_forwarding_requested(self, listen_host: str, listen_port: int) -> bool:
        """Deny TCP IP forwarding."""
        return False

    def session_requested(self) -> asyncssh.SSHServerSession:
        """Returns virtual terminal session."""
        return AegisSSHTerminalSession(self)

    # -------------------------------------------------------------------------
    # Safe Authentication Handling
    # -------------------------------------------------------------------------

    def password_auth_supported(self) -> bool:
        return True

    def validate_password(self, username: str, password: str) -> bool:
        """
        Validates authentication while protecting credentials:
        - NEVER stores raw password.
        - Records non-reversible fingerprint in decoy telemetry.
        - Known demo credentials authenticate successfully to draw the attacker
          into the trapped virtual shell.
        """
        is_valid = (username, password) in DEMO_VALID_CREDENTIALS

        # Log authentication attempt in telemetry with safe masked representation
        masked_pwd = safe_credential_summary(password)
        decoy.record_decoy_login(
            session_id=self.session_id,
            source_ip=self.peer_ip,
            service="ssh",
            username=username,
            password=masked_pwd,
            success=is_valid,
        )

        if is_valid:
            print(f"[SSH Decoy] Authenticated as '{username}' from {self.peer_ip} (Entering Phantom Twin)")
            return True
        else:
            print(f"[SSH Decoy] Authentication failed for '{username}' from {self.peer_ip}")
            return False


# =============================================================================
# Decoy SSH Listener Controller
# =============================================================================

class DecoySSHServerController:
    """Manages the lifecycle of the asyncssh honeypot listener."""

    def __init__(
        self,
        host: str = DEFAULT_SSH_HOST,
        port: int = DEFAULT_SSH_PORT,
    ) -> None:
        self.host = host
        self.port = port
        self.server: Optional[asyncssh.SSHListener] = None

    async def start(self) -> None:
        """Starts the asyncssh honeypot server on loopback."""
        host_key = get_or_generate_host_key()

        self.server = await asyncssh.create_server(
            AegisSSHServer,
            self.host,
            self.port,
            server_host_keys=[host_key],
            agent_forwarding=False,
            x11_forwarding=False,
            allow_scp=False,
            sftp_factory=None,
            login_timeout=CONNECTION_TIMEOUT_SECONDS,
            max_line_length=MAX_INPUT_LINE_BYTES,
            encoding="utf-8",
            line_editor=False,
        )
        print(f"[SSH Decoy] Server listening on {self.host}:{self.port} (Loopback / Safe Mode)")

    async def stop(self) -> None:
        """Stops the SSH honeypot server."""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None
            print("[SSH Decoy] Server stopped.")


# Module singleton
_ssh_controller = DecoySSHServerController()


def get_ssh_controller() -> DecoySSHServerController:
    return _ssh_controller
