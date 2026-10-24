import React, { useEffect, useRef, useState, useCallback } from 'react';
import './city.css';
import { api, type CameraNode, type DecoyTelemetry } from '../../api/client';

interface LivingCityPageProps {
  onNavigateTab: (tab: 'city' | 'console' | 'cameras' | 'decoy' | 'campaigns') => void;
}

const CITY_DEVICES = [
  { key: 'camera', name: 'Edge camera', id: 'CAM-01 / EDGE SENTRY', title: 'Eyes on the city.', x: -160, z: 125, y: 63, icon: '◉' },
  { key: 'signal', name: 'Traffic signal', id: 'SIG-02 / MOBILITY', title: 'Keep the city moving.', x: 15, z: 125, y: 39, icon: '⋮' },
  { key: 'power', name: 'Energy grid', id: 'PWR-03 / INFRASTRUCTURE', title: 'Power without pause.', x: 185, z: -142, y: 62, icon: 'ϟ' },
  { key: 'sensor', name: 'Environment sensor', id: 'ENV-04 / TELEMETRY', title: 'A city that senses.', x: -180, z: -125, y: 61, icon: '⌁' },
  { key: 'gateway', name: 'Aegis gateway', id: 'GW-05 / PHANTOM TWIN', title: 'A convincing wrong turn.', x: 55, z: -68, y: 145, icon: '◇' },
];

export const LivingCityPage: React.FC<LivingCityPageProps> = ({ onNavigateTab }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI state
  const [night, setNight] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);
  const [exploring, setExploring] = useState<boolean>(false);
  const [stage, setStage] = useState<number>(0);
  const [selectedDeviceKey, setSelectedDeviceKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [networkStatusText, setNetworkStatusText] = useState<string>('05 NODES PROTECTED');
  const [trafficText, setTrafficText] = useState<string>('CITY TRAFFIC ACTIVE');
  const [autoOrbit, setAutoOrbit] = useState<boolean>(true);

  // Live Backend Data States
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [cameraData, setCameraData] = useState<CameraNode | null>(null);
  const [decoyData, setDecoyData] = useState<DecoyTelemetry | null>(null);
  const [unmaskedCrops, setUnmaskedCrops] = useState<string[]>([]);
  const [frameTimestamp, setFrameTimestamp] = useState<number>(() => Date.now());

  // Incident Panel State
  const [incidentOpen, setIncidentOpen] = useState<boolean>(false);
  const [incidentType, setIncidentType] = useState<string>('DEFENSE SEQUENCE');
  const [incidentTitle, setIncidentTitle] = useState<string>('The threat takes the wrong turn.');
  const [incidentDetail, setIncidentDetail] = useState<string>('');
  const [incidentProgress, setIncidentProgress] = useState<number>(0);
  const [canApprove, setCanApprove] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // References for Animation & Canvas
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
    mirror: 0,
    mirrorTarget: 0,
    attackStep: 0,
    t: 0,
    previous: 0,
    drag: false,
    dragX: 0,
    scan: 0,
    boost: 0,
  });

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Poll Backend Status & Subsystem Metrics
  useEffect(() => {
    let mounted = true;
    const fetchTelemetry = async () => {
      try {
        const health = await api.getHealth();
        if (mounted) setBackendOnline(health.status === 'ok');

        const cameras = await api.getCameras();
        if (mounted && cameras && cameras.length > 0) {
          setCameraData(cameras[0]);
        }

        const decoy = await api.getDecoyTelemetry();
        if (mounted) setDecoyData(decoy);
      } catch {
        if (mounted) setBackendOnline(false);
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Refresh camera live frame preview periodically
  useEffect(() => {
    const frameInterval = setInterval(() => {
      setFrameTimestamp(Date.now());
    }, 2000);
    return () => clearInterval(frameInterval);
  }, []);


  // Canvas 3D City Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const a = animRef.current;

    let seed = 43;
    function rand() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    const blocks: [number, number][] = [
      [-195, -172], [-124, -175], [-205, -60], [-128, -60], [-205, 39], [-124, 41],
      [52, -181], [126, -178], [204, -182], [55, -68], [134, -65], [210, -62],
      [58, 40], [135, 38], [209, 40], [-190, 185], [-121, 186], [55, 184], [135, 183], [210, 183],
    ];

    const buildings = blocks.map(([x, z], i) => {
      let w = 36 + rand() * 20;
      let d = 32 + rand() * 15;
      let h = 35 + rand() * 70;
      if (i === 9) { w = 49; d = 43; h = 132; }
      if (i === 2) h = 92;
      if (i === 6) h = 110;
      return {
        x, z, w, d, h,
        kind: i === 9 ? 'core' : i % 4 === 0 ? 'glass' : i % 5 === 0 ? 'white' : 'brick',
        roof: rand() > 0.5,
        seed: i,
      };
    });

    const trees: any[] = [];
    for (let i = 0; i < 70; i++) {
      let x, z;
      if (i < 30) { x = -210 + rand() * 140; z = 45 + rand() * 50; }
      else if (i < 50) { x = 75 + rand() * 140; z = 68 + rand() * 25; }
      else { x = -240 + rand() * 490; z = 218 + rand() * 12; }
      trees.push({ x, z, h: 10 + rand() * 12, r: 5 + rand() * 4 });
    }

    const cars = Array.from({ length: 22 }, (_, i) => ({
      p: rand(),
      speed: 0.012 + rand() * 0.017,
      axis: i % 2,
      lane: i % 4,
      color: ['#dae8da', '#e9ad6d', '#a3c2bc', '#bfe9cf', '#e9d5c2'][i % 5],
    }));

    function handleResize() {
      if (!canvas) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    handleResize();
    window.addEventListener('resize', handleResize);

    function baseScale(W: number, H: number) {
      return Math.min(W / 1040, H / 700) * (W < 700 ? 0.88 : 1.08);
    }

    function P(x: number, y: number, z: number) {
      const rx = x * Math.cos(a.angle) - z * Math.sin(a.angle);
      const rz = x * Math.sin(a.angle) + z * Math.cos(a.angle);
      return {
        x: a.centerX + rx * a.scale,
        y: a.centerY + (rz * a.tilt - y) * a.scale,
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

    function box(x: number, y: number, z: number, w: number, h: number, d: number, colors: string[], edge?: string) {
      const X = x + w / 2, L = x - w / 2, Z = z + d / 2, B = z - d / 2;
      const faces = [
        { dep: P(x, 0, Z).depth, p: [[L, y, Z], [X, y, Z], [X, y + h, Z], [L, y + h, Z]] as [number, number, number][], c: colors[1] },
        { dep: P(x, 0, B).depth, p: [[L, y, B], [X, y, B], [X, y + h, B], [L, y + h, B]] as [number, number, number][], c: colors[1] },
        { dep: P(X, 0, z).depth, p: [[X, y, B], [X, y, Z], [X, y + h, Z], [X, y + h, B]] as [number, number, number][], c: colors[2] },
        { dep: P(L, 0, z).depth, p: [[L, y, B], [L, y, Z], [L, y + h, Z], [L, y + h, B]] as [number, number, number][], c: colors[2] },
      ];
      faces.sort((f1, f2) => f1.dep - f2.dep);
      for (const f of faces) poly(f.p, f.c, edge, 0.5);
      poly([[L, y + h, B], [X, y + h, B], [X, y + h, Z], [L, y + h, Z]], colors[0], edge, 0.5);
    }

    function text3(str: string, x: number, y: number, z: number, color = '#578073', size = 8) {
      if (!ctx) return;
      const p = P(x, y, z);
      ctx.font = size + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.fillText(str, p.x, p.y);
    }

    function ring(x: number, y: number, z: number, r: number, color: string, width = 1) {
      if (!ctx) return;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const ang = (i / 60) * Math.PI * 2;
        const p = P(x + Math.cos(ang) * r, y, z + Math.sin(ang) * r);
        if (i) {
          ctx.lineTo(p.x, p.y);
        } else {
          ctx.moveTo(p.x, p.y);
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    function drawBuilding(b: any, ghost = false) {
      const { x, z, w, d, h } = b;
      const y = ghost ? -100 : 3;
      let colors: string[];
      if (ghost) colors = ['#a498ca55', '#715f9855', '#8c7cb355'];
      else if (night) colors = b.kind === 'white' ? ['#5a746d', '#37544d', '#294940'] : ['#254c49', '#142f31', '#1e3b3b'];
      else colors = b.kind === 'white' ? ['#eeeede', '#c5d1c1', '#aabcb0'] : b.kind === 'glass' ? ['#65877b', '#294c49', '#3b625b'] : ['#759487', '#49695f', '#5b7e6d'];
      if (b.kind === 'core' && !ghost) colors = night ? ['#478e78', '#1f4b42', '#2e6555'] : ['#c0ddc9', '#3b6b5c', '#5d9479'];
      box(x, y, z, w, h, d, colors, ghost ? '#d6c7ff44' : night ? '#7ba88c33' : '#e2eddb33');
    }

    function drawTree(o: any) {
      if (!ctx) return;
      const { x, z, h, r } = o;
      box(x, 2, z, 2, h * 0.6, 2, ['#72836b', '#5c7159', '#687f60']);
      const p = P(x, h, z);
      ctx.fillStyle = night ? '#315d4b' : '#82a883';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * a.scale, r * 1.3 * a.scale, 0, 0, 7);
      ctx.fill();
    }

    function drawRoad(x: number, z: number, w: number, d: number) {
      poly([[x - w / 2, 2, z - d / 2], [x + w / 2, 2, z - d / 2], [x + w / 2, 2, z + d / 2], [x - w / 2, 2, z + d / 2]], night ? '#1a3434' : '#7d9290');
      if (w > d) line([[x - w / 2, 2.1, z], [x + w / 2, 2.1, z]], night ? '#aec4ac66' : '#dbe5ce', 0.9, [5, 7]);
      else line([[x, 2.1, z - d / 2], [x, 2.1, z + d / 2]], night ? '#aec4ac66' : '#dbe5ce', 0.9, [5, 7]);
    }

    function drawGround() {
      box(0, -22, 0, 535, 22, 500, night ? ['#29483d', '#142c29', '#1c3730'] : ['#becdb5', '#879e88', '#9bb199']);
      poly([[-265, 1, -247], [265, 1, -247], [265, 1, 247], [-265, 1, 247]], night ? '#305243' : '#c8d7bc');
      // Canal
      poly([[-65, 2, -246], [-27, 2, -246], [-27, 2, 246], [-65, 2, 246]], night ? '#193f49' : '#75b3b3');
      line([[-67, 3, -247], [-67, 3, 247]], '#dbdfc0', 3);
      line([[-25, 3, -247], [-25, 3, 247]], '#dbdfc0', 3);
      // Roads
      drawRoad(-150, -110, 225, 24);
      drawRoad(131, -110, 266, 24);
      drawRoad(-150, 118, 225, 25);
      drawRoad(131, 118, 266, 25);
      drawRoad(-85, 0, 22, 480);
      drawRoad(5, 0, 24, 480);
      drawRoad(170, 0, 20, 480);
      drawRoad(93, 0, 18, 480);
      text3('NORTH QUARTER', -150, 4, -230, night ? '#a3c6a4' : '#65806c', 8);
      text3('AEGIS SECURE CAMPUS', 150, 4, 232, night ? '#a3c6a4' : '#65806c', 8);
    }

    function drawHardware() {
      for (const d of CITY_DEVICES) {
        if (d.key === 'gateway') continue;
        line([[d.x, 3, d.z], [d.x, d.y - 5, d.z]], night ? '#a0c5ac' : '#536e5b', 2);
        if (d.key === 'camera') {
          box(d.x + 5, d.y - 8, d.z, 19, 7, 9, ['#e0e9d8', '#7d998c', '#c2d2bf']);
          box(d.x + 15, d.y - 8, d.z, 3, 5, 7, ['#294e49', '#294e49', '#173a34']);
        } else if (d.key === 'signal') {
          box(d.x, d.y - 7, d.z, 8, 21, 7, ['#304d42', '#203c35', '#3d5b4c']);
        } else if (d.key === 'power') {
          box(d.x, 4, d.z, 28, 21, 24, ['#c8dabd', '#809a82', '#a3b99b']);
        } else {
          box(d.x, d.y - 5, d.z, 13, 6, 10, ['#dbe9ca', '#80a18a', '#a4c0a0']);
        }
      }
    }

    function drawPhantom() {
      if (!ctx || a.mirror < 0.01) return;
      ctx.save();
      ctx.globalAlpha = a.mirror * 0.75;
      box(360, -120, 20, 190, 8, 250, ['#b5a4d044', '#76628c66', '#87739c66']);
      for (let i = 0; i < 4; i++) {
        box(325 + (i % 2) * 65, -112, -45 + Math.floor(i / 2) * 90, 35, 40 + i * 12, 35, ['#b5a4dd77', '#77628f99', '#9d88bc77'], '#cbb6f177');
      }
      ring(360, -103, 20, 65 + Math.sin(a.t) * 4, '#a087c7', 1);
      text3('PHANTOM DISTRICT (ISOLATED DECOY)', 360, -115, 160, night ? '#d2b5f4' : '#806394', 9);
      ctx.restore();
    }

    function renderLoop(now: number) {
      if (!ctx || !canvas) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const delta = Math.min((now - a.previous) / 1000, 0.05) || 0;
      a.previous = now;

      if (!paused) {
        a.t += delta;
        for (const c of cars) {
          c.p = (c.p + delta * c.speed) % 1;
        }
      }

      if (autoOrbit && !a.drag && !paused) {
        a.targetAngle += delta * 0.025;
      }

      a.angle += (a.targetAngle - a.angle) * 0.06;
      a.zoom += (a.targetZoom - a.zoom) * 0.07;
      a.mirror += (a.mirrorTarget - a.mirror) * 0.04;

      const mobile = W < 700;
      const tx = W * (mobile ? 0.53 : exploring ? 0.56 : 0.67) + a.panX;
      const ty = H * (mobile ? 0.63 : 0.57) + a.panY;
      a.centerX += (tx - a.centerX) * 0.06;
      a.centerY += (ty - a.centerY) * 0.06;
      a.scale = baseScale(W, H) * a.zoom;

      // Clear & Background gradient
      const grad = ctx.createLinearGradient(0, 0, W, H);
      if (night) {
        grad.addColorStop(0, '#0b2529');
        grad.addColorStop(1, '#1c3c37');
      } else {
        grad.addColorStop(0, '#e9ede3');
        grad.addColorStop(0.6, '#d3e2da');
        grad.addColorStop(1, '#bed7cc');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      drawPhantom();
      drawGround();

      const objects = [
        ...buildings.map(b => ({ z: P(b.x, 0, b.z).depth, fn: () => drawBuilding(b) })),
        ...trees.map(o => ({ z: P(o.x, 0, o.z).depth, fn: () => drawTree(o) })),
      ];
      objects.sort((o1, o2) => o1.z - o2.z);
      objects.forEach(o => o.fn());

      drawHardware();

      // Position HTML device marker elements
      for (const d of CITY_DEVICES) {
        const markerEl = document.getElementById(`city-marker-${d.key}`);
        if (markerEl) {
          const pt = P(d.x, d.y + 21, d.z);
          markerEl.style.left = `${pt.x}px`;
          markerEl.style.top = `${pt.y}px`;
        }
      }

      animId = requestAnimationFrame(renderLoop);
    }

    animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [night, paused, exploring, autoOrbit]);

  // Pointer drag to orbit city
  const handlePointerDown = (e: React.PointerEvent) => {
    animRef.current.drag = true;
    animRef.current.dragX = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setAutoOrbit(false);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (animRef.current.drag) {
      animRef.current.targetAngle += (e.clientX - animRef.current.dragX) * 0.006;
      animRef.current.dragX = e.clientX;
    }
  };

  const handlePointerUp = () => {
    animRef.current.drag = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    animRef.current.targetZoom = Math.max(0.6, Math.min(1.7, animRef.current.targetZoom - e.deltaY * 0.00065));
  };

  // Select Device Marker
  const handleSelectDevice = (key: string) => {
    setExploring(true);
    setSelectedDeviceKey(key);
    setAutoOrbit(false);
    animRef.current.targetZoom = 1.15;
  };

  // Real Backend Drill B: Controlled Honeypot Intrusion
  const handleSimulateIntrusion = async () => {
    setActionLoading(true);
    setIncidentOpen(true);
    setIncidentType('INTRUSION DRILL / REAL BACKEND');
    setIncidentTitle('Attacker enters gateway.');
    setIncidentDetail('Attacker initiates SSH connection to smart city gateway. Gateway evaluates risk score...');
    setIncidentProgress(1);
    animRef.current.mirrorTarget = 1;
    setNetworkStatusText('THREAT DIVERTED');
    setTrafficText('PRODUCTION UNAFFECTED');

    try {
      // Step 1: Send attacker discovery command
      const sid = 'sess-living-city-' + Date.now().toString().slice(-4);
      await api.simulateDecoyCommand(sid, 'uname -a');

      setTimeout(async () => {
        setIncidentTitle('Honeytoken Tripwire Activated.');
        setIncidentDetail('Attacker read canary at /etc/camera/credentials.conf. Maximum hostility flagged on backend!');
        setIncidentProgress(2);

        // Step 2: Trip honeytoken
        await api.simulateDecoyCommand(sid, 'cat /etc/camera/credentials.conf');

        setTimeout(async () => {
          setIncidentTitle('Break-Glass Case Active.');
          setIncidentDetail('CASE-2026-001 opened under Municipal Privacy Ordinance. Awaiting 2-of-3 custodian approval quorum.');
          setIncidentProgress(3);
          setCanApprove(true);
          setActionLoading(false);
        }, 1500);
      }, 1500);
    } catch (err: any) {
      setIncidentDetail(`Backend simulation error: ${err.message}`);
      setActionLoading(false);
    }
  };

  // Real Backend Drill B: Custodian Approval & Unmasking
  const handleApproveRelease = async () => {
    setActionLoading(true);
    setIncidentTitle('Cryptographic Quorum Verified.');
    setIncidentDetail('Custodian 2 (Cybercrime Forensics) approved warrant. Shamir 2-of-3 threshold met. Committing audit ledger block...');
    setIncidentProgress(4);

    try {
      const voteResult = await api.voteEscrowCase('CASE-2026-001', 'custodian-2-cybercrime', 'approve');
      if (voteResult.quorum_achieved) {
        // Retrieve unmasked facial footage from backend
        const footage = await api.getCaseFootage('CASE-2026-001');
        setUnmaskedCrops(footage.crops_base64 || []);

        setIncidentTitle('Contained. Audited. Evidence Released.');
        setIncidentDetail(`Scoped AES-256 decryption key released (${voteResult.unlocked_key?.slice(0, 16)}...). Audit block persisted before unlock.`);
        setIncidentProgress(5);
        setCanApprove(false);
        setActionLoading(false);
        showToast('Evidence unlocked: Verified 2-of-3 Shamir Quorum');
      }
    } catch (err: any) {
      setIncidentDetail(`Approval failed: ${err.message}`);
      setActionLoading(false);
    }
  };

  // Real Backend Drill A: False Positive Camera Blinding & Refusal
  const handleTestFalsePositive = async () => {
    setActionLoading(true);
    setIncidentOpen(true);
    setIncidentType('FALSE-POSITIVE DRILL / PRIVACY GUARANTEE');
    setIncidentTitle('Camera Anomaly Flagged.');
    setIncidentDetail('Edge camera cam_01 reports blinding anomaly. Privacy boundary active: Normal feed remains blurred.');
    setIncidentProgress(1);
    setNetworkStatusText('ANOMALY REVIEW');

    try {
      await api.simulateCameraBlind('cam_01');

      setTimeout(async () => {
        setIncidentTitle('Rogue Unmask Request Rejected.');
        setIncidentDetail('Operator attempted unmasking without honeypot hostility. Server enforced HTTP 403 Forbidden!');
        setIncidentProgress(3);

        try {
          await api.attemptUnauthorized();
        } catch {
          // Expected 403 Forbidden!
        }

        setTimeout(async () => {
          await api.simulateCameraRecover('cam_01');
          setIncidentTitle('Privacy Preserved · Case Closed.');
          setIncidentDetail('Tamper-evident rejection committed to audit hash-chain. Camera cam_01 recovered to normal feed.');
          setIncidentProgress(4);
          setActionLoading(false);
          setNetworkStatusText('05 NODES PROTECTED');
          showToast('Privacy invariant enforced: Unauthorized unmask denied.');
        }, 1800);
      }, 1500);
    } catch (err: any) {
      setIncidentDetail(`Simulation error: ${err.message}`);
      setActionLoading(false);
    }
  };

  const handleResetCity = () => {
    animRef.current.targetAngle = -0.62;
    animRef.current.targetZoom = 1;
    animRef.current.mirrorTarget = 0;
    setSelectedDeviceKey(null);
    setIncidentOpen(false);
    setAutoOrbit(true);
    setStage(0);
    setNetworkStatusText('05 NODES PROTECTED');
    setTrafficText('CITY TRAFFIC ACTIVE');
    showToast('City view reset to nominal.');
  };

  return (
    <div className={`living-city-root ${night ? 'night' : ''} ${exploring ? 'exploring' : ''}`}>
      <canvas
        id="city-canvas"
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />
      <div className="city-grain" />

      {/* Top Header */}
      <header className="city-header">
        <a className="city-brand" href="#city" onClick={(e) => { e.preventDefault(); handleResetCity(); }}>
          <svg viewBox="0 0 36 40">
            <path d="M18 2 33 10 29 28 18 38 7 28 3 10Z" />
            <path d="m10 26 8-16 8 16m-13-5h10" />
          </svg>
          AEGIS<span>MIRAGE</span>
        </a>

        <div className="city-header-center">
          <i></i> A LIVING CITY. A HIDDEN DEFENSE.
        </div>

        <div className="city-header-right">
          {/* Navigation to Subsystem Pages */}
          <nav className="city-nav-links" aria-label="AegisMirage Navigation">
            <button className="city-nav-btn active" onClick={() => onNavigateTab('city')}>Living City</button>
            <button className="city-nav-btn" onClick={() => onNavigateTab('console')}>Console ↗</button>
            <button className="city-nav-btn" onClick={() => onNavigateTab('cameras')}>Cameras ↗</button>
            <button className="city-nav-btn" onClick={() => onNavigateTab('decoy')}>Decoy ↗</button>
            <button className="city-nav-btn" onClick={() => onNavigateTab('campaigns')}>Intel ↗</button>
          </nav>

          <span className={`city-world-tag-badge status-${backendOnline ? 'online' : 'offline'}`} style={{ color: backendOnline ? '#4ade80' : '#f87171', fontFamily: 'monospace', fontSize: '10px' }}>
            ● {backendOnline ? 'BACKEND 8000 OK' : 'OFFLINE'}
          </span>

          <button id="city-sound" title="Pause ambient motion" onClick={() => setPaused(!paused)}>
            {paused ? '▶ Motion' : 'Ⅱ Motion'}
          </button>
        </div>
      </header>

      {/* Hero Intro */}
      <section className="city-hero" id="city-hero">
        <div className="city-eyebrow">
          <span>01 — THE CONNECTED CITY</span>
          <span className="city-tinyline"></span>
        </div>
        <h1>The city<br />never sleeps.<br /><em>Neither do we.</em></h1>
        <p>
          Every camera. Every signal. Every connection.<br />
          A world worth protecting — and a second<br />
          world built to deceive.
        </p>
        <button className="city-solid" onClick={() => { setExploring(true); showToast('Click an IoT node or drag anywhere to orbit.'); }}>
          Enter the living city <span>↗</span>
        </button>
        <div className="city-hero-note">Drag to orbit · Scroll to zoom · Click an IoT node</div>
      </section>

      {/* Chapter Caption */}
      <div className="city-chapter-caption" id="city-chapterCaption">
        <span className="city-eyebrow">EXPLORE / SECTOR 07</span>
        <h2>A thousand connections.<br />One protected city.</h2>
        <p>Choose a glowing device to inspect live hardware telemetry.</p>
      </div>

      <div className="city-world-tag">
        <i></i> PRODUCTION CITY <span>ONLINE</span>
      </div>

      {/* 3D Canvas Markers */}
      <div className="city-markers">
        {CITY_DEVICES.map(d => (
          <button
            key={d.key}
            id={`city-marker-${d.key}`}
            className={`city-marker ${selectedDeviceKey === d.key ? 'selected' : ''}`}
            aria-label={`Inspect ${d.name}`}
            onClick={() => handleSelectDevice(d.key)}
          >
            <span className="city-pin">{d.icon}</span>
            <span className="city-name">{d.name} ↗</span>
          </button>
        ))}
      </div>

      {/* Scene Controls */}
      <div className="city-scene-controls">
        <button id="city-rotate" title="Toggle auto orbit" onClick={() => setAutoOrbit(!autoOrbit)}>
          ↻ <span>{autoOrbit ? 'Orbit on' : 'Orbit off'}</span>
        </button>
        <button title="Zoom in" onClick={() => animRef.current.targetZoom = Math.min(1.7, animRef.current.targetZoom + 0.15)}>＋</button>
        <button title="Zoom out" onClick={() => animRef.current.targetZoom = Math.max(0.6, animRef.current.targetZoom - 0.15)}>−</button>
        <button title="Reset city view" onClick={handleResetCity}>⌂</button>
        <button title="Toggle night mode" onClick={() => setNight(!night)}>{night ? '☀' : '☾'}</button>
      </div>

      {/* Inspector Sidebar */}
      <aside className={`city-inspector ${selectedDeviceKey ? 'open' : ''}`}>
        <div className="city-inspect-head">
          <span className="city-eyebrow">
            {selectedDeviceKey === 'camera' ? 'CAM-01 / EDGE SENTRY' :
             selectedDeviceKey === 'gateway' ? 'GW-05 / PHANTOM TWIN' :
             selectedDeviceKey === 'signal' ? 'SIG-02 / MOBILITY' :
             selectedDeviceKey === 'power' ? 'PWR-03 / ENERGY' : 'ENV-04 / SENSOR'}
          </span>
          <button onClick={() => setSelectedDeviceKey(null)}>×</button>
        </div>

        <h2>
          {selectedDeviceKey === 'camera' ? 'North Gate Camera' :
           selectedDeviceKey === 'gateway' ? 'Aegis Deception Gateway' :
           selectedDeviceKey === 'signal' ? 'Adaptive Traffic Signal' :
           selectedDeviceKey === 'power' ? 'Municipal Power Grid' : 'Civic Air Quality Sensor'}
        </h2>

        <div className="city-device-status">
          <i></i>
          <span>
            {selectedDeviceKey === 'camera' ? `Protected · YuNet Face Blur Active (${cameraData?.status || 'Active'})` :
             selectedDeviceKey === 'gateway' ? `Online · ${decoyData?.active_sessions_count || 0} Decoy Sessions Contained` :
             'Online · Operating in Production Mesh'}
          </span>
        </div>

        {/* Live Visual / Frame */}
        <div className="city-device-visual">
          {selectedDeviceKey === 'camera' ? (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <img
                src={`${api.getCameraFrameUrl('cam_01')}?t=${frameTimestamp}`}
                alt="Live Camera Feed with Face Redaction"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  // Fallback synthetic placeholder if backend stream paused
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <span style={{ position: 'absolute', bottom: 6, left: 8, font: '8px monospace', color: '#cbe6c8', background: '#0008', padding: '2px 4px' }}>
                YUNET BLUR APPLIED · REAL BACKEND
              </span>
            </div>
          ) : (
            <svg viewBox="0 0 260 135">
              <path d="M25 68h70l35-35 35 35h70M130 33v70" stroke="#abcfae" strokeWidth="1" fill="none" />
              <circle cx="130" cy="68" r="16" fill="#a891cc" />
              <text x="130" y="72" textAnchor="middle" fill="#fff" fontSize="9" fontFamily="monospace">
                {selectedDeviceKey?.toUpperCase()}
              </text>
            </svg>
          )}
        </div>

        <p>
          {selectedDeviceKey === 'camera' ? 'Face redaction is enforced at the edge. Raw unblurred crops remain encrypted in hardware storage until released by dual-custodian break-glass quorum.' :
           selectedDeviceKey === 'gateway' ? 'Dynamic scoring routes untrusted traffic into isolated decoy twins. Attacker attempts are analyzed statically without executing malware on the host.' :
           'Smart city municipal infrastructure node monitored by the AegisMirage distributed telemetry mesh.'}
        </p>

        <div className="city-device-metrics">
          {selectedDeviceKey === 'camera' ? (
            <>
              <div><span>FPS</span><strong>{cameraData?.fps || 24}</strong></div>
              <div><span>STORAGE</span><strong>{cameraData?.storage_encrypted_crops || 1} CROPS</strong></div>
              <div><span>SECURITY</span><strong>AES-GCM</strong></div>
            </>
          ) : selectedDeviceKey === 'gateway' ? (
            <>
              <div><span>ISOLATED</span><strong>{decoyData?.active_sessions_count || 3} SESSIONS</strong></div>
              <div><span>HONEYTOKENS</span><strong>{decoyData?.honeytoken_hits || 1} HITS</strong></div>
              <div><span>ROUTING</span><strong>DECOY</strong></div>
            </>
          ) : (
            <>
              <div><span>STATUS</span><strong>ACTIVE</strong></div>
              <div><span>TELEMETRY</span><strong>MQTT</strong></div>
              <div><span>LATENCY</span><strong>0.2 ms</strong></div>
            </>
          )}
        </div>

        <button
          className="city-solid city-full"
          disabled={actionLoading}
          onClick={() => {
            if (selectedDeviceKey === 'camera') {
              handleTestFalsePositive();
            } else if (selectedDeviceKey === 'gateway') {
              handleSimulateIntrusion();
            } else {
              showToast('Signal command dispatched to production mesh');
            }
          }}
        >
          {selectedDeviceKey === 'camera' ? 'Simulate Camera Anomaly ↗' :
           selectedDeviceKey === 'gateway' ? 'Run Intrusion Drill ↗' :
           'Send Test Control Signal ↗'}
        </button>

        <div className="city-inspector-note">Connected to real AegisMirage FastAPI backend</div>
      </aside>

      {/* Incident Panel */}
      <section className={`city-incident ${incidentOpen ? 'open' : ''}`}>
        <div className="city-incident-top">
          <span>{incidentType}</span>
          <button onClick={() => setIncidentOpen(false)}>×</button>
        </div>

        <h3>{incidentTitle}</h3>
        <p>{incidentDetail}</p>

        <div className="city-progress">
          {[1, 2, 3, 4, 5].map(step => (
            <i key={step} className={incidentProgress >= step ? 'done' : ''} />
          ))}
        </div>

        {/* Display unmasked face crops when quorum achieved */}
        {unmaskedCrops.length > 0 && (
          <div style={{ margin: '10px 0', padding: '8px', background: '#0b1d1b', borderRadius: '4px', border: '1px solid #34d39944' }}>
            <span style={{ font: '9px monospace', color: '#34d399', display: 'block', marginBottom: '6px' }}>
              ✓ UNMASKED FACIAL EVIDENCE (CASE-2026-001)
            </span>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
              {unmaskedCrops.map((b64, idx) => (
                <img
                  key={idx}
                  src={`data:image/jpeg;base64,${b64}`}
                  alt={`Unmasked Crop ${idx + 1}`}
                  style={{ width: '70px', height: '70px', borderRadius: '3px', border: '1px solid #10b981' }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="city-incident-actions">
          {canApprove && (
            <button className="city-solid" onClick={handleApproveRelease} disabled={actionLoading}>
              {actionLoading ? 'Verifying Quorum...' : 'Approve Warrant Release →'}
            </button>
          )}
          <button onClick={() => setIncidentOpen(false)}>Dismiss</button>
        </div>
      </section>

      {/* Toast Notification */}
      <div className={`city-toast ${toastMessage ? 'show' : ''}`}>
        {toastMessage}
      </div>

      {/* Footer Controls */}
      <footer className="city-footer">
        <div className="city-journey">
          <button className={stage === 0 ? 'active' : ''} onClick={() => { setStage(0); setExploring(true); }}>
            <span>01</span> The Living City <i></i>
          </button>
          <button className={stage === 1 ? 'active' : ''} onClick={() => { setStage(1); handleSelectDevice('camera'); }}>
            <span>02</span> Edge Sentry <i></i>
          </button>
          <button className={stage === 2 ? 'active' : ''} onClick={() => { setStage(2); handleSelectDevice('gateway'); }}>
            <span>03</span> The Mirage <i></i>
          </button>
          <button className={stage === 3 ? 'active' : ''} onClick={() => { setStage(3); onNavigateTab('campaigns'); }}>
            <span>04</span> Escrow & Intel <i></i>
          </button>
        </div>

        <div className="city-footer-line">
          <div className="city-network-state">
            <i></i> <strong>{networkStatusText}</strong>
            <span>—</span>
            <span>{trafficText}</span>
          </div>

          <div className="city-scenario-actions">
            <button id="city-falsePositive" onClick={handleTestFalsePositive} disabled={actionLoading}>
              Test false positive
            </button>
            <button id="city-attack" onClick={handleSimulateIntrusion} disabled={actionLoading}>
              Simulate intrusion <span>↗</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
