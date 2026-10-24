"""
AegisMirage — Person B Development Harness & Server.

Standalone development runner for Stage 2 (Phantom Twin Decoy + Gateway Router).
Runs independently without requiring teammates' modules, Docker, RAG, or MQTT.
"""

from __future__ import annotations

import contextlib
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

import decoy
import gateway

# Configuration
START_SSH_ON_BOOT = os.environ.get("AEGIS_START_SSH", "0") == "1" or "--with-ssh" in sys.argv
SSH_HOST = os.environ.get("AEGIS_SSH_HOST", "127.0.0.1")
SSH_PORT = int(os.environ.get("AEGIS_SSH_PORT", "2222"))


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for Person B harness."""
    print("\n" + "=" * 60)
    print("AegisMirage — Person B (Decoy & Gateway) Harness Starting")
    print("=" * 60)
    
    if START_SSH_ON_BOOT:
        print(f"[*] Initializing real SSH Decoy on {SSH_HOST}:{SSH_PORT}...")
        await decoy.startup(host=SSH_HOST, port=SSH_PORT, start_ssh=True)
    else:
        print("[*] SSH Decoy idle on boot (set AEGIS_START_SSH=1 or pass --with-ssh to activate).")
        await decoy.startup(start_ssh=False)

    print("[*] Decoy Web Portal: http://127.0.0.1:8000/api/decoy/web/login")
    print("[*] Gateway Decisions API: http://127.0.0.1:8000/api/gateway/decisions")
    print("[*] Decoy Telemetry API: http://127.0.0.1:8000/api/decoy/sessions")
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


@app.get("/health")
def health() -> dict:
    """Harness health probe."""
    return {
        "status": "ok",
        "owner": "Member B",
        "stage": "Stage 2 (Phantom Twin Decoy + Gateway)",
        "modules": ["gateway.py", "decoy.py", "ssh_decoy.py"],
        "ssh_active": START_SSH_ON_BOOT,
    }


@app.get("/", include_in_schema=False)
def root_redirect():
    """Redirect root to fake camera login for easy browser demo access."""
    return RedirectResponse(url="/api/decoy/web/login")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("dev_harness:app", host="127.0.0.1", port=port, reload=True)
