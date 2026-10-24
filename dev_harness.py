"""
AegisMirage — Person B Development Harness & Server.

Standalone development runner for Stage 2 (Phantom Twin Decoy + Gateway Router).
Runs independently without requiring teammates' modules (edge.py, intel.py, escrow.py),
Docker, RAG, or MQTT.

Features:
- Starts a FastAPI app mounting Person B's gateway and decoy routers.
- Starts/stops the real asyncssh listener correctly on lifecycle hooks.
- Uses explicit local fixtures (MockMemberAEdgeCameraDevice) for missing real-device functionality.
- Demonstrates gateway decisions (real, rate_limit, decoy) and decoy sessions out-of-the-box.
- Completely separate from shared main.py.
"""

from __future__ import annotations

import contextlib
import os
import sys
import time
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

import decoy
import gateway

# Configuration
START_SSH_ON_BOOT = os.environ.get("AEGIS_START_SSH", "0") == "1" or "--with-ssh" in sys.argv
SSH_HOST = os.environ.get("AEGIS_SSH_HOST", "127.0.0.1")
SSH_PORT = int(os.environ.get("AEGIS_SSH_PORT", "2222"))
SEED_ON_BOOT = os.environ.get("AEGIS_SEED_FIXTURES", "1") == "1"


# =============================================================================
# Explicit Local Fixtures for Missing Real-Device Functionality (Person A)
# =============================================================================

class MockMemberAEdgeCameraDevice:
    """
    Explicit local test fixture simulating Person A's real physical IoT Camera.
    
    Used by Person B's development harness while awaiting Person A's edge.py integration.
    When Person B's Gateway Router decides destination='real' (e.g. for allowlisted operators
    or low-risk connections), traffic is dispatched to this fixture handler rather than
    attempting network calls to unprovisioned physical hardware.
    """

    def __init__(
        self,
        camera_id: str = "cam-smart-01",
        stream_rtsp_url: str = "rtsp://10.0.0.50:554/live/ch0",
        firmware_version: str = "v2.14-edge-hardened",
    ) -> None:
        self.camera_id = camera_id
        self.stream_rtsp_url = stream_rtsp_url
        self.firmware_version = firmware_version
        self.invocations: List[Dict[str, Any]] = []

    def handle_real_traffic(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handler invoked when Gateway routes traffic to 'real'.
        Records the forwarded context and simulates genuine device processing.
        """
        record = {
            "fixture": "MockMemberAEdgeCameraDevice",
            "camera_id": self.camera_id,
            "status": "FORWARDED_TO_REAL_CAMERA",
            "timestamp": time.time(),
            "firmware": self.firmware_version,
            "stream_endpoint": self.stream_rtsp_url,
            "context": context,
        }
        self.invocations.append(record)
        print(f"[DevHarness:Fixture] Real device received traffic from {context.get('source_ip')} -> {self.camera_id}")
        return record

    def get_summary(self) -> Dict[str, Any]:
        return {
            "camera_id": self.camera_id,
            "firmware": self.firmware_version,
            "stream_url": self.stream_rtsp_url,
            "total_forwarded_connections": len(self.invocations),
            "recent_forwarded": self.invocations[-5:],
        }


# Singleton fixture instance
mock_real_camera = MockMemberAEdgeCameraDevice()


# =============================================================================
# Demonstration Fixtures & Seed Data
# =============================================================================

def seed_development_fixtures() -> Dict[str, Any]:
    """
    Populates realistic demonstration data showing gateway decisions and decoy sessions.
    Demonstrates:
    1. Gateway routing across all three destinations:
       - 'real' (authorized field technician from allowlisted IP 10.0.0.50)
       - 'rate_limit' (borderline reconnaissance probe from 198.51.100.42)
       - 'decoy' (hostile brute-force scanner from 194.26.29.112)
    2. Active Decoy Sessions:
       - SSH decoy session with login failures, interactive commands, and honeytoken hit.
       - Web decoy session on fake camera portal with config export honeytoken hit.
       - File evidence submission with computed SHA-256 and candidate C2 indicator.
    """
    print("[*] Seeding Person B development fixtures...")

    # 1. Gateway Routing Decisions
    # A. Authorized technician (allowlisted IP -> real device)
    gateway.evaluate_route("10.0.0.50", service="ssh", attempted_creds=("technician", "FieldPass2026!"))
    # Enforce it through the mock camera handler
    gateway.handle_request("10.0.0.50", service="web", context={"action": "view_live_stream"})

    # B. Rate-limited reconnaissance probe (unknown IP, single port probe -> score ~20-30 -> rate_limit)
    gateway.evaluate_route("198.51.100.42", service="rtsp")

    # C. Hostile scanner (repeated failed logins with Mirai defaults -> score >= 60 -> decoy)
    gateway.evaluate_route("194.26.29.112", service="ssh", attempted_creds=("admin", "admin"), is_login_failure=True)
    gateway.evaluate_route("194.26.29.112", service="ssh", attempted_creds=("root", "123456"), is_login_failure=True)

    # 2. Decoy Sessions
    # A. Hostile SSH session with commands and honeytoken hit
    ssh_sid = "sess-ssh-seed-01"
    decoy.record_decoy_login(ssh_sid, "194.26.29.112", "ssh", "root", "root", success=True)
    decoy.execute_decoy_command(ssh_sid, "uname -a")
    decoy.execute_decoy_command(ssh_sid, "ls -la /etc/camera")
    decoy.execute_decoy_command(ssh_sid, "cat /etc/camera/credentials.conf")  # Trips honeytoken

    # B. Web decoy session
    web_sid = "sess-web-seed-02"
    decoy.record_decoy_login(web_sid, "198.51.100.88", "web", "admin", "password123", success=False)
    decoy.record_decoy_login(web_sid, "198.51.100.88", "web", "admin", "admin", success=True)
    decoy.execute_decoy_command(web_sid, "POST /api/decoy/web/login user=admin")
    decoy.flag_honeytoken_hit(web_sid)

    # C. File evidence upload session with static indicator
    payload_sid = "sess-file-seed-03"
    decoy.record_decoy_login(payload_sid, "203.0.113.77", "ssh", "support", "support", success=True)
    harmless_sample = (
        b"#!/bin/sh\n"
        b"# AegisMirage Test Indicator - Harmless Synthetic Drone Beacon\n"
        b"C2_HOST=http://harmless-c2-candidate.example.com:8443/ping\n"
        b"GATEWAY_IP=198.51.100.99\n"
        b"exit 0\n"
    )
    decoy.submit_file_evidence(
        session_id=payload_sid,
        original_filename="drone_beacon.sh",
        file_bytes=harmless_sample,
        source_ip="203.0.113.77",
    )

    print("[*] Development fixtures seeded successfully (1 real, 1 rate_limit, 1 decoy gateway decision; 3 decoy sessions).")
    return {
        "status": "seeded",
        "gateway_decisions": len(gateway.get_all_decisions()),
        "decoy_sessions": len(decoy.get_active_sessions()),
    }


# =============================================================================
# Application Lifespan & Initialization
# =============================================================================

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for Person B harness."""
    print("\n" + "=" * 60)
    print("AegisMirage — Person B (Decoy & Gateway) Harness Starting")
    print("=" * 60)

    # Register Person A's simulated camera device as gateway's real-device target
    gateway.set_real_device_handler(mock_real_camera.handle_real_traffic)
    print("[*] Registered MockMemberAEdgeCameraDevice as gateway real-device target.")

    # Start or idle the real asyncssh server
    if START_SSH_ON_BOOT:
        print(f"[*] Initializing real asyncssh Decoy on {SSH_HOST}:{SSH_PORT}...")
        await decoy.startup(host=SSH_HOST, port=SSH_PORT, start_ssh=True)
    else:
        print("[*] asyncssh Decoy idle on boot (set AEGIS_START_SSH=1 or pass --with-ssh to activate).")
        await decoy.startup(start_ssh=False)

    # Seed demonstration data if configured
    if SEED_ON_BOOT:
        seed_development_fixtures()

    print("[*] Decoy Web Portal:        http://127.0.0.1:8000/api/decoy/web/login")
    print("[*] Operator Telemetry API:  http://127.0.0.1:8000/api/decoy/operator/telemetry")
    print("[*] Gateway Decisions API:   http://127.0.0.1:8000/api/gateway/decisions")
    print("[*] Decoy Sessions API:      http://127.0.0.1:8000/api/decoy/sessions")
    print("[*] Harness Fixture Status:  http://127.0.0.1:8000/api/dev/fixtures")
    print("=" * 60 + "\n")

    yield

    print("\n[*] Shutting down Person B harness...")
    await decoy.shutdown()
    print("[*] Person B harness shutdown complete.")


# Initialize FastAPI application
app = FastAPI(
    title="AegisMirage — Stage 2 Decoy & Gateway Harness",
    description="Person B isolated development server for phantom twin honeypot and routing engine",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS middleware for Vite frontend dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Person B routers
app.include_router(gateway.gateway_router)
app.include_router(decoy.decoy_router)


# =============================================================================
# Development Harness Endpoints
# =============================================================================

@app.get("/health")
def health() -> dict:
    """Harness health probe."""
    return {
        "status": "ok",
        "owner": "Member B",
        "stage": "Stage 2 (Phantom Twin Decoy + Gateway)",
        "modules": ["gateway.py", "decoy.py", "ssh_decoy.py"],
        "ssh_active": START_SSH_ON_BOOT,
        "seed_fixtures_active": SEED_ON_BOOT,
    }


@app.get("/api/dev/fixtures")
def get_fixture_status() -> dict:
    """Inspects invocation records of the local MockMemberAEdgeCameraDevice fixture."""
    return mock_real_camera.get_summary()


@app.post("/api/dev/seed")
def api_seed_fixtures() -> dict:
    """Trigger manual re-seeding of gateway decisions and decoy sessions."""
    return seed_development_fixtures()


@app.post("/api/dev/reset")
def api_reset_fixtures() -> dict:
    """Reset all gateway and decoy session state."""
    gateway.reset_gateway()
    decoy.reset_decoy_state()
    mock_real_camera.invocations.clear()
    return {"status": "reset_complete"}


@app.get("/", include_in_schema=False)
def root_redirect():
    """Redirect root to fake camera login for easy browser demo access."""
    return RedirectResponse(url="/api/decoy/web/login")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("dev_harness:app", host="127.0.0.1", port=port, reload=True)
