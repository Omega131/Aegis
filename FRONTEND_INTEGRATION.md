# AegisMirage Frontend Integration Report

**Date**: 2026-10-24  
**Project**: AegisMirage (ChronoForge Hackathon)  
**Task**: Integrate Supplied Living City Frontend into the Main Application  
**Status**: Complete & Verified  

---

## 1. Source Frontend Folder and Final Integrated Location

- **Source Reference Folder**: [AegisMirage-Frontend](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/AegisMirage-Frontend) (Preserved untouched as an offline standalone reference).
- **Final Integrated Location**: Inside the project's React + Vite workspace at [dashboard/src](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src):
  - **Living City Component**: [dashboard/src/pages/city/LivingCityPage.tsx](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/pages/city/LivingCityPage.tsx) and [city.css](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/pages/city/city.css).
  - **Mirror Console Component**: [dashboard/src/pages/console/ConsolePage.tsx](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/pages/console/ConsolePage.tsx) and [console.css](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/pages/console/console.css).
  - **Centralized Typed API Client**: [dashboard/src/api/client.ts](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/api/client.ts).
  - **Unified Navigation Shell**: [dashboard/src/shell/Navbar.tsx](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/shell/Navbar.tsx) and [dashboard/src/App.tsx](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/App.tsx).
  - **Backend Static Mount**: [main.py](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/main.py) mounts `dashboard/dist` directly at `/app` and the standalone reference at `/living-city-standalone`.

---

## 2. API Mapping Matrix

| UI Element / Feature | Source In Prototype | Actual Backend Endpoint | Integration Status |
| :--- | :--- | :--- | :--- |
| **System Health Badge** | Hardcoded text (`ONLINE`) | `GET /health` | **LIVE**: Polled every 4s; displays live status and subsystem connectivity. |
| **CAM-01 Edge Node** | Hardcoded text & SVG | `GET /api/cameras` & `GET /api/cameras/cam_01/frame` | **LIVE**: Displays real FPS, real encrypted crop count, and streams the real YuNet blurred JPEG frame. |
| **CAM-01 Blinding Drill** | Local-only toggle | `POST /api/cameras/cam_01/simulate/blind` & `POST /api/cameras/cam_01/simulate/recover` | **LIVE**: Action button triggers real backend fault injection and recovery. |
| **Gateway GW-05 / DECOY-01** | Client-side timer | `GET /api/decoy/operator/telemetry` & `GET /api/gateway/stats` | **LIVE**: Displays real isolated session counts and real honeytoken hit counters. |
| **Intrusion Simulation** | Client timer script | `POST /api/decoy/simulate/command` | **LIVE**: Sends `uname -a` and trips `/etc/camera/credentials.conf` honeytoken canary on backend. |
| **Break-Glass Escrow Case** | Simulated boolean | `GET /escrow/cases/CASE-2026-001` | **LIVE**: Queries real pending case, showing 1/2 judicial approvals. |
| **Quorum Warrant Approval** | Hardcoded delay | `POST /escrow/cases/CASE-2026-001/vote` | **LIVE**: Custodian 2 votes approve; backend verifies Shamir 2-of-3 threshold and commits audit block. |
| **Unmasked Face Retrieval** | Illustrated SVG figure | `GET /escrow/cases/CASE-2026-001/footage` | **LIVE**: Returns actual decrypted JPEG face crops; displayed in incident panel. |
| **False-Positive Refusal** | Local text swap | `POST /escrow/attempt-unauthorized` & `GET /escrow/audit-log` | **LIVE**: Server returns HTTP 403 Forbidden; tamper-evident log is committed to hash chain. |
| **Threat Graph & Campaigns** | Static SVG | `GET /intel/campaigns` & `GET /intel/graph` | **LIVE**: Available via Threat Intel tab and Mirror Console. |

---

## 3. Required Environment Variables

Configuration is handled through Vite environment files. A template has been provided in [dashboard/.env.example](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/.env.example):

```env
# Unified FastAPI Backend Base URL
VITE_API_URL=http://localhost:8000
```

---

## 4. Files Changed & Added

### Added
1. [dashboard/src/api/client.ts](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/api/client.ts): Centralized, fully-typed TypeScript API client with timeouts and error handling.
2. [dashboard/src/pages/city/city.css](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/pages/city/city.css): Responsive styles for 3D canvas, controls, inspector, and day/night themes.
3. [dashboard/src/pages/city/LivingCityPage.tsx](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/pages/city/LivingCityPage.tsx): React component embedding the Canvas 2D isometric projection city, interactive markers, and live backend actions.
4. [dashboard/src/pages/city/index.ts](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/pages/city/index.ts): Export for living city page.
5. [dashboard/src/pages/console/console.css](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/pages/console/console.css): Styling for dual-layer network topology, incident timeline, and escrow gate.
6. [dashboard/src/pages/console/ConsolePage.tsx](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/pages/console/ConsolePage.tsx): React component embedding the isometric Mirror City SVG, node inspector, and escrow quorum panel.
7. [dashboard/src/pages/console/index.ts](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/pages/console/index.ts): Export for console page.
8. [dashboard/.env.example](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/.env.example): Environment variable template.

### Modified
1. [dashboard/src/shell/Navbar.tsx](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/shell/Navbar.tsx): Expanded navigation to 5 tabs (`city`, `console`, `cameras`, `decoy`, `campaigns`) with typed API health check.
2. [dashboard/src/App.tsx](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/dashboard/src/App.tsx): Wired `LivingCityPage` as the default landing view, `ConsolePage` as the observatory, and deep subsystem tabs for engineering analysis.
3. [main.py](file:///c:/Users/Madhusudan%20Tiwari/Downloads/AeigisMirage/Aegis/main.py): Added `StaticFiles` mounting for `/app` (compiled frontend) and `/living-city-standalone` (reference files).

---

## 5. Verification Commands and Actual Test Results

### 1. Frontend Lint & Production Build
```powershell
cd dashboard
npm run lint
npm run build
```
- **Linter (`oxlint`)**: **0 warnings, 0 errors** across 20 files.
- **Vite Build (`tsc -b && vite build`)**: **PASSED** in 266ms, producing production assets:
  - `dist/index.html` (0.60 kB)
  - `dist/assets/index-C0Vg8Hqa.css` (59.73 kB)
  - `dist/assets/index-C_3b_T5q.js` (362.14 kB)

### 2. Backend Health & Route Parity Tests
```powershell
powershell -Command "
  Write-Host '1. Backend Health:' (Invoke-RestMethod http://127.0.0.1:8000/health).status
  Write-Host '2. FastAPI Mounted App (/app/):' (Invoke-WebRequest -Uri http://127.0.0.1:8000/app/ -UseBasicParsing).StatusCode
  Write-Host '3. Standalone Reference (/living-city-standalone/):' (Invoke-WebRequest -Uri http://127.0.0.1:8000/living-city-standalone/ -UseBasicParsing).StatusCode
  Write-Host '4. Vite Live Dev Server (http://127.0.0.1:5173/):' (Invoke-WebRequest -Uri http://127.0.0.1:5173/ -UseBasicParsing).StatusCode
"
```
**Results**:
- Backend Health: `ok` (Status 200)
- FastAPI Mounted App: `200 OK`
- Standalone Reference: `200 OK`
- Vite Live Dev Server: `200 OK`

### 3. Full Pipeline & Hackathon Drills
```powershell
.\venv\Scripts\python.exe -m unittest tests.test_full_pipeline
.\venv\Scripts\python.exe run_hackathon_drills.py
```
**Results**:
- `test_full_pipeline`: 9 of 9 unit and integration tests passed.
- `run_hackathon_drills.py`: All 3 drills executed and passed against the live running server.

---

## 6. Known Limitations

1. **Automated Browser Tool Sandbox**:
   - The sandboxed automation environment blocks external Playwright driver downloads (`404` on CDN endpoints).
   - *Status*: Static bundle compilation (`tsc -b`), linting (`oxlint`), and HTTP route parity verify full syntactic and structural correctness. Visual verification should be inspected interactively in your browser at `http://localhost:5173`.
2. **ZK Groth16 Proof Simulation**:
   - Zero-knowledge quorum proofs are simulated in-process over BN254 point representations without external Circom `.r1cs` binary compilation.
3. **Illustrative City Coordinates**:
   - The 3D isometric city layout is an illustrative schematic of smart city IoT nodes, not actual GPS coordinates.

---

## 7. Exact Local Startup Commands & URLs

### Development Mode (Recommended)
```powershell
# Terminal 1: Backend
cd Aegis
.\venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# Terminal 2: Frontend
cd Aegis\dashboard
npm run dev -- --host 127.0.0.1 --port 5173
```
- **Integrated Living City**: [http://localhost:5173](http://localhost:5173)
- **Mirror Command Console**: [http://localhost:5173](http://localhost:5173) (Click "Console ↗")
- **Backend API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

### Production Bundle (Single Server Mode)
```powershell
cd Aegis
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```
- **Integrated App**: [http://localhost:8000/app/](http://localhost:8000/app/) (or root [http://localhost:8000/](http://localhost:8000/))
- **Standalone Reference**: [http://localhost:8000/living-city-standalone/](http://localhost:8000/living-city-standalone/)
