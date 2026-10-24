# AegisMirage

AegisMirage is a unified cyber-physical deception and surveillance defense platform engineered for rapid threat containment. It bridges edge-blurred camera mesh feeds, interactive SSH/web decoy honeypots, dynamic perimeter routing, and multi-session campaign clustering under an auditable escrow unblur architecture—all running in a single Python process with zero inter-service network friction and a responsive real-time analyst dashboard.

## Architecture

AegisMirage uses a flat, single-process architecture where all modules interact via direct Python imports and persist locally via a single SQLite file (`aegismirage.db`).

- **`edge.py`** — Owner: Member A — camera mesh + face blur
- **`decoy.py`** — Owner: Member B — honeypot (SSH + web decoy)
- **`gateway.py`** — Owner: Member B — routing logic
- **`intel.py`** — Owner: Member C — campaign clustering
- **`escrow.py`** — Owner: Member C — break-glass + audit log

Supporting files:
- **`main.py`**: Boots the single FastAPI application, wires all five modules, initializes the local SQLite file, and exposes `GET /health`.
- **`schema.py`**: Central typed Pydantic models (`CameraEvent`, `DecoySessionEvent`, `RouteDecision`, `Campaign`, `CaseRequest`). *Rule:* Everyone reads from this file; no edits are made after Hour 2 without updating the change log at the bottom and notifying teammates.
- **`dashboard/`**: React + TypeScript frontend powered by Vite with shell navigation (`Cameras`, `Decoy Activity`, `Campaigns`).

### Environment

All teammates share a single virtual environment (`python -m venv venv`) and package dependencies are centrally maintained in `requirements.txt`.

## How to run

1. Start the single-process backend:
```bash
uvicorn main:app --reload
```

2. Start the dashboard (run from inside the `dashboard/` directory):
```bash
npm run dev
```