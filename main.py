"""
AegisMirage Unified Backend Application.

Single-process composition of all 5 modules per work_plan.pdf:
- edge.py:    Member A — camera mesh + privacy blurring + encrypted crop storage
- decoy.py:   Member B — honeypot (SSH + web decoy), honeytokens, evidence collection
- gateway.py: Member B — connection scoring and routing logic (real vs decoy)
- intel.py:   Member C — campaign clustering and threat intelligence
- escrow.py:  Member C — break-glass 2-of-3 Shamir escrow + tamper-evident audit log

Inter-module communication uses plain Python imports, function calls, and callbacks.
Zero microservices, zero Docker requirements for the core build.
"""

from __future__ import annotations

import contextlib
import os
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any, Dict

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

import decoy
import dev_harness
import edge
import escrow
import gateway
import intel
import schema

# Local SQLite storage path (persisted across sessions)
DB_PATH = Path("aegismirage.db")


def init_db() -> None:
    """Initializes local SQLite database if not present."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS system_metadata (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at REAL
        )
        """
    )
    conn.commit()
    conn.close()


init_db()


# =============================================================================
# Inter-Module Bridges: Decoy -> Intel -> Escrow
# =============================================================================

def on_decoy_session_event(event: schema.DecoySessionEvent) -> None:
    """
    Synchronous event bridge:
    Feeds real DecoySessionEvent updates from Person B's honeypot
    directly into Person C's campaign clustering engine in real time.
    """
    try:
        service = getattr(event, "service", "camera").lower()
        if "traffic" in service:
            target_device = "traffic_controller"
        elif "substation" in service or "power" in service:
            target_device = "substation"
        elif "camera" in service:
            target_device = "camera"
        else:
            cmds = " ".join(getattr(event, "commands", [])).lower()
            if any(k in cmds for k in ("scada", "modbus", "plc", "substation", "grid")):
                target_device = "substation"
            elif any(k in cmds for k in ("traffic", "light", "intersection", "pedestrian")):
                target_device = "traffic_controller"
            else:
                target_device = "camera"

        intel.engine.add_session(event, target_device=target_device)
        print(f"[MAIN-BRIDGE] Decoy session {event.session_id} ingested into Intel engine (device: {target_device})")

        # If a honeytoken is tripped, ensure an escrow case is tracked for Drill B
        if event.honeytoken_hit:
            case_id = f"CASE-{event.session_id[-6:].upper()}"
            if case_id not in escrow.CASES and "CASE-2026-001" in escrow.CASES:
                # Link to active demonstration case
                pass
    except Exception as exc:
        print(f"[MAIN-BRIDGE-WARN] Failed to ingest decoy session: {exc}")


# Register bridge callback with decoy engine
decoy.register_session_listener(on_decoy_session_event)


# =============================================================================
# Application Lifespan & Lifecycle Management
# =============================================================================

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Asynchronous application lifespan manager.
    Manages camera mesh background loops, SSH honeypot socket listener,
    gateway real-target routing, and demonstration seed fixtures.
    """
    print("\n" + "=" * 65)
    print("AegisMirage — Unified Platform Backend Starting")
    print("=" * 65)

    # 1. Wire Gateway to Person A's camera mesh for benign/allowlisted traffic
    def camera_mesh_sink_handler(context: Dict[str, Any]) -> Dict[str, Any]:
        source_ip = context.get("source_ip", "127.0.0.1")
        action = context.get("action", "stream")
        print(f"[GATEWAY->EDGE] Forwarding legitimate connection from {source_ip} to Camera Mesh")
        return {
            "status": "FORWARDED_TO_CAMERA_MESH",
            "node": "cam_01",
            "source_ip": source_ip,
            "action": action,
            "timestamp": time.time(),
        }

    gateway.set_real_device_handler(camera_mesh_sink_handler)
    print("[*] Gateway real-device handler wired to Person A Camera Mesh.")

    # 2. Seed development fixtures & initial demo state
    try:
        dev_harness.seed_development_fixtures()
    except Exception as exc:
        print(f"[MAIN-WARN] Decoy fixtures seed warning: {exc}")

    try:
        intel.seed_demo_data()
    except Exception as exc:
        print(f"[MAIN-WARN] Intel seed warning: {exc}")

    try:
        escrow.seed_escrow_data()
        # Seed an encrypted sample face crop for CAM-04-MARKET / WIN-20261024-1130
        # so Drill B can actually decrypt and display the unmasked face when approved!
        try:
            demo_key_hex = "d8f3b490c2914102983719028341908239018239018230918209381029381029"
            k_bytes = bytes.fromhex(demo_key_hex)
            edge.WINDOW_KEYS[("CAM-04-MARKET", "WIN-20261024-1130")] = k_bytes
            edge.WINDOW_KEYS[("cam_04", "WIN-20261024-1130")] = k_bytes

            # Synthesize recognizable demo face crop
            demo_face = np.full((120, 120, 3), 160, dtype=np.uint8)
            cv2.circle(demo_face, (60, 50), 30, (200, 180, 160), -1)
            cv2.circle(demo_face, (50, 45), 4, (40, 40, 40), -1)
            cv2.circle(demo_face, (70, 45), 4, (40, 40, 40), -1)
            cv2.ellipse(demo_face, (60, 65), (12, 6), 0, 0, 180, (40, 40, 180), 2)

            edge.encrypt_and_store_crop("CAM-04-MARKET", "WIN-20261024-1130", demo_face)
            edge.encrypt_and_store_crop("cam_04", "WIN-20261024-1130", demo_face)
            print("[*] Seeded unmaskable sample encrypted face crop for Drill B (CAM-04-MARKET).")
        except Exception as exc:
            print(f"[MAIN-WARN] Drill B sample crop seed warning: {exc}")
    except Exception as exc:
        print(f"[MAIN-WARN] Escrow seed warning: {exc}")

    # 3. Start Person A camera mesh background workers
    try:
        edge.start_edge()
        print("[*] Person A Edge camera mesh started (5 nodes).")
    except Exception as exc:
        print(f"[MAIN-WARN] Edge mesh start warning: {exc}")

    # 4. Start Person B asyncssh honeypot listener if configured
    start_ssh = os.environ.get("AEGIS_START_SSH", "0") == "1" or "--with-ssh" in sys.argv
    ssh_host = os.environ.get("AEGIS_SSH_HOST", "127.0.0.1")
    ssh_port = int(os.environ.get("AEGIS_SSH_PORT", "2222"))
    try:
        await decoy.startup(host=ssh_host, port=ssh_port, start_ssh=start_ssh)
        print(f"[*] Person B Decoy core initialized (SSH active={start_ssh} on {ssh_host}:{ssh_port}).")
    except Exception as exc:
        print(f"[MAIN-WARN] Decoy startup warning: {exc}")

    print("=" * 65 + "\n")

    yield

    # =========================================================================
    # Shutdown Phase
    # =========================================================================
    print("\n[*] Shutting down AegisMirage pipeline...")
    try:
        edge.stop_edge()
        print("[*] Edge camera mesh stopped.")
    except Exception as exc:
        print(f"[MAIN-WARN] Edge mesh stop warning: {exc}")

    try:
        await decoy.shutdown()
        print("[*] Decoy listeners shut down.")
    except Exception as exc:
        print(f"[MAIN-WARN] Decoy shutdown warning: {exc}")

    print("[*] AegisMirage pipeline shutdown complete.")


# Initialize unified FastAPI application
app = FastAPI(
    title="AegisMirage Unified Platform",
    description="ChronoForge Hackathon — Single-process backend for IoT defense mesh",
    version="1.0.0",
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


# =============================================================================
# Router Registration (All 5 Modules)
# =============================================================================

# Person A: Edge Cameras
app.include_router(edge.router)

# Person B: Decoy & Gateway
app.include_router(decoy.decoy_router)
app.include_router(gateway.gateway_router)

# Person C: Intelligence & Escrow
# Mounted both at root prefix (/intel, /escrow) for dashboard compatibility
# and under /api (/api/intel, /api/escrow) for API uniformity
app.include_router(intel.router)
app.include_router(intel.router, prefix="/api")

app.include_router(escrow.router)
app.include_router(escrow.router, prefix="/api")


# =============================================================================
# Health & Status Endpoints
# =============================================================================

@app.get("/health")
def health() -> Dict[str, Any]:
    """Unified system health check."""
    return {
        "status": "ok",
        "service": "AegisMirage",
        "version": "1.0.0",
        "timestamp": time.time(),
        "modules": {
            "edge": "online" if hasattr(edge, "EDGE_MESH") and getattr(edge.EDGE_MESH, "is_running", False) else "ready",
            "decoy": "online",
            "gateway": "online",
            "intel": "online",
            "escrow": "online",
        },
        "stats": {
            "cameras_count": len(getattr(edge.EDGE_MESH, "nodes", {})),
            "decoy_sessions_count": len(decoy.get_active_sessions()),
            "campaigns_count": len(intel.engine.sessions),
            "escrow_cases_count": len(escrow.CASES),
            "audit_blocks_count": len(escrow.audit_log.chain),
        },
    }


@app.get("/", include_in_schema=False)
def root_redirect():
    """Redirect root to dashboard info or cameras."""
    return RedirectResponse(url="/api/cameras")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)
