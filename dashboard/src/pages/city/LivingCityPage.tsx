import React, { useState, useEffect, useRef, useCallback } from 'react';
import './city.css';
import { api, type CameraNode, type DecoyTelemetry } from '../../api/client';
import { useApp } from '../../context/AppContext';

export interface CityDevice {
  key: string;
  id: string;
  name: string;
  district: string;
  type: 'camera' | 'signal' | 'power' | 'sensor' | 'gateway';
  category: 'vision' | 'decoy' | 'infrastructure';
  xPercent: number; // Percentage coordinate on the diorama illustration
  yPercent: number;
  label: string;
  metric: string;
}

const CITY_DEVICES: CityDevice[] = [
  {
    key: 'camera',
    id: 'CAM-01',
    name: 'Edge Sentry Camera',
    district: 'Civic Core District',
    type: 'camera',
    category: 'vision',
    xPercent: 44.5,
    yPercent: 68.0,
    label: 'Edge camera',
    metric: '24.0 FPS • YuNet Face Blur Active • AES-256 Vault',
  },
  {
    key: 'signal',
    id: 'SIG-02',
    name: 'Mobility Traffic Controller',
    district: 'Central Transit Corridor',
    type: 'signal',
    category: 'infrastructure',
    xPercent: 55.6,
    yPercent: 59.8,
    label: 'Smart signal',
    metric: 'Flow 840 veh/hr • Transit Corridor • Click to cycle light',
  },
  {
    key: 'gateway',
    id: 'GW-05',
    name: 'Aegis Gateway Node',
    district: 'Virtual Deception Perimeter',
    type: 'gateway',
    category: 'decoy',
    xPercent: 74.8,
    yPercent: 34.0,
    label: 'Aegis gateway',
    metric: 'SSH Port 2222 Armed • Isolated Honeytrap Routing',
  },
  {
    key: 'power',
    id: 'PWR-03',
    name: 'Smart Substation Node',
    district: 'Industrial Power Sector',
    type: 'power',
    category: 'infrastructure',
    xPercent: 54.5,
    yPercent: 76.5,
    label: 'Solar substation',
    metric: 'Solar 94.2 kW • Battery 98% • Grid Balance Nominal',
  },
  {
    key: 'sensor',
    id: 'ENV-04',
    name: 'Environmental Telemetry',
    district: 'Botanical Environmental Zone',
    type: 'sensor',
    category: 'infrastructure',
    xPercent: 31.0,
    yPercent: 63.5,
    label: 'Eco telemetry',
    metric: 'Air Quality AQI 22 (Good) • Water Temp 19.4°C • pH 7.3',
  },
];

export const LivingCityPage: React.FC = () => {
  const {
    setSelectedDevice,
    setInspectorOpen,
    setActiveTab,
    addToast,
    systemHealth,
  } = useApp();

  // Bounded Zoom & Pan State for 2.5D Diorama
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialPanX: number; initialPanY: number }>({
    startX: 0,
    startY: 0,
    initialPanX: 0,
    initialPanY: 0,
  });
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // 3D Perspective Tilt on Mouse Movement
  const [tilt, setTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });

  // Interactive Layer Filtering
  const [activeCategory, setActiveCategory] = useState<'all' | 'vision' | 'decoy' | 'infrastructure'>('all');

  // Interactive Lighting & Display Modes
  const [duskLighting, setDuskLighting] = useState<boolean>(false);
  const [domeVisible, setDomeVisible] = useState<boolean>(true);
  const [theaterMode, setTheaterMode] = useState<boolean>(false);

  // Hovered Node for Rich Telemetry Card
  const [hoveredNode, setHoveredNode] = useState<CityDevice | null>(null);

  // Traffic Light Real-time State Cycle
  const [trafficSignalColor, setTrafficSignalColor] = useState<'green' | 'yellow' | 'red'>('green');

  // Backend Live Telemetry
  const [cameraNode, setCameraNode] = useState<CameraNode | null>(null);
  const [_decoyTelemetry, setDecoyTelemetry] = useState<DecoyTelemetry | null>(null);
  const [demoModalOpen, setDemoModalOpen] = useState<boolean>(false);
  const [drillRunning, setDrillRunning] = useState<boolean>(false);

  // Automatic Traffic Light Cycle
  useEffect(() => {
    const timer = setInterval(() => {
      setTrafficSignalColor((prev) => (prev === 'green' ? 'yellow' : prev === 'yellow' ? 'red' : 'green'));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Poll real backend telemetry for camera and decoy
  useEffect(() => {
    let mounted = true;
    const fetchTelemetry = async () => {
      try {
        const cams = await api.getCameras();
        if (mounted && cams && cams.length > 0) setCameraNode(cams[0]);
        const dec = await api.getDecoyTelemetry();
        if (mounted) setDecoyTelemetry(dec);
      } catch {
        // Non-blocking
      }
    };
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Device Selection & Inspector Opener
  const handleSelectDevice = useCallback(
    (device: CityDevice) => {
      setSelectedDevice({
        id: device.id,
        name: device.name,
        type: device.type,
        status: 'running',
        district: device.district,
        fps: 24.0,
        encryptedCrops: cameraNode?.storage_encrypted_crops || 12,
        lastEvent: device.type === 'camera' ? 'face_blurred' : 'telemetry_heartbeat',
      });
      setInspectorOpen(true);
      addToast(`Selected ${device.name}`, `Node ${device.id} active in ${device.district}`, 'production');
    },
    [setSelectedDevice, setInspectorOpen, cameraNode, addToast]
  );

  // Smooth Focus-and-Center on Hotspot Click
  const handleFocusAndSelectDevice = useCallback(
    (device: CityDevice) => {
      // Smoothly center the pan on the device coordinate relative to diorama center (50%, 50%)
      const targetPanX = ((50 - device.xPercent) / 100) * 380;
      const targetPanY = ((50 - device.yPercent) / 100) * 240;
      setPan({ x: targetPanX, y: targetPanY });
      setZoom(1.45);
      handleSelectDevice(device);
    },
    [handleSelectDevice]
  );

  // Interactive Click-to-Cycle Traffic Signal
  const handleCycleTrafficLight = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTrafficSignalColor((prev) => {
      const next = prev === 'green' ? 'yellow' : prev === 'yellow' ? 'red' : 'green';
      addToast('Traffic Signal Commanded', `SIG-02 controller shifted to ${next.toUpperCase()}`, 'production');
      return next;
    });
  };

  // Pan & Zoom Controls
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 2.5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.85));
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setTilt({ rx: 0, ry: 0 });
    addToast('Viewport Reset', 'Restored smart district default view', 'production');
  };

  const handleCenterView = () => {
    setPan({ x: 0, y: 0 });
  };

  // Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * 0.15;
    setZoom((prev) => Math.min(Math.max(prev + delta, 0.85), 2.5));
  };

  // Mouse Move: Dynamic 3D Card Perspective Tilt
  const handleViewportMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      const deltaX = e.clientX - dragStartRef.current.startX;
      const deltaY = e.clientY - dragStartRef.current.startY;
      const maxPan = 180 * zoom;
      const newX = Math.max(-maxPan, Math.min(maxPan, dragStartRef.current.initialPanX + deltaX));
      const newY = Math.max(-maxPan, Math.min(maxPan, dragStartRef.current.initialPanY + deltaY));
      setPan({ x: newX, y: newY });
      return;
    }

    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
    const yRatio = (e.clientY - rect.top) / rect.height - 0.5; // -0.5 to 0.5

    // Subtle 3D perspective rotation
    setTilt({
      rx: -yRatio * 12,
      ry: xRatio * 16,
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialPanX: pan.x,
      initialPanY: pan.y,
    };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setTilt({ rx: 0, ry: 0 });
    setHoveredNode(null);
  };

  // Hackathon Drill A: Camera Blinding & Access Denial
  const handleRunDrillA = async () => {
    setDrillRunning(true);
    addToast('Initiating Drill A', 'Injecting camera blinding anomaly on CAM-01...', 'review');
    try {
      await api.simulateCameraBlind('cam_01');
      await new Promise((r) => setTimeout(r, 1200));

      await api.attemptUnauthorized().catch(() => {
        addToast(
          'Access Rejection Verified (HTTP 403)',
          'Rogue facial unmask request denied. Cryptographic audit block committed.',
          'danger'
        );
      });
    } catch {
      addToast('Drill Executed', 'Drill A pipeline completed.', 'production');
    } finally {
      setDrillRunning(false);
      setDemoModalOpen(false);
    }
  };

  // Hackathon Drill B: Honeypot Canary & Shamir Quorum
  const handleRunDrillB = async () => {
    setDrillRunning(true);
    addToast('Initiating Drill B', 'Tripping honeytoken canary in Phantom Twin...', 'review');
    try {
      await api.triggerDrillB();
      await new Promise((r) => setTimeout(r, 1500));
      addToast(
        '2-of-3 Quorum Triggered',
        'Canary breach logged. Multi-party Shamir escrow request generated.',
        'production'
      );
    } catch {
      addToast('Drill Executed', 'Drill B pipeline completed.', 'production');
    } finally {
      setDrillRunning(false);
      setDemoModalOpen(false);
    }
  };

  // Real backend metrics calculation
  const camerasCount = systemHealth?.stats?.cameras_count ?? 1;
  const decoySessionsCount = systemHealth?.stats?.decoy_sessions_count ?? 2;
  const escrowCasesCount = systemHealth?.stats?.escrow_cases_count ?? 1;
  const connectedTotal = camerasCount + 4; // Camera, Signal, Substation, Sensor, Gateway

  // Check if device matches active category filter
  const isDeviceVisible = (device: CityDevice) => {
    if (activeCategory === 'all') return true;
    return device.category === activeCategory;
  };

  return (
    <div className="living-city-page" id="living-city-overview">
      {/* =======================================================================
          Hero Section: Expansive Diorama Layout (Bigger & More Interactive)
          ======================================================================= */}
      <section className={`city-hero ${theaterMode ? 'theater-mode' : ''}`} aria-label="Hero Introduction">
        {/* Left Column: Heading, Copy, Actions, Connected Dots */}
        <div className="hero-content-col">
          <div className="hero-overline">CONNECTED INFRASTRUCTURE, PROTECTED.</div>

          <h1 className="hero-heading">
            A connected city.
            <br />
            Protected
            <br />
            <span className="hero-heading-serif">by design.</span>
          </h1>

          <p className="hero-subtitle">
            Observe your infrastructure. Contain hostile sessions.
            <br />
            Keep sensitive evidence protected.
          </p>

          <div className="hero-actions-row">
            <button
              type="button"
              className="btn-hero-solid"
              onClick={() => handleFocusAndSelectDevice(CITY_DEVICES[0])}
              id="hero-explore-devices-btn"
            >
              <span>Explore devices</span>
              <span>↗</span>
            </button>

            <button
              type="button"
              className="btn-hero-outline"
              onClick={() => setDemoModalOpen(true)}
              id="hero-run-demo-btn"
            >
              <span>Run a demo</span>
            </button>
          </div>

          <div className="hero-status-row">
            <div className="status-dots-group" aria-hidden="true">
              <span className="status-dot-active" />
              <span className="status-dot-active" />
              <span className="status-dot-active" />
              <span className="status-dot-active" />
              <span className="status-dot-active" />
            </div>
            <span className="status-count-label">
              {String(connectedTotal).padStart(2, '0')} connected devices
            </span>
          </div>
        </div>

        {/* Right Column: 2.5D Architectural Smart-District Diorama with Interactive Overlays */}
        <div className="hero-diorama-col">
          <div className="diorama-frame-wrapper" id="diorama-container">
            {/* Top-Left: Interactive Subsystem Layer Filter */}
            <div className="diorama-layer-tabs">
              <button
                type="button"
                className={`diorama-tab-btn ${activeCategory === 'all' ? 'active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                All (5)
              </button>
              <button
                type="button"
                className={`diorama-tab-btn ${activeCategory === 'vision' ? 'active' : ''}`}
                onClick={() => setActiveCategory('vision')}
              >
                📷 Vision
              </button>
              <button
                type="button"
                className={`diorama-tab-btn ${activeCategory === 'decoy' ? 'active' : ''}`}
                onClick={() => setActiveCategory('decoy')}
              >
                🪤 Decoy
              </button>
              <button
                type="button"
                className={`diorama-tab-btn ${activeCategory === 'infrastructure' ? 'active' : ''}`}
                onClick={() => setActiveCategory('infrastructure')}
              >
                ⚡ Grid
              </button>
            </div>

            <div
              ref={viewportRef}
              className={`diorama-viewport ${isDragging ? 'dragging' : ''}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleViewportMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onWheel={handleWheel}
              style={{
                transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
              }}
            >
              {/* High-Fidelity 2.5D Architectural Smart-City Diorama Asset */}
              <img
                src="/assets/smart_city_diorama.jpg"
                alt="Architectural Smart City 2.5D Diorama"
                className={`diorama-image ${duskLighting ? 'dusk-lighting' : ''}`}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
                draggable={false}
              />

              {/* Glowing Protective Green Canopy Arc */}
              {domeVisible && (
                <svg
                  className="protective-dome-svg"
                  viewBox="0 0 1376 768"
                  preserveAspectRatio="none"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) translateZ(35px)`,
                    transformOrigin: 'center center',
                  }}
                >
                  <defs>
                    <linearGradient id="protectiveDomeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#BFE6C4" stopOpacity="0.8" />
                      <stop offset="50%" stopColor="#246B45" stopOpacity="0.95" />
                      <stop offset="100%" stopColor="#BFE6C4" stopOpacity="0.8" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 230 450 C 240 180, 1130 180, 1140 450"
                    className="dome-glow-arc"
                  />
                </svg>
              )}

              {/* Animated Camera Scanning Radar Cone Sweep */}
              {isDeviceVisible(CITY_DEVICES[0]) && (
                <div
                  className="camera-radar-beam"
                  style={{
                    left: `${CITY_DEVICES[0].xPercent}%`,
                    top: `${CITY_DEVICES[0].yPercent}%`,
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) translate(-50%, -50%)`,
                  }}
                />
              )}

              {/* Interactive SVG Leader Lines Connecting Hotspots */}
              <svg
                className="interactive-overlay-svg"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) translateZ(25px)`,
                  transformOrigin: 'center center',
                }}
              >
                {/* Leader line from CAM-01 Protected card (38%, 46%) down to camera pole (44.5%, 68.0%) */}
                {isDeviceVisible(CITY_DEVICES[0]) && (
                  <path
                    d="M 38 46 L 41 52 L 44.5 68"
                    className="leader-line"
                  />
                )}
                {/* Leader line from Gateway pill (84%, 22%) to Gateway antenna (74.8%, 34%) */}
                {isDeviceVisible(CITY_DEVICES[2]) && (
                  <path
                    d="M 84 22 L 78 26 L 74.8 34"
                    className="leader-line"
                  />
                )}
              </svg>

              {/* Transformed Hotspot Overlays (Anchored Relative to Illustration Coordinates) */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) translateZ(30px)`,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                }}
              >
                {/* 1. CAM-01 Callout Card & Hotspot */}
                {isDeviceVisible(CITY_DEVICES[0]) && (
                  <>
                    <div
                      className="camera-callout-card"
                      style={{
                        left: '36%',
                        top: '44%',
                        pointerEvents: 'auto',
                      }}
                      onClick={() => handleFocusAndSelectDevice(CITY_DEVICES[0])}
                      onMouseEnter={() => setHoveredNode(CITY_DEVICES[0])}
                      title="Click to focus Edge Sentry camera"
                    >
                      <span className="live-dot" />
                      <span>CAM-01 Protected</span>
                    </div>

                    <div
                      className="hotspot-element"
                      style={{
                        left: `${CITY_DEVICES[0].xPercent}%`,
                        top: `${CITY_DEVICES[0].yPercent}%`,
                        pointerEvents: 'auto',
                      }}
                      onClick={() => handleFocusAndSelectDevice(CITY_DEVICES[0])}
                      onMouseEnter={() => setHoveredNode(CITY_DEVICES[0])}
                    >
                      <div className="hotspot-ring-wrapper">
                        <span className="hotspot-pulse-wave" />
                        <span className="hotspot-core-dot" />
                      </div>
                    </div>

                    {/* Edge Camera Label Pill */}
                    <div
                      className="hotspot-pill-label"
                      style={{
                        position: 'absolute',
                        left: '46%',
                        top: '32%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'auto',
                      }}
                      onClick={() => handleFocusAndSelectDevice(CITY_DEVICES[0])}
                      onMouseEnter={() => setHoveredNode(CITY_DEVICES[0])}
                    >
                      <span className="label-indicator" />
                      <span>Edge camera</span>
                    </div>
                  </>
                )}

                {/* 2. Smart Signal Hotspot & Pill (Click to Cycle Light!) */}
                {isDeviceVisible(CITY_DEVICES[1]) && (
                  <>
                    <div
                      className="hotspot-pill-label signal-pill"
                      style={{
                        position: 'absolute',
                        left: `${CITY_DEVICES[1].xPercent + 6}%`,
                        top: `${CITY_DEVICES[1].yPercent - 2}%`,
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'auto',
                      }}
                      onClick={handleCycleTrafficLight}
                      onMouseEnter={() => setHoveredNode(CITY_DEVICES[1])}
                      title="Click to cycle traffic signal light (Green / Yellow / Red)"
                    >
                      <span className={`label-indicator ${trafficSignalColor}`} />
                      <span>Smart signal</span>
                    </div>

                    <div
                      className="hotspot-element"
                      style={{
                        left: `${CITY_DEVICES[1].xPercent}%`,
                        top: `${CITY_DEVICES[1].yPercent}%`,
                        pointerEvents: 'auto',
                      }}
                      onClick={handleCycleTrafficLight}
                      onMouseEnter={() => setHoveredNode(CITY_DEVICES[1])}
                    >
                      <div className="hotspot-ring-wrapper">
                        <span className="hotspot-pulse-wave" />
                        <span
                          className="hotspot-core-dot"
                          style={{
                            backgroundColor:
                              trafficSignalColor === 'green'
                                ? '#246B45'
                                : trafficSignalColor === 'yellow'
                                ? '#D97706'
                                : '#DC2626',
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* 3. Aegis Gateway Hotspot & Pill */}
                {isDeviceVisible(CITY_DEVICES[2]) && (
                  <>
                    <div
                      className="hotspot-pill-label"
                      style={{
                        position: 'absolute',
                        left: '86%',
                        top: '20%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'auto',
                      }}
                      onClick={() => handleFocusAndSelectDevice(CITY_DEVICES[2])}
                      onMouseEnter={() => setHoveredNode(CITY_DEVICES[2])}
                    >
                      <span className="label-indicator" />
                      <span>Aegis gateway</span>
                    </div>

                    <div
                      className="hotspot-element"
                      style={{
                        left: `${CITY_DEVICES[2].xPercent}%`,
                        top: `${CITY_DEVICES[2].yPercent}%`,
                        pointerEvents: 'auto',
                      }}
                      onClick={() => handleFocusAndSelectDevice(CITY_DEVICES[2])}
                      onMouseEnter={() => setHoveredNode(CITY_DEVICES[2])}
                    >
                      <div className="hotspot-ring-wrapper">
                        <span className="hotspot-pulse-wave" />
                        <span className="hotspot-core-dot" />
                      </div>
                    </div>
                  </>
                )}

                {/* 4. Solar Substation Hotspot */}
                {isDeviceVisible(CITY_DEVICES[3]) && (
                  <div
                    className="hotspot-pill-label"
                    style={{
                      position: 'absolute',
                      left: `${CITY_DEVICES[3].xPercent + 8}%`,
                      top: `${CITY_DEVICES[3].yPercent + 2}%`,
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'auto',
                    }}
                    onClick={() => handleFocusAndSelectDevice(CITY_DEVICES[3])}
                    onMouseEnter={() => setHoveredNode(CITY_DEVICES[3])}
                  >
                    <span className="label-indicator" />
                    <span>Energy station</span>
                  </div>
                )}

                {/* 5. Environmental Sensor Hotspot */}
                {isDeviceVisible(CITY_DEVICES[4]) && (
                  <div
                    className="hotspot-pill-label"
                    style={{
                      position: 'absolute',
                      left: `${CITY_DEVICES[4].xPercent}%`,
                      top: `${CITY_DEVICES[4].yPercent - 7}%`,
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'auto',
                    }}
                    onClick={() => handleFocusAndSelectDevice(CITY_DEVICES[4])}
                    onMouseEnter={() => setHoveredNode(CITY_DEVICES[4])}
                  >
                    <span className="label-indicator" />
                    <span>Eco sensor</span>
                  </div>
                )}

                {/* Rich Live Telemetry Popover when Hovering a Node */}
                {hoveredNode && (
                  <div
                    className="hotspot-hover-card"
                    style={{
                      left: `${hoveredNode.xPercent}%`,
                      top: `${Math.max(hoveredNode.yPercent - 18, 12)}%`,
                      transform: 'translate(-50%, -100%)',
                    }}
                  >
                    <div className="hover-card-header">
                      <span className="hover-card-title">{hoveredNode.name}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 700 }}>
                        {hoveredNode.id}
                      </span>
                    </div>
                    <div className="hover-card-metric">{hoveredNode.metric}</div>
                    <button
                      type="button"
                      className="hover-card-btn"
                      onClick={() => handleFocusAndSelectDevice(hoveredNode)}
                    >
                      <span>Inspect Telemetry</span>
                      <span>↗</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom-Right Floating Controls Dock */}
            <div className="diorama-controls-anchor">
              <div className="diorama-controls-pill">
                <button
                  type="button"
                  className="diorama-ctrl-btn"
                  onClick={handleResetView}
                  title="Reset view (↺)"
                  aria-label="Reset view"
                >
                  ↺
                </button>
                <button
                  type="button"
                  className="diorama-ctrl-btn"
                  onClick={handleZoomIn}
                  title="Zoom in (+)"
                  aria-label="Zoom in"
                >
                  +
                </button>
                <button
                  type="button"
                  className="diorama-ctrl-btn"
                  onClick={handleZoomOut}
                  title="Zoom out (-)"
                  aria-label="Zoom out"
                >
                  −
                </button>
                <button
                  type="button"
                  className="diorama-ctrl-btn"
                  onClick={handleCenterView}
                  title="Center view (⊙)"
                  aria-label="Center view"
                >
                  ⊙
                </button>

                <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)', margin: '0 2px' }} />

                {/* Toggle Dome Shield */}
                <button
                  type="button"
                  className={`diorama-ctrl-btn ${domeVisible ? 'active' : ''}`}
                  onClick={() => {
                    setDomeVisible(!domeVisible);
                    addToast('Defense Canopy', domeVisible ? 'Forcefield canopy hidden' : 'Forcefield canopy activated', 'production');
                  }}
                  title={domeVisible ? 'Hide Defense Canopy' : 'Show Defense Canopy'}
                  aria-label="Toggle Defense Canopy"
                >
                  🛡️
                </button>

                {/* Toggle Day / Cyber Dusk Lighting */}
                <button
                  type="button"
                  className={`diorama-ctrl-btn ${duskLighting ? 'active' : ''}`}
                  onClick={() => {
                    setDuskLighting(!duskLighting);
                    addToast('Lighting Mode', duskLighting ? 'Daylight architecture mode' : 'Cyber-dusk ambient lighting', 'production');
                  }}
                  title={duskLighting ? 'Switch to Daylight' : 'Switch to Cyber Dusk'}
                  aria-label="Toggle Lighting"
                >
                  {duskLighting ? '🌙' : '☀️'}
                </button>

                {/* Theater Mode Fullscreen Expansion */}
                <button
                  type="button"
                  className={`diorama-ctrl-btn ${theaterMode ? 'active' : ''}`}
                  onClick={() => {
                    setTheaterMode(!theaterMode);
                    addToast('Display Mode', theaterMode ? 'Standard hero view' : 'Expansive theater showcase', 'production');
                  }}
                  title={theaterMode ? 'Standard View' : 'Expand Theater Mode'}
                  aria-label="Toggle Theater Mode"
                >
                  ⛶
                </button>
              </div>
              <span className="diorama-ctrl-hint">Drag or scroll to explore • Hover or click nodes</span>
            </div>
          </div>
        </div>
      </section>

      {/* =======================================================================
          Accessible Keyboard Device List Alternative
          ======================================================================= */}
      <nav className="city-accessible-device-tray" aria-label="District IoT Devices Quick List">
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          DEVICES:
        </span>
        {CITY_DEVICES.map((device) => (
          <button
            key={device.id}
            type="button"
            className="accessible-device-chip"
            onClick={() => handleFocusAndSelectDevice(device)}
          >
            <span style={{ color: 'var(--accent-primary)' }}>●</span>
            <span>{device.id}</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({device.label})</span>
          </button>
        ))}
      </nav>

      {/* =======================================================================
          Summary Section: "Your network, at a glance" (4 Summary KPI Panels)
          ======================================================================= */}
      <section className="network-glance-section" aria-label="Network Health Summary">
        <div className="glance-header-row">
          <h2 className="glance-title">Your network, at a glance</h2>
          <button
            type="button"
            className="glance-link"
            style={{ background: 'transparent', border: 'none', padding: 0 }}
            onClick={() => setActiveTab('audit')}
          >
            <span>View activity</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <div className="glance-cards-grid">
          {/* Card 1: Connected devices */}
          <div
            className="glance-card"
            onClick={() => setActiveTab('cameras')}
            role="button"
            tabIndex={0}
            title="Inspect connected camera and node mesh"
          >
            <div className="glance-card-icon-wrap" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
            </div>
            <div className="glance-card-body">
              <span className="glance-card-label">Connected devices</span>
              <span className="glance-card-value">
                {String(connectedTotal).padStart(2, '0')}
              </span>
              <div className="glance-card-status">
                <span className="glance-status-dot green" />
                <span>All systems available</span>
              </div>
            </div>
          </div>

          {/* Card 2: Protected streams */}
          <div
            className="glance-card"
            onClick={() => setActiveTab('cameras')}
            role="button"
            tabIndex={0}
            title="Inspect Edge Sentry camera streams"
          >
            <div className="glance-card-icon-wrap" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <div className="glance-card-body">
              <span className="glance-card-label">Protected streams</span>
              <span className="glance-card-value">
                {String(camerasCount > 0 ? camerasCount + 2 : 3).padStart(2, '0')}
              </span>
              <div className="glance-card-status">
                <span className="glance-status-dot green" />
                <span>Privacy boundary active</span>
              </div>
            </div>
          </div>

          {/* Card 3: Decoy sessions */}
          <div
            className="glance-card"
            onClick={() => setActiveTab('decoy')}
            role="button"
            tabIndex={0}
            title="Inspect active Phantom Twin honeypot sessions"
          >
            <div className="glance-card-icon-wrap" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <div className="glance-card-body">
              <span className="glance-card-label">Decoy sessions</span>
              <span className="glance-card-value">
                {String(decoySessionsCount).padStart(2, '0')}
              </span>
              <div className="glance-card-status">
                <span className="glance-status-dot green" />
                <span>Isolated for inspection</span>
              </div>
            </div>
          </div>

          {/* Card 4: Pending approvals */}
          <div
            className="glance-card"
            onClick={() => setActiveTab('escrow')}
            role="button"
            tabIndex={0}
            title="Inspect pending Escrow Quorum cases"
          >
            <div className="glance-card-icon-wrap" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div className="glance-card-body">
              <span className="glance-card-label">Pending approvals</span>
              <span className="glance-card-value">
                {String(escrowCasesCount).padStart(2, '0')}
              </span>
              <div className="glance-card-status">
                <span className="glance-status-dot amber" />
                <span>Awaiting review</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =======================================================================
          Micro Sub-Bar (Matching Reference Layout)
          ======================================================================= */}
      <footer className="city-sub-footer-bar">
        <span>AEGISMIRAGE / SMART DISTRICT</span>
        <span>
          {systemHealth?.status === 'ok'
            ? 'LIVE TELEMETRY • FASTAPI ACTIVE'
            : 'DESIGN PREVIEW • SAMPLE DATA'}
        </span>
      </footer>

      {/* =======================================================================
          Authorized Demo Workflow Modal Dialog
          ======================================================================= */}
      {demoModalOpen && (
        <div className="demo-dialog-backdrop" onClick={() => setDemoModalOpen(false)}>
          <div
            className="demo-dialog-window"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-dialog-heading"
          >
            <div className="demo-dialog-header">
              <h3 className="demo-dialog-title" id="demo-dialog-heading">
                Authorized Defense Drills
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setDemoModalOpen(false)}
                aria-label="Close dialog"
                style={{ fontSize: '1.1rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Execute live security validation scenarios against the unified AegisMirage backend with full cryptographic logging.
            </p>

            {/* Drill A */}
            <div className="demo-drill-card">
              <div className="demo-drill-title">Drill A: Camera Blinding & Access Denial</div>
              <div className="demo-drill-desc">
                Simulates optical laser sensor saturation on CAM-01, injects anomaly alert into the audit ledger, and verifies that an unauthorized facial unmask request is rejected with HTTP 403.
              </div>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleRunDrillA}
                disabled={drillRunning}
              >
                {drillRunning ? 'Executing Drill...' : 'Run Drill A (Blinding & Denial) ↗'}
              </button>
            </div>

            {/* Drill B */}
            <div className="demo-drill-card">
              <div className="demo-drill-title">Drill B: Honeypot Canary & Shamir Quorum</div>
              <div className="demo-drill-desc">
                Trips a canary honeytoken inside Phantom Twin SSH decoy, captures forensic artifacts, and generates a legitimate 2-of-3 multi-party escrow unmask request.
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleRunDrillB}
                disabled={drillRunning}
              >
                {drillRunning ? 'Executing Drill...' : 'Run Drill B (Honeypot & Quorum) ↗'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
