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
    if hasattr(module, "router"):
        app.include_router(module.router)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
