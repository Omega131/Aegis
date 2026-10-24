import React, { useEffect, useRef } from 'react';

export interface DeviceCoords {
  key: string;
  name: string;
  id: string;
  x: number;
  y: number;
  z: number;
  screenX: number;
  screenY: number;
  visible: boolean;
}

export interface City3DCanvasProps {
  trafficSignalColor: 'green' | 'yellow' | 'red';
  activeCategory: 'all' | 'vision' | 'decoy' | 'infrastructure';
  domeVisible: boolean;
  duskLighting: boolean;
  selectedDeviceKey: string | null;
  onSelectDeviceKey: (key: string) => void;
  onDeviceCoordsChange?: (coords: Record<string, { x: number; y: number; visible: boolean }>) => void;
  demoScenario: 'none' | 'drill_a' | 'drill_b' | 'intrusion';
  onScenarioStep?: (stepName: string) => void;
  autoOrbit: boolean;
  onToggleAutoOrbit: () => void;
  zoom: number;
  onZoomChange: (newZoom: number) => void;
}

export const CITY_3D_DEVICES = [
  { key: 'camera', name: 'Edge camera', id: 'CAM-01', x: -160, y: 63, z: 125, category: 'vision' },
  { key: 'signal', name: 'Smart signal', id: 'SIG-02', x: 15, y: 39, z: 125, category: 'infrastructure' },
  { key: 'power', name: 'Solar substation', id: 'PWR-03', x: 185, y: 62, z: -142, category: 'infrastructure' },
  { key: 'sensor', name: 'Eco telemetry', id: 'ENV-04', x: -180, y: 61, z: -125, category: 'infrastructure' },
  { key: 'gateway', name: 'Aegis gateway', id: 'GW-05', x: 55, y: 145, z: -68, category: 'decoy' },
];

export const City3DCanvas: React.FC<City3DCanvasProps> = ({
  trafficSignalColor,
  activeCategory,
  domeVisible,
  duskLighting,
  selectedDeviceKey,
  onSelectDeviceKey,
  onDeviceCoordsChange,
  demoScenario,
  autoOrbit,
  zoom,
  onZoomChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Core 3D engine state references (for uninterrupted 60 FPS animation loop)
  const stateRef = useRef({
    angle: -0.62,
    targetAngle: -0.62,
    tilt: 0.57,
    targetTilt: 0.57,
    zoom: zoom,
    targetZoom: zoom,
    autoOrbit: autoOrbit,
    panX: 0,
    panY: 0,
    targetPanX: 0,
    targetPanY: 0,
    centerX: 0,
    centerY: 0,
    scale: 1,
    time: 0,
    mirror: 0,
    mirrorTarget: 0,
    drag: false,
    dragX: 0,
    dragY: 0,
    isDark: duskLighting,
    trafficColor: trafficSignalColor,
    drillScenario: demoScenario,
    drillTimer: 0,
    anomalyIntensity: 0,
    canaryAlert: 0,
  });

  // Synchronize incoming props to animation state
  useEffect(() => {
    stateRef.current.autoOrbit = autoOrbit;
  }, [autoOrbit]);

  useEffect(() => {
    stateRef.current.targetZoom = zoom;
  }, [zoom]);

  useEffect(() => {
    stateRef.current.isDark = duskLighting;
  }, [duskLighting]);

  useEffect(() => {
    stateRef.current.trafficColor = trafficSignalColor;
  }, [trafficSignalColor]);

  // Handle focus smoothly when selectedDeviceKey changes
  useEffect(() => {
    if (selectedDeviceKey) {
      const dev = CITY_3D_DEVICES.find((d) => d.key === selectedDeviceKey);
      if (dev) {
        stateRef.current.targetZoom = 1.45;
        // Offset pan to frame the selected device
        stateRef.current.targetPanX = -dev.x * 0.35;
        stateRef.current.targetPanY = dev.z * 0.25;
      }
    }
  }, [selectedDeviceKey]);

  // Handle Demo Scenarios
  useEffect(() => {
    stateRef.current.drillScenario = demoScenario;
    if (demoScenario === 'drill_a') {
      // Focus on CAM-01
      stateRef.current.targetAngle = -0.52;
      stateRef.current.targetZoom = 1.5;
      stateRef.current.targetPanX = 65;
      stateRef.current.targetPanY = -25;
      stateRef.current.anomalyIntensity = 1.0;
      stateRef.current.mirrorTarget = 0;
    } else if (demoScenario === 'drill_b' || demoScenario === 'intrusion') {
      // Zoom out to reveal the rising Phantom Twin district on the right
      stateRef.current.targetAngle = -0.85;
      stateRef.current.targetZoom = 0.95;
      stateRef.current.targetPanX = -85;
      stateRef.current.targetPanY = 15;
      stateRef.current.mirrorTarget = 1.0;
      stateRef.current.canaryAlert = 1.0;
    } else {
      stateRef.current.mirrorTarget = 0;
      stateRef.current.anomalyIntensity = 0;
      stateRef.current.canaryAlert = 0;
    }
  }, [demoScenario]);

  // City procedural assets: deterministic building & car simulation
  const sceneDataRef = useRef(() => {
    let seed = 43;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const blocks: [number, number][] = [
      [-195, -172], [-124, -175], [-205, -60], [-128, -60], [-205, 39], [-124, 41],
      [52, -181], [126, -178], [204, -182], [55, -68], [134, -65], [210, -62],
      [58, 40], [135, 38], [209, 40], [-190, 185], [-121, 186], [55, 184],
      [135, 183], [210, 183]
    ];

    const buildings = blocks.map(([x, z], i) => {
      let w = 36 + rand() * 20;
      let d = 32 + rand() * 15;
      let h = 35 + rand() * 70;
      if (i === 9) {
        // Central Core / Gateway Spire Tower
        w = 50;
        d = 44;
        h = 135;
      } else if (i === 2) {
        h = 95;
      } else if (i === 6) {
        h = 112;
      }
      const kind: 'core' | 'glass' | 'white' | 'brick' =
        i === 9 ? 'core' : i % 4 === 0 ? 'glass' : i % 5 === 0 ? 'white' : 'brick';
      return { x, z, w, d, h, kind, roof: rand() > 0.45, seed: i };
    });

    const trees: { x: number; z: number; h: number; r: number }[] = [];
    for (let i = 0; i < 70; i++) {
      let x: number, z: number;
      if (i < 30) {
        x = -210 + rand() * 140;
        z = 45 + rand() * 50;
      } else if (i < 50) {
        x = 75 + rand() * 140;
        z = 68 + rand() * 25;
      } else {
        x = -240 + rand() * 490;
        z = 218 + rand() * 12;
      }
      trees.push({ x, z, h: 10 + rand() * 12, r: 5 + rand() * 4 });
    }

    const cars = Array.from({ length: 22 }, (_, i) => ({
      p: rand(),
      speed: 0.012 + rand() * 0.018,
      axis: i % 2,
      lane: i % 4,
      color: ['#E5F4E8', '#246B45', '#7D9285', '#BFE6C4', '#F59E0B'][i % 5],
    }));

    return { buildings, trees, cars };
  });

  // Main 3D Rendering & Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();
    const { buildings, trees, cars } = sceneDataRef.current();

    const render = (now: number) => {
      const delta = Math.min((now - lastTime) / 1000, 0.06);
      lastTime = now;
      const s = stateRef.current;
      s.time += delta;

      const width = canvas.clientWidth || 980;
      const height = canvas.clientHeight || 560;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Auto-orbit and momentum damping
      if (s.autoOrbit && !s.drag) {
        s.targetAngle += delta * 0.035;
      }

      s.angle += (s.targetAngle - s.angle) * 0.07;
      s.tilt += (s.targetTilt - s.tilt) * 0.07;
      s.zoom += (s.targetZoom - s.zoom) * 0.08;
      s.panX += (s.targetPanX - s.panX) * 0.07;
      s.panY += (s.targetPanY - s.panY) * 0.07;
      s.mirror += (s.mirrorTarget - s.mirror) * 0.05;

      // Base Scale tailored to fit container majestically
      const baseScale = Math.min(width / 920, height / 580) * 1.15;
      s.scale = baseScale * s.zoom;
      s.centerX = width * 0.5 + s.panX;
      s.centerY = height * 0.52 + s.panY;

      // 3D Isometric Projection
      const P = (x: number, y: number, z: number) => {
        const rx = x * Math.cos(s.angle) - z * Math.sin(s.angle);
        const rz = x * Math.sin(s.angle) + z * Math.cos(s.angle);
        return {
          x: s.centerX + rx * s.scale,
          y: s.centerY + (rz * s.tilt - y) * s.scale,
          depth: rz,
        };
      };

      // Helper Drawing Primitives
      const poly = (points: [number, number, number][], fill?: string, stroke?: string, lw = 1) => {
        ctx.beginPath();
        points.forEach((p, idx) => {
          const pt = P(...p);
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fill();
        }
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = lw;
          ctx.stroke();
        }
      };

      const line = (points: [number, number, number][], color: string, lw = 1, dash: number[] = []) => {
        ctx.beginPath();
        points.forEach((p, idx) => {
          const pt = P(...p);
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      const ring = (x: number, y: number, z: number, r: number, color: string, lw = 1.2) => {
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          const pt = P(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.stroke();
      };

      const circle3 = (x: number, y: number, z: number, r: number, fill: string) => {
        const pt = P(x, y, z);
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y, r * s.scale, r * s.tilt * s.scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
      };

      const box = (
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number,
        colors: [string, string, string], // Top, Front, Side
        edge?: string
      ) => {
        const X = x + w / 2;
        const L = x - w / 2;
        const Z = z + d / 2;
        const B = z - d / 2;

        const faces = [
          { dep: P(x, 0, Z).depth, p: [[L, y, Z], [X, y, Z], [X, y + h, Z], [L, y + h, Z]] as [number, number, number][], c: colors[1] },
          { dep: P(x, 0, B).depth, p: [[L, y, B], [X, y, B], [X, y + h, B], [L, y + h, B]] as [number, number, number][], c: colors[1] },
          { dep: P(X, 0, z).depth, p: [[X, y, B], [X, y, Z], [X, y + h, Z], [X, y + h, B]] as [number, number, number][], c: colors[2] },
          { dep: P(L, 0, z).depth, p: [[L, y, B], [L, y, Z], [L, y + h, Z], [L, y + h, B]] as [number, number, number][], c: colors[2] },
        ];

        faces.sort((a, b) => a.dep - b.dep);
        for (const f of faces) poly(f.p, f.c, edge, 0.5);

        // Top face
        poly([[L, y + h, B], [X, y + h, B], [X, y + h, Z], [L, y + h, Z]], colors[0], edge, 0.5);
      };

      // 1. Clear & Atmospheric Gradient
      const grad = ctx.createLinearGradient(0, 0, width, height);
      if (s.isDark) {
        grad.addColorStop(0, '#0B130E');
        grad.addColorStop(0.6, '#121F17');
        grad.addColorStop(1, '#15251C');
      } else {
        grad.addColorStop(0, '#F7FAF7');
        grad.addColorStop(0.55, '#F0F7F1');
        grad.addColorStop(1, '#E5F4E8');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Atmospheric Ground Shadow (Anchors city firmly in 3D space)
      ctx.save();
      ctx.filter = 'blur(24px)';
      const sh = P(0, -32, 0);
      ctx.fillStyle = s.isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(36, 107, 69, 0.14)';
      ctx.beginPath();
      ctx.ellipse(sh.x, sh.y + 24, 250 * s.scale, 120 * s.scale, s.angle * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Ground & Waterways & Roadways
      const groundColors: [string, string, string] = s.isDark
        ? ['#1C3024', '#111D16', '#15261D']
        : ['#DCE9DF', '#9CBBA2', '#B2CEB8'];
      box(0, -22, 0, 535, 22, 500, groundColors);

      // Grass Field
      poly([[-265, 1, -247], [265, 1, -247], [265, 1, 247], [-265, 1, 247]], s.isDark ? '#192C21' : '#E0ECE3');

      // Narrow Shimmering Canal
      const canalWater = s.isDark ? '#0E282E' : '#7BBABA';
      poly([[-65, 2, -246], [-27, 2, -246], [-27, 2, 246], [-65, 2, 246]], canalWater);
      line([[-67, 3, -247], [-67, 3, 247]], s.isDark ? '#2B4D3C' : '#CAD8C7', 2);
      line([[-25, 3, -247], [-25, 3, 247]], s.isDark ? '#2B4D3C' : '#CAD8C7', 2);

      // Animated Water Flow Ripples
      for (let i = 0; i < 20; i++) {
        const z = -230 + ((i * 24 + s.time * 9) % 460);
        line([[-58, 2.2, z], [-40, 2.2, z + 3]], s.isDark ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.45)', 0.8);
      }

      // Roads
      const roadColor = s.isDark ? '#13221A' : '#768B83';
      const road = (rx: number, rz: number, rw: number, rd: number) => {
        poly([[rx - rw / 2, 2, rz - rd / 2], [rx + rw / 2, 2, rz - rd / 2], [rx + rw / 2, 2, rz + rd / 2], [rx - rw / 2, 2, rz + rd / 2]], roadColor);
        if (rw > rd) {
          line([[rx - rw / 2, 2.1, rz], [rx + rw / 2, 2.1, rz]], s.isDark ? 'rgba(16, 185, 129, 0.35)' : '#DFEADC', 1, [5, 7]);
        } else {
          line([[rx, 2.1, rz - rd / 2], [rx, 2.1, rz + rd / 2]], s.isDark ? 'rgba(16, 185, 129, 0.35)' : '#DFEADC', 1, [5, 7]);
        }
      };

      road(-150, -110, 225, 24);
      road(131, -110, 266, 24);
      road(-150, 118, 225, 25);
      road(131, 118, 266, 25);
      road(-85, 0, 22, 480);
      road(5, 0, 24, 480);
      road(170, 0, 20, 480);
      road(93, 0, 18, 480);
      road(0, -225, 510, 20);
      road(0, 227, 510, 20);
      road(-45, -110, 50, 25);
      road(-45, 118, 50, 25);

      // Bridges cross canal
      for (const z of [-110, 118]) {
        for (const x of [-4, 15]) {
          for (let n = -10; n <= 10; n += 5) {
            poly([[x - 2, 2.5, z + n], [x + 2, 2.5, z + n], [x + 2, 2.5, z + n + 2], [x - 2, 2.5, z + n + 2]], s.isDark ? '#2E4C3B' : '#E2EBDD');
          }
        }
      }

      // Park paths and plazas
      poly([[-235, 3, 55], [-110, 3, 55], [-110, 3, 94], [-235, 3, 94]], s.isDark ? '#1F382A' : '#BFDAC7');
      line([[-235, 3.2, 76], [-110, 3.2, 76]], s.isDark ? '#365D46' : '#E5EFE2', 5);
      circle3(-165, 3, 76, 15, s.isDark ? '#2E5440' : '#88B8A4');
      circle3(-165, 3.3, 76, 9, s.isDark ? '#3C6B52' : '#BEE0D4');

      // Drifting canal boats
      for (let n = 0; n < 2; n++) {
        const bz = -215 + ((s.time * (n ? 8 : 6) + n * 230) % 430);
        box(-46, 3, bz, 10, 4, 24, s.isDark ? ['#324E3F', '#1C3127', '#253E32'] : ['#E8F2E7', '#A0B8A7', '#C8DCBD']);
        box(-46, 7, bz - 3, 7, 5, 9, s.isDark ? ['#3D614E', '#243C2F', '#2C493A'] : ['#D4E5D1', '#72988C', '#9AB6A3']);
      }

      // 3. Violet Phantom Twin Decoy District (Rises dynamically during Demo Drill B / Intrusion!)
      if (s.mirror > 0.01) {
        ctx.save();
        ctx.globalAlpha = Math.min(s.mirror, 1.0);
        const elevY = -110 * s.mirror;

        // Decoy floating island base
        box(360, elevY, 20, 195, 8, 255, ['#43285C', '#281738', '#341E47']);

        // 4 Violet Decoy Skyscrapers
        for (let i = 0; i < 4; i++) {
          const px = 325 + (i % 2) * 65;
          const pz = -45 + Math.floor(i / 2) * 90;
          const ph = 45 + i * 14;
          box(px, elevY + 8, pz, 36, ph, 36, ['#8B5CF6', '#581C87', '#6D28D9'], '#C4B5FD');

          // Illuminated violet honeytoken window grids
          for (let lvl = 12; lvl < ph - 6; lvl += 12) {
            poly(
              [[px - 14, elevY + 8 + lvl, pz + 18], [px + 14, elevY + 8 + lvl, pz + 18], [px + 14, elevY + 12 + lvl, pz + 18], [px - 14, elevY + 12 + lvl, pz + 18]],
              '#E9D5FF'
            );
          }
        }

        // Honeytrap Rotating Containment Halo
        ring(360, elevY + 14, 20, 75 + Math.sin(s.time * 2) * 6, '#A855F7', 2);
        ring(360, elevY + 28, 20, 55 + Math.cos(s.time * 2.5) * 4, '#C084FC', 1.5);

        // Arched Attacker Redirection Beam from Gateway to Phantom Twin
        const gw = CITY_3D_DEVICES[4];
        const beamPts: [number, number, number][] = [];
        for (let i = 0; i <= 40; i++) {
          const f = i / 40;
          beamPts.push([
            gw.x + (360 - gw.x) * f,
            gw.y + (elevY + 40 - gw.y) * f + Math.sin(f * Math.PI) * 55,
            gw.z + (20 - gw.z) * f,
          ]);
        }
        line(beamPts, '#C084FC', 2.5, [6, 4]);

        // Streaming Redirection Particle Packets
        for (let k = 0; k < 3; k++) {
          const f = (s.time * 0.45 + k * 0.33) % 1;
          const p = P(
            gw.x + (360 - gw.x) * f,
            gw.y + (elevY + 40 - gw.y) * f + Math.sin(f * Math.PI) * 55,
            gw.z + (20 - gw.z) * f
          );
          ctx.fillStyle = '#F43F5E';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Explosive Golden-Rose Honeytoken Canary Rings
        if (s.canaryAlert > 0.1) {
          const pulseR = ((s.time * 45) % 95) + 15;
          ring(360, elevY + 25, 20, pulseR, 'rgba(244, 63, 94, 0.8)', 2.5);
          ring(360, elevY + 25, 20, pulseR * 0.7, 'rgba(245, 158, 11, 0.7)', 2);

          const badgeP = P(360, elevY + 105, 20);
          ctx.save();
          ctx.fillStyle = '#EF4444';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⚡ [!] CANARY HONEYTOKEN TRIPPED', badgeP.x, badgeP.y);
          ctx.fillStyle = '#C084FC';
          ctx.font = '9px monospace';
          ctx.fillText('HOSTILE SESSION ISOLATED IN DECOY', badgeP.x, badgeP.y + 13);
          ctx.restore();
        }

        ctx.restore();
      }

      // 4. Cars Simulation
      cars.forEach((c, idx) => {
        // Red light on eastbound lane makes cars queue at the bridge
        const xPos = -250 + c.p * 500;
        const stopLine = -30 - (idx % 5) * 14;
        const isHeld = c.axis === 0 && c.lane === 0 && s.trafficColor === 'red' && xPos >= stopLine - 3 && xPos < stopLine + 6;

        if (!isHeld) {
          c.p = (c.p + delta * c.speed) % 1;
        }

        let cx: number, cz: number, rot = false;
        if (c.axis === 0) {
          cx = -250 + c.p * 500;
          cz = c.lane === 0 ? 112 : -116;
        } else {
          cx = c.lane === 1 ? 11 : 164;
          cz = 235 - c.p * 470;
          rot = true;
        }

        box(cx, 4, cz, rot ? 6 : 14, 4, rot ? 14 : 6, [c.color, s.isDark ? '#2D4A3C' : '#5C756C', c.color]);
        box(cx, 8, cz, rot ? 5 : 7, 2, rot ? 7 : 5, ['#A7D8BD', '#3E5C4E', '#3E5C4E']);

        // Headlights
        const hx = cx + (rot ? 0 : 7);
        const hz = cz + (rot ? -7 : 0);
        const hl = P(hx, 6, hz);
        ctx.fillStyle = s.isDark ? '#FDF08A' : '#FFF9D2';
        ctx.beginPath();
        ctx.arc(hl.x, hl.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });

      // 5. Buildings & Trees Depth-Sorted
      const renderBuilding = (b: (typeof buildings)[0]) => {
        const y = 3;
        let colors: [string, string, string];
        if (s.isDark) {
          colors =
            b.kind === 'core'
              ? ['#34D399', '#10B981', '#059669']
              : b.kind === 'white'
              ? ['#3D5C4B', '#1D3528', '#254233']
              : b.kind === 'glass'
              ? ['#204E4A', '#132E2E', '#193C3A']
              : ['#284C3E', '#173429', '#1E3E31'];
        } else {
          colors =
            b.kind === 'core'
              ? ['#BFE6C4', '#246B45', '#3D8C61']
              : b.kind === 'white'
              ? ['#FFFFFF', '#D2DFD4', '#B8CEBC']
              : b.kind === 'glass'
              ? ['#82A895', '#2B5349', '#3E6D62']
              : ['#9ABAA8', '#53796A', '#6A9382'];
        }

        box(b.x, y, b.z, b.w, b.h, b.d, colors, s.isDark ? 'rgba(52, 211, 153, 0.25)' : 'rgba(24, 51, 41, 0.15)');

        // Illuminated Window Strips
        const nearZ = Math.cos(s.angle) >= 0 ? b.z + b.d / 2 : b.z - b.d / 2;
        const nearX = Math.sin(s.angle) >= 0 ? b.x + b.w / 2 : b.x - b.w / 2;

        for (let level = 10; level < b.h - 6; level += 11) {
          for (let colOffset = -b.w / 2 + 5; colOffset < b.w / 2 - 4; colOffset += 9) {
            const lit = ((Math.floor(s.time * 0.3) + b.seed + Math.floor(level + colOffset)) % 6) > 1;
            const winCol = s.isDark
              ? lit ? '#FCE38A' : 'rgba(16, 185, 129, 0.18)'
              : lit ? '#E5F4E8' : 'rgba(36, 107, 69, 0.12)';
            poly([
              [b.x + colOffset, y + level, nearZ],
              [b.x + colOffset + 4, y + level, nearZ],
              [b.x + colOffset + 4, y + level + 4, nearZ],
              [b.x + colOffset, y + level + 4, nearZ],
            ], winCol);
          }

          for (let colOffset = -b.d / 2 + 5; colOffset < b.d / 2 - 4; colOffset += 9) {
            poly([
              [nearX, y + level, b.z + colOffset],
              [nearX, y + level, b.z + colOffset + 4],
              [nearX, y + level + 4, b.z + colOffset + 4],
              [nearX, y + level + 4, b.z + colOffset],
            ], s.isDark ? 'rgba(252, 227, 138, 0.45)' : 'rgba(191, 230, 196, 0.7)');
          }
        }

        // Roof structures & Antenna
        if (b.roof) {
          box(
            b.x + 3,
            y + b.h,
            b.z - 2,
            b.w * 0.35,
            6,
            b.d * 0.35,
            s.isDark ? ['#3B5C4B', '#1D3528', '#274435'] : ['#B8CEBC', '#7D9285', '#98B59E']
          );
        }

        // Spire Tower Antenna Mast (Core building)
        if (b.kind === 'core') {
          box(b.x, y + b.h, b.z, 24, 8, 20, s.isDark ? ['#34D399', '#10B981', '#059669'] : ['#E5F4E8', '#246B45', '#3D8C61']);
          line([[b.x, y + b.h + 8, b.z], [b.x, y + b.h + 26, b.z]], s.isDark ? '#34D399' : '#246B45', 2);

          // Pulsing Beacon Light
          const bp = P(b.x, y + b.h + 26, b.z);
          ctx.fillStyle = s.isDark ? '#34D399' : '#10B981';
          ctx.beginPath();
          ctx.arc(bp.x, bp.y, 3, 0, Math.PI * 2);
          ctx.fill();

          ring(b.x, y + b.h + 12, b.z, 20 + Math.sin(s.time * 2) * 3, s.isDark ? 'rgba(52, 211, 153, 0.4)' : 'rgba(36, 107, 69, 0.4)', 1.5);
        }
      };

      const renderTree = (o: (typeof trees)[0]) => {
        box(o.x, 2, o.z, 2.5, o.h * 0.6, 2.5, ['#5A422D', '#3D2A1C', '#4A3423']);
        const pt = P(o.x, o.h, o.z);
        ctx.fillStyle = s.isDark ? '#1F4733' : '#72A175';
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y, o.r * s.scale, o.r * 1.35 * s.scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = s.isDark ? '#2D5E44' : '#93C296';
        ctx.beginPath();
        ctx.ellipse(pt.x - o.r * 0.25 * s.scale, pt.y - o.r * 0.3 * s.scale, o.r * 0.65 * s.scale, o.r * 0.85 * s.scale, -0.3, 0, Math.PI * 2);
        ctx.fill();
      };

      // Depth sorting of all 3D scene objects
      const sortableObjects = [
        ...buildings.map((b) => ({ depth: P(b.x, 0, b.z).depth, draw: () => renderBuilding(b) })),
        ...trees.map((t) => ({ depth: P(t.x, 0, t.z).depth, draw: () => renderTree(t) })),
      ];

      sortableObjects.sort((a, b) => a.depth - b.depth);
      sortableObjects.forEach((obj) => obj.draw());

      // 6. 3D Hardware Nodes & Live Visual Participation
      CITY_3D_DEVICES.forEach((d) => {
        line([[d.x, 3, d.z], [d.x, d.y - 5, d.z]], s.isDark ? '#34D399' : '#246B45', 2.2);

        // A. CAM-01 Edge Camera
        if (d.key === 'camera') {
          box(d.x + 5, d.y - 8, d.z, 20, 8, 10, s.isDark ? ['#3D5C4B', '#1D3528', '#254233'] : ['#FFFFFF', '#D2DFD4', '#B8CEBC']);
          box(d.x + 16, d.y - 8, d.z, 4, 6, 8, ['#13221A', '#13221A', '#0D1611']);

          // Vision Cone sweeping across plaza
          const isAnomaly = s.drillScenario === 'drill_a';
          const coneColor = isAnomaly ? 'rgba(239, 68, 68, 0.28)' : 'rgba(36, 107, 69, 0.16)';
          const sweepZ = d.z + Math.sin(s.time * 0.9) * 25;

          poly([[d.x + 14, d.y - 6, d.z], [d.x + 115, 3, sweepZ - 50], [d.x + 115, 3, sweepZ + 45]], coneColor);
          line([[d.x + 14, d.y - 6, d.z], [d.x + 115, 3, sweepZ - 50]], isAnomaly ? '#EF4444' : '#246B45', 1);
          line([[d.x + 14, d.y - 6, d.z], [d.x + 115, 3, sweepZ + 45]], isAnomaly ? '#EF4444' : '#246B45', 1);

          // Anomaly Laser Blinding & Denial Shield HUD during Drill A!
          if (isAnomaly) {
            const pulseR = ((s.time * 50) % 80) + 10;
            ring(d.x, d.y, d.z, pulseR, 'rgba(239, 68, 68, 0.85)', 2.5);

            // 3D Denial Badge floating over camera
            const camHUD = P(d.x, d.y + 45, d.z);
            ctx.save();
            ctx.fillStyle = '#DC2626';
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('🛡️ [403 FORBIDDEN - ACCESS REJECTED]', camHUD.x, camHUD.y);
            ctx.fillStyle = '#246B45';
            ctx.font = 'bold 9px monospace';
            ctx.fillText('SENSITIVE EVIDENCE VAULT SECURED', camHUD.x, camHUD.y + 13);
            ctx.restore();
          } else {
            ring(d.x, 3, d.z, 24 + Math.sin(s.time * 2) * 2, '#246B45', 1.2);
          }
        }

        // B. SIG-02 Smart Traffic Signal
        else if (d.key === 'signal') {
          box(d.x, d.y - 7, d.z, 8, 22, 7, ['#13221A', '#13221A', '#0D1611']);

          const sigLenses = [
            { c: s.trafficColor === 'red' ? '#EF4444' : '#452020', y: d.y + 6 },
            { c: s.trafficColor === 'yellow' ? '#F59E0B' : '#45351A', y: d.y },
            { c: s.trafficColor === 'green' ? '#10B981' : '#143825', y: d.y - 6 },
          ];

          sigLenses.forEach((lens) => {
            const lp = P(d.x + 4.5, lens.y, d.z);
            ctx.fillStyle = lens.c;
            ctx.beginPath();
            ctx.arc(lp.x, lp.y, 2.5 * s.scale, 0, Math.PI * 2);
            ctx.fill();
          });
        }

        // C. PWR-03 Energy Substation
        else if (d.key === 'power') {
          box(d.x, 4, d.z, 30, 22, 26, s.isDark ? ['#3D5C4B', '#1D3528', '#254233'] : ['#E0ECE3', '#9BBBA2', '#B2CEB8']);
          for (let k = -1; k <= 1; k++) {
            box(d.x + k * 8, 26, d.z, 4, 12, 8, ['#BFE6C4', '#246B45', '#3D8C61']);
          }
          // Radiating electric power pulse waves
          ring(d.x, 3, d.z, ((s.time * 24) % 65) + 5, s.isDark ? 'rgba(52, 211, 153, 0.6)' : 'rgba(36, 107, 69, 0.45)', 1.5);
        }

        // D. ENV-04 Eco Telemetry Sensor
        else if (d.key === 'sensor') {
          box(d.x, d.y - 5, d.z, 14, 7, 10, s.isDark ? ['#3D5C4B', '#1D3528', '#254233'] : ['#E0ECE3', '#9BBBA2', '#B2CEB8']);
          ring(d.x, d.y - 4, d.z, 12 + ((s.time * 8) % 24), s.isDark ? 'rgba(52, 211, 153, 0.5)' : 'rgba(36, 107, 69, 0.35)', 1.2);
        }

        // E. Central Network Beams connecting nodes to Gateway
        if (d.key !== 'gateway') {
          const gw = CITY_3D_DEVICES[4];
          const pts: [number, number, number][] = [];
          for (let i = 0; i <= 30; i++) {
            const f = i / 30;
            pts.push([
              d.x + (gw.x - d.x) * f,
              d.y + (gw.y - d.y) * f + Math.sin(f * Math.PI) * 42,
              d.z + (gw.z - d.z) * f,
            ]);
          }
          line(pts, s.isDark ? 'rgba(52, 211, 153, 0.25)' : 'rgba(36, 107, 69, 0.2)', 1, [4, 6]);

          // Animated Network Particle Packet
          const f = (s.time * 0.22 + (d.x + d.z) * 0.002) % 1;
          const p = P(
            d.x + (gw.x - d.x) * f,
            d.y + (gw.y - d.y) * f + Math.sin(f * Math.PI) * 42,
            d.z + (gw.z - d.z) * f
          );
          ctx.fillStyle = s.isDark ? '#34D399' : '#246B45';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // 7. Protective Geodesic Dome Canopy
      if (domeVisible) {
        ring(0, 8, 0, 245, s.isDark ? 'rgba(52, 211, 153, 0.3)' : 'rgba(36, 107, 69, 0.25)', 2);

        // Breathing Dome Arc
        const domeGlowY = 95 + Math.sin(s.time * 1.5) * 6;
        const domeArcPts: [number, number, number][] = [];
        for (let i = 0; i <= 36; i++) {
          const a = (i / 36) * Math.PI;
          domeArcPts.push([
            Math.cos(a) * 230,
            domeGlowY * Math.sin(a),
            Math.sin(a) * 230 * 0.3,
          ]);
        }
        line(domeArcPts, s.isDark ? 'rgba(52, 211, 153, 0.65)' : 'rgba(36, 107, 69, 0.45)', 2.5);
      }

      // 8. Update screen coordinates for HTML Hotspot Pins & Tooltips
      if (onDeviceCoordsChange) {
        const coordsMap: Record<string, { x: number; y: number; visible: boolean }> = {};
        CITY_3D_DEVICES.forEach((d) => {
          const pt = P(d.x, d.y + 12, d.z);
          const isCategoryMatch = activeCategory === 'all' || d.category === activeCategory;
          coordsMap[d.key] = {
            x: pt.x,
            y: pt.y,
            visible: isCategoryMatch && pt.x > 20 && pt.x < width - 20 && pt.y > 20 && pt.y < height - 20,
          };
        });
        onDeviceCoordsChange(coordsMap);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [domeVisible, activeCategory, onDeviceCoordsChange]);

  // Pointer Interaction Handlers for 360-Degree Orbit, Pan & Drag
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    s.drag = true;
    s.dragX = e.clientX;
    s.dragY = e.clientY;
    s.autoOrbit = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    if (s.drag) {
      const deltaX = e.clientX - s.dragX;
      const deltaY = e.clientY - s.dragY;
      s.targetAngle += deltaX * 0.007;
      s.targetTilt = Math.max(0.35, Math.min(0.82, s.targetTilt - deltaY * 0.004));
      s.dragX = e.clientX;
      s.dragY = e.clientY;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    stateRef.current.drag = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Non-blocking
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const newZoom = Math.max(0.65, Math.min(2.4, stateRef.current.targetZoom - e.deltaY * 0.0012));
    stateRef.current.targetZoom = newZoom;
    onZoomChange(newZoom);
  };

  // Canvas Click Detection to Select Devices
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const s = stateRef.current;
    const P = (x: number, y: number, z: number) => {
      const rx = x * Math.cos(s.angle) - z * Math.sin(s.angle);
      const rz = x * Math.sin(s.angle) + z * Math.cos(s.angle);
      return {
        x: s.centerX + rx * s.scale,
        y: s.centerY + (rz * s.tilt - y) * s.scale,
      };
    };

    // Find closest device within 32px click radius
    for (const d of CITY_3D_DEVICES) {
      const pt = P(d.x, d.y, d.z);
      const dist = Math.hypot(clickX - pt.x, clickY - pt.y);
      if (dist < 32) {
        onSelectDeviceKey(d.key);
        break;
      }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: stateRef.current.drag ? 'grabbing' : 'grab',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
        aria-label="Interactive 3D living smart city diorama with animated cars, buildings, and defense nodes. Drag to orbit, scroll to zoom."
      />
    </div>
  );
};
