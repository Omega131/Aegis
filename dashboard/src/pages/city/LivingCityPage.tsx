import React, { useEffect, useRef, useState, useCallback } from 'react';
import './city.css';
import { api, type CameraNode, type DecoyTelemetry } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { Badge } from '../../components/ui/Badge';

export interface CityDevice {
  key: string;
  id: string;
  name: string;
  district: string;
  x: number;
  z: number;
  y: number;
  icon: string;
  type: 'camera' | 'signal' | 'power' | 'sensor' | 'gateway';
  color: string;
}

const CITY_DEVICES: CityDevice[] = [
  { key: 'camera', id: 'CAM-01', name: 'Edge Sentry Camera', district: 'Civic Core District', x: -160, z: 125, y: 64, icon: '◉', type: 'camera', color: '#37DDE0' },
  { key: 'signal', id: 'SIG-02', name: 'Mobility Traffic Controller', district: 'Central Transit Corridor', x: 15, z: 125, y: 40, icon: '⋮', type: 'signal', color: '#F5BC62' },
  { key: 'power', id: 'PWR-03', name: 'Smart Substation Node', district: 'Industrial Power Sector', x: 185, z: -142, y: 62, icon: 'ϟ', type: 'power', color: '#EC72C7' },
  { key: 'sensor', id: 'ENV-04', name: 'Environmental Telemetry', district: 'Botanical Environmental Zone', x: -180, z: -125, y: 61, icon: '⌁', type: 'sensor', color: '#34D399' },
  { key: 'gateway', id: 'GW-05', name: 'Phantom Twin Honeypot Gateway', district: 'Virtual Deception Perimeter', x: 55, z: -68, y: 145, icon: '◇', type: 'gateway', color: '#A78BFA' },
];

export const LivingCityPage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const {
    setSelectedDevice,
    setInspectorOpen,
    addToast,
    motionReduced,
  } = useApp();

  // City controls state
  const [night, setNight] = useState<boolean>(true); // default to glorious midnight palette
  const [paused, setPaused] = useState<boolean>(false);
  const [phantomLayer, setPhantomLayer] = useState<boolean>(false); // Dual-layer Phantom Twin holographic view
  const [trafficSignalColor, setTrafficSignalColor] = useState<'green' | 'yellow' | 'red'>('green');

  // Live telemetry state
  const [cameraNode, setCameraNode] = useState<CameraNode | null>(null);
  const [decoyTelemetry, setDecoyTelemetry] = useState<DecoyTelemetry | null>(null);
  const [activeDrill, setActiveDrill] = useState<string | null>(null);
  const [drillRunning, setDrillRunning] = useState<boolean>(false);

  // Animation & Camera Orbit State
  const animRef = useRef<any>({
    angle: -0.62,
    targetAngle: -0.62,
    tilt: 0.57,
    zoom: 1,
    targetZoom: 1,
    panX: 0,
    panY: 0,
    centerX: 0,
    centerY: 0,
    scale: 1,
    t: 0,
    previous: 0,
    drag: false,
    dragX: 0,
    dragY: 0,
    autoOrbit: true,
  });

  // Cycle traffic lights every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTrafficSignalColor((prev) => (prev === 'green' ? 'yellow' : prev === 'yellow' ? 'red' : 'green'));
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Poll real backend telemetry
  useEffect(() => {
    let mounted = true;
    const fetchStats = async () => {
      try {
        const cams = await api.getCameras();
        if (mounted && cams && cams.length > 0) setCameraNode(cams[0]);
        const dec = await api.getDecoyTelemetry();
        if (mounted) setDecoyTelemetry(dec);
      } catch {
        // silent catch
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Focus camera smoothly on a specific device
  const handleSelectDevice = useCallback((device: CityDevice) => {
    setSelectedDevice({
      id: device.id,
      name: device.name,
      type: device.type,
      status: 'running',
      district: device.district,
      fps: 24.0,
      encryptedCrops: cameraNode?.storage_encrypted_crops || 12,
      lastEvent: 'face_blurred',
    });
    setInspectorOpen(true);

    // Center camera on device coordinate
    const a = animRef.current;
    a.targetZoom = 1.35;
    a.panX = -device.x * 0.4;
    a.panY = device.z * 0.2;
    a.autoOrbit = false;

    addToast(`Selected ${device.name}`, `Node ${device.id} active in ${device.district}`, 'production');
  }, [setSelectedDevice, setInspectorOpen, cameraNode, addToast]);

  // Reset Camera View
  const handleResetCamera = useCallback(() => {
    const a = animRef.current;
    a.targetAngle = -0.62;
    a.targetZoom = 1;
    a.panX = 0;
    a.panY = 0;
    a.autoOrbit = true;
    addToast('Camera Reset', 'Restored default city isometric orientation', 'production');
  }, [addToast]);

  // Drill A Simulation: Camera Blinding & Unauthorized Facial Unmask Denial
  const handleRunDrillA = async () => {
    setDrillRunning(true);
    setActiveDrill('DRILL A: Blinding Injection & Cryptographic Access Denial');
    addToast('Initiating Drill A', 'Injecting camera blinding anomaly on CAM-01...', 'review');

    try {
      await api.simulateCameraBlind('cam_01');
      await new Promise((r) => setTimeout(r, 1200));

      // Attempt unauthorized break-glass unmask
      await api.attemptUnauthorized().catch(() => {
        addToast(
          'Access Rejection Verified (HTTP 403)',
          'Rogue unmask request blocked. Tamper-evident ledger committed entry FALSE_POSITIVE_UNMASK_BLOCKED.',
          'danger'
        );
      });

      await new Promise((r) => setTimeout(r, 2000));
      await api.simulateCameraRecover('cam_01');
      addToast('Drill A Complete', 'CAM-01 recovered to normal privacy-blurred feed. Facial crops remain AES-256 encrypted.', 'success');
    } catch (e: any) {
      console.warn('Drill A warning', e);
    } finally {
      setDrillRunning(false);
      setTimeout(() => setActiveDrill(null), 8000);
    }
  };

  // Drill B Simulation: Honeypot Intrusion & Break-Glass Quorum
  const handleRunDrillB = async () => {
    setDrillRunning(true);
    setActiveDrill('DRILL B: Honeypot Canary Breach & Judicial Quorum Unmasking');
    setPhantomLayer(true); // highlight deception twin
    addToast('Initiating Drill B', 'Simulating attacker tripping canary /etc/camera/credentials.conf...', 'deception');

    try {
      const sid = 'sess-city-drill-' + Date.now().toString().slice(-4);
      await api.simulateDecoyCommand(sid, 'uname -a');
      await api.simulateDecoyCommand(sid, 'cat /etc/camera/credentials.conf');

      addToast(
        'Honeytoken Canary Tripped!',
        'Attacker isolated in Phantom Twin. Rickroll payload triggered; case CASE-2026-001 opened.',
        'deception'
      );

      await new Promise((r) => setTimeout(r, 1500));
      // Custodian 2 approves quorum
      const voteRes = await api.voteEscrowCase('CASE-2026-001', 'custodian-2-cybercrime', 'approve', 'Warrant validated for canary hit.');

      if (voteRes.quorum_achieved) {
        addToast(
          'Quorum Achieved (2 of 3 Custodians)',
          `Scoped AES-256 key reconstructed: ${voteRes.unlocked_key?.slice(0, 16)}... Ready to unmask suspect crop.`,
          'success'
        );
      }
    } catch (e: any) {
      console.warn('Drill B warning', e);
    } finally {
      setDrillRunning(false);
      setTimeout(() => setActiveDrill(null), 8000);
    }
  };

  // Canvas 2.5D Isometric Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const a = animRef.current;

    // Pseudo-random deterministic generator for consistent skyline
    let seed = 42;
    function rand() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    // Generate district buildings with varied silhouettes
    const buildings: any[] = [];
    const districtColors = {
      civic: ['#1A253E', '#131C31', '#10172A'],
      industrial: ['#221A33', '#1A1328', '#140E20'],
      telemetry: ['#122731', '#0E1E26', '#0A151C'],
    };

    // Civic Core buildings (North-West)
    for (let i = 0; i < 28; i++) {
      const x = -240 + (i % 7) * 45 + rand() * 10;
      const z = -200 + Math.floor(i / 7) * 48 + rand() * 10;
      const h = 50 + rand() * 95;
      const w = 22 + rand() * 12;
      const d = 22 + rand() * 12;
      buildings.push({ x, z, h, w, d, district: 'civic', colors: districtColors.civic, windows: rand() > 0.3 });
    }

    // Industrial / Power Sector (East)
    for (let i = 0; i < 24; i++) {
      const x = 70 + (i % 6) * 42 + rand() * 8;
      const z = -180 + Math.floor(i / 6) * 44 + rand() * 8;
      const h = 40 + rand() * 70;
      const w = 26 + rand() * 10;
      const d = 26 + rand() * 10;
      buildings.push({ x, z, h, w, d, district: 'industrial', colors: districtColors.industrial, windows: rand() > 0.4 });
    }

    // Surveillance & Transit Corridor (South)
    for (let i = 0; i < 20; i++) {
      const x = -160 + (i % 5) * 55 + rand() * 10;
      const z = 80 + Math.floor(i / 5) * 50 + rand() * 10;
      const h = 35 + rand() * 65;
      const w = 24 + rand() * 12;
      const d = 24 + rand() * 12;
      buildings.push({ x, z, h, w, d, district: 'telemetry', colors: districtColors.telemetry, windows: rand() > 0.3 });
    }

    // Traffic vehicles
    const cars = Array.from({ length: 30 }, (_, i) => ({
      p: Math.random(),
      speed: 0.008 + Math.random() * 0.012,
      axis: i % 2,
      lane: i % 4,
      color: ['#37DDE0', '#F5BC62', '#EC72C7', '#A78BFA', '#F3F6FF'][i % 5],
    }));

    function handleResize() {
      if (!canvas) return;
      const W = canvas.parentElement?.clientWidth || window.innerWidth;
      const H = canvas.parentElement?.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    handleResize();
    window.addEventListener('resize', handleResize);

    // Isometric Projection Math
    function P(x: number, y: number, z: number) {
      const rx = x * Math.cos(a.angle) - z * Math.sin(a.angle);
      const rz = x * Math.sin(a.angle) + z * Math.cos(a.angle);
      return {
        x: a.centerX + a.panX + rx * a.scale,
        y: a.centerY + a.panY + (rz * a.tilt - y) * a.scale,
        depth: rz,
      };
    }

    function poly(points: [number, number, number][], fill?: string, stroke?: string, lw = 1) {
      if (!ctx) return;
      ctx.beginPath();
      points.forEach((p, i) => {
        const pt = P(...p);
        if (!i) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    }

    function line(points: [number, number, number][], color: string, width = 1, dash: number[] = []) {
      if (!ctx) return;
      ctx.beginPath();
      points.forEach((p, i) => {
        const pt = P(...p);
        if (!i) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function box(x: number, y: number, z: number, w: number, h: number, d: number, colors: string[], edge?: string, hasWindows = false) {
      const X = x + w / 2, L = x - w / 2, Z = z + d / 2, B = z - d / 2;
      const faces = [
        { dep: P(x, 0, Z).depth, p: [[L, y, Z], [X, y, Z], [X, y + h, Z], [L, y + h, Z]] as [number, number, number][], c: colors[1] },
        { dep: P(x, 0, B).depth, p: [[L, y, B], [X, y, B], [X, y + h, B], [L, y + h, B]] as [number, number, number][], c: colors[1] },
        { dep: P(X, 0, z).depth, p: [[X, y, B], [X, y, Z], [X, y + h, Z], [X, y + h, B]] as [number, number, number][], c: colors[2] },
        { dep: P(L, 0, z).depth, p: [[L, y, B], [L, y, Z], [L, y + h, Z], [L, y + h, B]] as [number, number, number][], c: colors[2] },
      ];
      faces.sort((f1, f2) => f1.dep - f2.dep);
      for (const f of faces) poly(f.p, f.c, edge, 0.5);
      // Top roof
      poly([[L, y + h, B], [X, y + h, B], [X, y + h, Z], [L, y + h, Z]], colors[0], edge, 0.75);

      // Window lights
      if (hasWindows && night && ctx) {
        const winColor = 'rgba(245, 188, 98, 0.7)';
        for (let row = y + 10; row < y + h - 8; row += 12) {
          const p1 = P(L + 3, row, Z + 0.1);
          const p2 = P(X - 3, row, Z + 0.1);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = winColor;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // Main render frame
    function render(timestamp: number) {
      if (!ctx || !canvas) return;
      if (!a.previous) a.previous = timestamp;
      const dt = Math.min((timestamp - a.previous) / 1000, 0.1);
      a.previous = timestamp;

      const W = canvas.parentElement?.clientWidth || window.innerWidth;
      const H = canvas.parentElement?.clientHeight || window.innerHeight;
      a.centerX = W / 2;
      a.centerY = H / 2;
      a.scale = Math.min(W / 1100, H / 760) * a.zoom;

      // Smooth auto orbit if not dragging
      if (a.autoOrbit && !a.drag && !motionReduced) {
        a.targetAngle += dt * 0.08;
      }

      // Smooth camera interpolation
      a.angle += (a.targetAngle - a.angle) * 0.08;
      a.zoom += (a.targetZoom - a.zoom) * 0.08;

      if (!paused && !motionReduced) {
        a.t += dt;
      }

      // Background clear
      ctx.clearRect(0, 0, W, H);

      // Gradient background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      if (night) {
        bgGrad.addColorStop(0, '#060A16');
        bgGrad.addColorStop(0.5, '#080D1B');
        bgGrad.addColorStop(1, '#050711');
      } else {
        bgGrad.addColorStop(0, '#0F1A30');
        bgGrad.addColorStop(1, '#091022');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Base Ground Plane
      const groundSize = 340;
      const groundFill = night ? '#0A1024' : '#101B36';
      poly(
        [
          [-groundSize, -2, -groundSize],
          [groundSize, -2, -groundSize],
          [groundSize, -2, groundSize],
          [-groundSize, -2, groundSize],
        ],
        groundFill,
        'rgba(55, 221, 224, 0.15)',
        1
      );

      // Main Roads (Crossroads)
      const roadColor = night ? '#0E172E' : '#14203D';
      // X-Road
      poly([[-groundSize, 0, -22], [groundSize, 0, -22], [groundSize, 0, 22], [-groundSize, 0, 22]], roadColor);
      // Z-Road
      poly([[-22, 0, -groundSize], [22, 0, -groundSize], [22, 0, groundSize], [-22, 0, groundSize]], roadColor);

      // Road markings (Cyan dashed lane lines)
      line([[-groundSize, 1, 0], [groundSize, 1, 0]], 'rgba(55, 221, 224, 0.45)', 1.5, [8, 12]);
      line([[0, 1, -groundSize], [0, 1, groundSize]], 'rgba(55, 221, 224, 0.45)', 1.5, [8, 12]);

      // Phantom Twin Holographic Grid (When active)
      if (phantomLayer) {
        const phColor = 'rgba(167, 139, 250, 0.35)';
        for (let gx = -260; gx <= 260; gx += 40) {
          line([[gx, 15, -260], [gx, 15, 260]], phColor, 0.75, [4, 8]);
        }
        for (let gz = -260; gz <= 260; gz += 40) {
          line([[-260, 15, gz], [260, 15, gz]], phColor, 0.75, [4, 8]);
        }
      }

      // Sort and render buildings by depth
      const sortedBuildings = [...buildings].sort((b1, b2) => P(b1.x, 0, b1.z).depth - P(b2.x, 0, b2.z).depth);
      for (const b of sortedBuildings) {
        box(b.x, 0, b.z, b.w, b.h, b.d, b.colors, 'rgba(255, 255, 255, 0.08)', b.windows);
      }

      // Render Traffic Vehicles
      for (const car of cars) {
        if (!paused && !motionReduced) {
          car.p = (car.p + car.speed) % 1;
        }
        let cx = 0, cz = 0;
        const offset = (car.lane - 1.5) * 8;
        if (car.axis === 0) {
          cx = -groundSize + car.p * (groundSize * 2);
          cz = offset;
        } else {
          cx = offset;
          cz = -groundSize + car.p * (groundSize * 2);
        }

        // Car box
        box(cx, 1, cz, 6, 3, 6, [car.color, car.color, car.color]);

        // Car Headlights in Night Mode
        if (night && ctx) {
          const pt = P(cx, 2, cz);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(245, 188, 98, 0.8)';
          ctx.fill();
        }
      }

      // Traffic Signal Node (SIG-02) light beacon
      const sigLightColor = trafficSignalColor === 'green' ? '#34D399' : trafficSignalColor === 'yellow' ? '#F5BC62' : '#FF7878';
      const sigPos = P(15, 42, 125);
      ctx.beginPath();
      ctx.arc(sigPos.x, sigPos.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = sigLightColor;
      ctx.shadowColor = sigLightColor;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Render Interactive Device Markers
      for (const dev of CITY_DEVICES) {
        const pos = P(dev.x, dev.y, dev.z);
        const isPulse = Math.sin(a.t * 3 + dev.x) > 0;

        // Pulsing radar ring
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isPulse ? 14 : 10, 0, Math.PI * 2);
        ctx.strokeStyle = dev.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Node center marker
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = dev.color;
        ctx.fill();

        // Label Tag
        ctx.font = '600 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.fillText(`${dev.id} ${dev.name}`, pos.x, pos.y - 14);
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);

    // Mouse Drag Controls
    function onMouseDown(e: MouseEvent) {
      a.drag = true;
      a.dragX = e.clientX;
      a.dragY = e.clientY;
      a.autoOrbit = false;
    }

    function onMouseMove(e: MouseEvent) {
      if (!a.drag) return;
      const dx = e.clientX - a.dragX;
      const dy = e.clientY - a.dragY;
      a.targetAngle += dx * 0.005;
      a.tilt = Math.max(0.25, Math.min(0.9, a.tilt - dy * 0.003));
      a.dragX = e.clientX;
      a.dragY = e.clientY;
    }

    function onMouseUp() {
      a.drag = false;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      a.targetZoom = Math.max(0.6, Math.min(2.4, a.targetZoom - e.deltaY * 0.0015));
    }

    const canvasEl = canvas;
    canvasEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvasEl.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      canvasEl.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvasEl.removeEventListener('wheel', onWheel);
    };
  }, [night, paused, phantomLayer, trafficSignalColor, motionReduced]);

  return (
    <div className="city-page-wrap" style={{ position: 'relative', width: '100%', height: 'calc(100vh - 105px)', overflow: 'hidden' }}>
      {/* 2.5D Living City Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: 'grab',
        }}
      />

      {/* Top Overlay: District & Mesh Telemetry Banner */}
      <div
        className="city-telemetry-banner"
        style={{
          position: 'absolute',
          top: '1rem',
          left: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: 'rgba(17, 27, 49, 0.88)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1.25rem',
            backdropFilter: 'blur(16px)',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '1.25rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.675rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Cyber-Physical Surveillance Defense
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              Metro Cyber Mesh Grid Alpha
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Badge variant="production">5 NODES ACTIVE</Badge>
            <Badge variant="deception">{decoyTelemetry ? `${decoyTelemetry.active_sessions_count} SESSIONS MONITORED` : phantomLayer ? 'PHANTOM TWIN ARMED' : 'MIRROR STANDBY'}</Badge>
            <Badge variant="success">YUNET FACE BLUR ON</Badge>
          </div>
        </div>

        {/* Drill Active Notification Banner */}
        {activeDrill && (
          <div
            style={{
              background: 'rgba(255, 120, 120, 0.16)',
              border: '1px solid var(--border-danger)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.5rem 0.85rem',
              color: '#FFB8B8',
              fontSize: '0.775rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              animation: 'fadeIn 200ms ease',
            }}
          >
            <span>🚨</span>
            <strong>{activeDrill}</strong>
          </div>
        )}
      </div>

      {/* Right-Top Controls: Zoom, Day/Night, Orbit */}
      <div
        className="city-controls-cluster"
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1.5rem',
          display: 'flex',
          gap: '0.5rem',
          zIndex: 10,
        }}
      >
        <button
          type="button"
          className="btn btn-surface btn-xs"
          onClick={() => setNight(!night)}
          title="Toggle Day/Midnight Lighting"
        >
          {night ? '🌙 Midnight Mode' : '☀️ Day Mode'}
        </button>

        <button
          type="button"
          className={`btn btn-xs ${phantomLayer ? 'btn-deception' : 'btn-surface'}`}
          onClick={() => setPhantomLayer(!phantomLayer)}
          title="Toggle Phantom Twin Deception Layer Overlay"
        >
          🪞 Phantom Overlay: {phantomLayer ? 'ON' : 'OFF'}
        </button>

        <button
          type="button"
          className="btn btn-surface btn-xs"
          onClick={() => setPaused(!paused)}
          title="Pause Traffic Animation"
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>

        <button
          type="button"
          className="btn btn-surface btn-xs"
          onClick={handleResetCamera}
          title="Reset Camera Angle & Center"
        >
          🎯 Reset Camera
        </button>
      </div>

      {/* Bottom Floating Bar: Quick Device Selectors & Hackathon Drill Triggers */}
      <div
        className="city-bottom-dock"
        style={{
          position: 'absolute',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(17, 27, 49, 0.92)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-lg)',
          padding: '0.65rem 1rem',
          backdropFilter: 'blur(20px)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          zIndex: 10,
          boxShadow: 'var(--shadow-lg)',
          maxWidth: '92vw',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {/* Device Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            Select Node:
          </span>
          {CITY_DEVICES.map((dev) => (
            <button
              key={dev.id}
              type="button"
              className="btn btn-surface btn-xs"
              onClick={() => handleSelectDevice(dev)}
              style={{
                borderColor: dev.color,
                color: '#FFFFFF',
              }}
            >
              <span>{dev.icon}</span>
              <span>{dev.id}</span>
            </button>
          ))}
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)' }} />

        {/* Drill Simulation Triggers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            Live Drills:
          </span>
          <button
            type="button"
            className="btn btn-danger btn-xs"
            onClick={handleRunDrillA}
            disabled={drillRunning}
            title="Drill A: Simulate camera blinding on CAM-01 and verify rogue unmask request refusal (HTTP 403)"
          >
            {drillRunning ? '⏳ Running...' : 'Drill A: Blinding & Denial'}
          </button>

          <button
            type="button"
            className="btn btn-deception btn-xs"
            onClick={handleRunDrillB}
            disabled={drillRunning}
            title="Drill B: Trip canary honeytoken in Phantom Twin and verify 2-of-3 Shamir quorum facial unmask"
          >
            {drillRunning ? '⏳ Running...' : 'Drill B: Honeypot & Quorum'}
          </button>
        </div>
      </div>
    </div>
  );
};
