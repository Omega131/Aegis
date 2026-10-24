import sqlite3
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Shared schema
import schema

# Five core modules (wired via plain Python imports, single process)
import edge
import decoy
import gateway
import intel
import escrow
import dev_harness

# Storage: local filesystem + a single SQLite file creation
DB_PATH = Path("aegismirage.db")


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.close()


init_db()

app = FastAPI(
    title="AegisMirage Backend",
    description="Single-process backend scaffolding for AegisMirage",
    version="0.1.0",
)

# CORS enabled for Vite dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Mount module routers (auto-discovers routers from edge, decoy, gateway, intel, escrow)
for module in (edge, decoy, gateway, intel, escrow):
    for router_attr in ("router", "decoy_router", "gateway_router"):
        if hasattr(module, router_attr):
            r = getattr(module, router_attr)
            app.include_router(r)


# Inter-module listener: Wire Decoy events directly to Intel clustering engine
def on_decoy_session_event(event: schema.DecoySessionEvent) -> None:
    """Dispatches real honeypot decoy sessions directly to Person C clustering engine."""
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
    except Exception as exc:
        print(f"[MAIN-BRIDGE-WARN] Failed to ingest decoy session: {exc}")


decoy.register_session_listener(on_decoy_session_event)


@app.on_event("startup")
def on_app_startup() -> None:
    print("[MAIN] Starting AegisMirage unified pipeline...")
    try:
        if hasattr(dev_harness, "seed_development_fixtures"):
            dev_harness.seed_development_fixtures()
    except Exception as exc:
        print(f"[MAIN-WARN] Decoy fixtures seed warning: {exc}")
    try:
        edge.start_edge()
    except Exception as exc:
        print(f"[MAIN-WARN] Edge mesh start warning: {exc}")


@app.on_event("shutdown")
def on_app_shutdown() -> None:
    print("[MAIN] Stopping AegisMirage pipeline...")
    try:
        edge.stop_edge()
    except Exception as exc:
        print(f"[MAIN-WARN] Edge mesh stop warning: {exc}")


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
