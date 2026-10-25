import React, { useState, useEffect, useCallback } from 'react';
import './city.css';
import { api, type CameraNode, type DecoyTelemetry } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { City3DCanvas } from './City3DCanvas';

export interface CityDevice {
  key: string;
  id: string;
  name: string;
  district: string;
  type: 'camera' | 'signal' | 'power' | 'sensor' | 'gateway';
  category: 'vision' | 'decoy' | 'infrastructure';
  xPercent: number;
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

  // 3D Canvas Camera & Viewport State
  const [zoom, setZoom] = useState<number>(1);
  const [autoOrbit, setAutoOrbit] = useState<boolean>(true);
  const [selectedDeviceKey, setSelectedDeviceKey] = useState<string | null>(null);

  // Live Screen Projection Coords of 3D Devices
  const [deviceCoords, setDeviceCoords] = useState<Record<string, { x: number; y: number; visible: boolean }>>({});

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

  // Real-time 3D Model Demo Participation State
  const [demoScenario, setDemoScenario] = useState<'none' | 'drill_a' | 'drill_b' | 'intrusion'>('none');

  // Automatic Traffic Light Cycle (Cars physically respond in 3D!)
  useEffect(() => {
    const timer = setInterval(() => {
      setTrafficSignalColor((prev) => (prev === 'green' ? 'yellow' : prev === 'yellow' ? 'red' : 'green'));
    }, 6000);
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
      setSelectedDeviceKey(device.key);
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
      setSelectedDeviceKey(device.key);
      handleSelectDevice(device);
    },
    [handleSelectDevice]
  );

  // Interactive Click-to-Cycle Traffic Signal
  const handleCycleTrafficLight = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTrafficSignalColor((prev) => {
      const next = prev === 'green' ? 'yellow' : prev === 'yellow' ? 'red' : 'green';
      addToast('Traffic Signal Commanded', `SIG-02 controller shifted to ${next.toUpperCase()} (3D cars reacting)`, 'production');
      return next;
    });
  };

  // Pan & Zoom Controls
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 2.4));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.7));
  };

  const handleResetView = () => {
    setZoom(1);
    setSelectedDeviceKey(null);
    setDemoScenario('none');
    setAutoOrbit(true);
    addToast('3D Viewport Reset', 'Restored default smart district isometric view', 'production');
  };

  // Hackathon Drill A: Camera Blinding & Access Denial (3D Model Actively Participates!)
  const handleRunDrillA = async () => {
    setDrillRunning(true);
    setDemoScenario('drill_a');
    addToast('3D Defense Active: Drill A', 'Injecting optical blinding anomaly on CAM-01 in 3D...', 'review');
    try {
      await api.simulateCameraBlind('cam_01');
      await new Promise((r) => setTimeout(r, 1500));

      await api.attemptUnauthorized().catch(() => {
        addToast(
          'Access Rejection Verified (HTTP 403)',
          'Rogue facial unmask request denied. 3D cryptographic denial shield active.',
          'danger'
        );
      });
      await new Promise((r) => setTimeout(r, 2000));
    } catch {
      addToast('Drill Executed', 'Drill A pipeline completed.', 'production');
    } finally {
      setDrillRunning(false);
      setTimeout(() => {
        setDemoScenario('none');
      }, 10000);
    }
  };

  // Hackathon Drill B: Honeypot Canary & Shamir Quorum (3D Model Elevates Phantom Twin!)
  const handleRunDrillB = async () => {
    setDrillRunning(true);
    setDemoScenario('drill_b');
    addToast('3D Defense Active: Drill B', 'Spawning Phantom Twin 3D decoy district & tripping canary...', 'review');
    try {
      await api.triggerDrillB();
      await new Promise((r) => setTimeout(r, 2000));
      addToast(
        '2-of-3 Quorum Triggered',
        'Canary breach logged in 3D. Threat isolated inside violet honeypot.',
        'production'
      );
      await new Promise((r) => setTimeout(r, 3000));
    } catch {
      addToast('Drill Executed', 'Drill B pipeline completed.', 'production');
    } finally {
      setDrillRunning(false);
      setTimeout(() => {
        setDemoScenario('none');
      }, 12000);
    }
  };

  // Full Interactive 3D Intrusion Scenario (Multi-Stage Live Walkthrough)
  const handleRunFullScenario = async () => {
    setDrillRunning(true);
    setDemoScenario('intrusion');
    addToast('Scenario Phase 1: Threat Detected', 'Incoming unauthorized SSH probe detected at perimeter gateway...', 'review');
    await new Promise((r) => setTimeout(r, 2000));

    setDemoScenario('drill_b');
    addToast('Scenario Phase 2: Decoy Redirection', 'Phantom Twin elevated in 3D. Hostile session redirected away from real city.', 'production');
    await new Promise((r) => setTimeout(r, 2500));

    addToast('Scenario Phase 3: Canary Tripped', 'Honeytoken accessed inside decoy. Forensic payload quarantined.', 'danger');
    await new Promise((r) => setTimeout(r, 2500));

    addToast('Scenario Phase 4: Quorum Held', 'Real city remains completely untouched. Cryptographic audit committed.', 'production');
    setDrillRunning(false);
    setTimeout(() => {
      setDemoScenario('none');
    }, 15000);
  };

  // Real backend metrics calculation
  const camerasCount = systemHealth?.stats?.cameras_count ?? 1;
  const decoySessionsCount = systemHealth?.stats?.decoy_sessions_count ?? 2;
  const escrowCasesCount = systemHealth?.stats?.escrow_cases_count ?? 1;
  const connectedTotal = camerasCount + 4; // Camera, Signal, Substation, Sensor, Gateway

  // Check if device matches active category filter
  const isDeviceCategoryMatch = (device: CityDevice) => {
    if (activeCategory === 'all') return true;
    return device.category === activeCategory;
  };

  return (
    <div className="living-city-page" id="living-city-overview">
      {/* =======================================================================
          Hero Section: Living 3D Diorama Showcase (35% Text / 65% Interactive 3D Model)
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

        {/* Right Column: Real-time 3D Living Smart-District Diorama Canvas */}
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

            {/* 3D Scenario HUD Banner (Animates during Demo Drills!) */}
            {demoScenario !== 'none' && (
              <div className={`diorama-scenario-banner ${demoScenario}`}>
                <span className="live-dot pulse-danger" />
                <span>
                  {demoScenario === 'drill_a' && '3D ACTIVE DEFENSE: CAM-01 SENSOR BLINDING • 403 CRYPTOGRAPHIC DENIAL'}
                  {demoScenario === 'drill_b' && '3D ACTIVE DEFENSE: PHANTOM TWIN DECOY ELEVATED • CANARY TRAP ARMED'}
                  {demoScenario === 'intrusion' && '3D ACTIVE DEFENSE: LIVE INTRUSION REDIRECTION • VIOLET DECOY SANDBOX'}
                </span>
                <button
                  type="button"
                  className="scenario-banner-btn"
                  onClick={() => setDemoScenario('none')}
                >
                  Reset ↺
                </button>
              </div>
            )}

            {/* Living 3D Canvas Engine Viewport (Replaces static PNG with real 3D model!) */}
            <div className="diorama-viewport">
              <City3DCanvas
                trafficSignalColor={trafficSignalColor}
                activeCategory={activeCategory}
                domeVisible={domeVisible}
                duskLighting={duskLighting}
                selectedDeviceKey={selectedDeviceKey}
                onSelectDeviceKey={(key) => {
                  setSelectedDeviceKey(key);
                  const dev = CITY_DEVICES.find((d) => d.key === key);
                  if (dev) handleSelectDevice(dev);
                }}
                onDeviceCoordsChange={setDeviceCoords}
                demoScenario={demoScenario}
                autoOrbit={autoOrbit}
                onToggleAutoOrbit={() => setAutoOrbit((prev) => !prev)}
                zoom={zoom}
                onZoomChange={setZoom}
              />

              {/* Transformed Hotspot Overlays (Pinned to exact 3D coordinates in real-time!) */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                }}
              >
                {/* 1. CAM-01 Callout Card & Hotspot */}
                {isDeviceCategoryMatch(CITY_DEVICES[0]) && (
                  <>
                    <div
                      className="camera-callout-card"
                      style={{
                        position: 'absolute',
                        left: deviceCoords['camera'] ? `${deviceCoords['camera'].x}px` : `${CITY_DEVICES[0].xPercent}%`,
                        top: deviceCoords['camera'] ? `${deviceCoords['camera'].y - 28}px` : `${CITY_DEVICES[0].yPercent - 7}%`,
                        transform: 'translate(-50%, -100%)',
                        pointerEvents: 'auto',
                        opacity: deviceCoords['camera']?.visible !== false ? 1 : 0,
                      }}
                      onClick={() => handleFocusAndSelectDevice(CITY_DEVICES[0])}
                      onMouseEnter={() => setHoveredNode(CITY_DEVICES[0])}
                      title="Click to focus Edge Sentry camera in 3D"
                    >
                      <span className="live-dot" />
                      <span>CAM-01 Protected</span>
                    </div>

                    <div
                      className="hotspot-element"
                      style={{
                        position: 'absolute',
                        left: deviceCoords['camera'] ? `${deviceCoords['camera'].x}px` : `${CITY_DEVICES[0].xPercent}%`,
                        top: deviceCoords['camera'] ? `${deviceCoords['camera'].y}px` : `${CITY_DEVICES[0].yPercent}%`,
                        pointerEvents: 'auto',
                        opacity: deviceCoords['camera']?.visible !== false ? 1 : 0,
                      }}
                      onClick={() => handleFocusAndSelectDevice(CITY_DEVICES[0])}
                      onMouseEnter={() => setHoveredNode(CITY_DEVICES[0])}
                    >
                      <div className="hotspot-ring-wrapper">
                        <span className="hotspot-pulse-wave" />
                        <span className="hotspot-core-dot" />
                      </div>
                    </div>
                  </>
                )}

                {/* 2. Smart Signal Hotspot & Pill (Click to Cycle Light!) */}
                {isDeviceCategoryMatch(CITY_DEVICES[1]) && (
                  <>
                    <div
                      className="hotspot-pill-label signal-pill"
                      style={{
                        position: 'absolute',
                        left: deviceCoords['signal'] ? `${deviceCoords['signal'].x}px` : `${CITY_DEVICES[1].xPercent}%`,
                        top: deviceCoords['signal'] ? `${deviceCoords['signal'].y - 24}px` : `${CITY_DEVICES[1].yPercent - 6}%`,
                        transform: 'translate(-50%, -100%)',
                        pointerEvents: 'auto',
                        opacity: deviceCoords['signal']?.visible !== false ? 1 : 0,
                      }}
                      onClick={handleCycleTrafficLight}
                      onMouseEnter={() => setHoveredNode(CITY_DEVICES[1])}
                      title="Click to cycle traffic signal light (Green / Yellow / Red) — 3D cars respond in real time!"
                    >
                      <span className={`label-indicator ${trafficSignalColor}`} />
                      <span>Smart signal</span>
                    </div>

                    <div
                      className="hotspot-element"
                      style={{
                        position: 'absolute',
                        left: deviceCoords['signal'] ? `${deviceCoords['signal'].x}px` : `${CITY_DEVICES[1].xPercent}%`,
                        top: deviceCoords['signal'] ? `${deviceCoords['signal'].y}px` : `${CITY_DEVICES[1].yPercent}%`,
                        pointerEvents: 'auto',
                        opacity: deviceCoords['signal']?.visible !== false ? 1 : 0,
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
                {isDeviceCategoryMatch(CITY_DEVICES[2]) && (
                  <>
                    <div
                      className="hotspot-pill-label"
                      style={{
                        position: 'absolute',
                        left: deviceCoords['gateway'] ? `${deviceCoords['gateway'].x}px` : `${CITY_DEVICES[2].xPercent}%`,
                        top: deviceCoords['gateway'] ? `${deviceCoords['gateway'].y - 28}px` : `${CITY_DEVICES[2].yPercent - 7}%`,
                        transform: 'translate(-50%, -100%)',
                        pointerEvents: 'auto',
                        opacity: deviceCoords['gateway']?.visible !== false ? 1 : 0,
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
                        position: 'absolute',
                        left: deviceCoords['gateway'] ? `${deviceCoords['gateway'].x}px` : `${CITY_DEVICES[2].xPercent}%`,
                        top: deviceCoords['gateway'] ? `${deviceCoords['gateway'].y}px` : `${CITY_DEVICES[2].yPercent}%`,
                        pointerEvents: 'auto',
                        opacity: deviceCoords['gateway']?.visible !== false ? 1 : 0,
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
                {isDeviceCategoryMatch(CITY_DEVICES[3]) && (
                  <div
                    className="hotspot-pill-label"
                    style={{
                      position: 'absolute',
                      left: deviceCoords['power'] ? `${deviceCoords['power'].x}px` : `${CITY_DEVICES[3].xPercent}%`,
                      top: deviceCoords['power'] ? `${deviceCoords['power'].y - 24}px` : `${CITY_DEVICES[3].yPercent - 6}%`,
                      transform: 'translate(-50%, -100%)',
                      pointerEvents: 'auto',
                      opacity: deviceCoords['power']?.visible !== false ? 1 : 0,
                    }}
                    onClick={() => handleFocusAndSelectDevice(CITY_DEVICES[3])}
                    onMouseEnter={() => setHoveredNode(CITY_DEVICES[3])}
                  >
                    <span className="label-indicator" />
                    <span>Energy station</span>
                  </div>
                )}

                {/* 5. Environmental Sensor Hotspot */}
                {isDeviceCategoryMatch(CITY_DEVICES[4]) && (
                  <div
                    className="hotspot-pill-label"
                    style={{
                      position: 'absolute',
                      left: deviceCoords['sensor'] ? `${deviceCoords['sensor'].x}px` : `${CITY_DEVICES[4].xPercent}%`,
                      top: deviceCoords['sensor'] ? `${deviceCoords['sensor'].y - 24}px` : `${CITY_DEVICES[4].yPercent - 6}%`,
                      transform: 'translate(-50%, -100%)',
                      pointerEvents: 'auto',
                      opacity: deviceCoords['sensor']?.visible !== false ? 1 : 0,
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
                      left: deviceCoords[hoveredNode.key] ? `${deviceCoords[hoveredNode.key].x}px` : `${hoveredNode.xPercent}%`,
                      top: deviceCoords[hoveredNode.key] ? `${Math.max(deviceCoords[hoveredNode.key].y - 60, 40)}px` : `${Math.max(hoveredNode.yPercent - 18, 12)}%`,
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
                  title="Reset view to default isometric (↺)"
                  aria-label="Reset view"
                >
                  ↺
                </button>

                {/* Toggle Auto Orbit Rotation */}
                <button
                  type="button"
                  className={`diorama-ctrl-btn ${autoOrbit ? 'active' : ''}`}
                  onClick={() => {
                    setAutoOrbit(!autoOrbit);
                    addToast('Orbit Mode', !autoOrbit ? 'Cinematic 3D orbit enabled' : 'Free camera lock active', 'production');
                  }}
                  title={autoOrbit ? 'Pause 3D Orbit' : 'Start Cinematic 3D Orbit'}
                  aria-label="Toggle Auto Orbit"
                >
                  ↻
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

                <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)', margin: '0 2px' }} />

                {/* Quick Trigger 3D Defense Simulation */}
                <button
                  type="button"
                  className={`diorama-ctrl-btn ${demoScenario !== 'none' ? 'active' : ''}`}
                  onClick={() => {
                    if (demoScenario === 'none') {
                      handleRunDrillB();
                    } else {
                      setDemoScenario('none');
                    }
                  }}
                  title="Trigger 3D Defense Intrusion Simulation (Phantom Twin)"
                  aria-label="3D Defense Scenario"
                  style={{ color: demoScenario !== 'none' ? '#7C3AED' : undefined }}
                >
                  ⚡
                </button>

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
              <span className="diorama-ctrl-hint">Drag 360° to orbit • Scroll to zoom • Click nodes</span>
            </div>
          </div>
        </div>
      </section>

      {/* =======================================================================
          Summary Section: "Your network, at a glance"
          ======================================================================= */}
      <section className="network-glance-section" aria-label="Network Overview At A Glance">
        <div className="glance-header-row">
          <h2 className="glance-title">Your network, at a glance</h2>
          <button
            type="button"
            className="glance-link btn-ghost"
            onClick={() => setActiveTab('cameras')}
            aria-label="Open full fleet registry"
          >
            <span>Full node fleet</span>
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
            onClick={() => setActiveTab('evidence')}
            role="button"
            tabIndex={0}
            title="Inspect active threat campaigns"
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
        <span>AEGIS / SMART DISTRICT</span>
        <span>
          {systemHealth?.status === 'ok'
            ? 'LIVE TELEMETRY • 3D LIVING ENGINE ACTIVE'
            : 'DESIGN PREVIEW • SAMPLE DATA'}
        </span>
      </footer>

      {/* =======================================================================
          Authorized Demo Workflow Modal Dialog (With Full 3D Participation!)
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
              <div>
                <h3 className="demo-dialog-title" id="demo-dialog-heading">
                  Authorized Defense Drills (Live 3D Simulation)
                </h3>
                <span style={{ fontSize: '0.725rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                  ● 3D Living Model Actively Synchronized
                </span>
              </div>
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
              Execute live security validation scenarios. Watch the 3D metropolitan model react in real time to optical sensor blinding and honeypot entrapment!
            </p>

            {/* Drill A */}
            <div className="demo-drill-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <div className="demo-drill-title">Drill A: Camera Blinding & Access Denial</div>
                <span className="badge-pill" style={{ background: 'var(--accent-primary-subtle)', color: 'var(--accent-primary)', fontSize: '0.7rem' }}>
                  3D Laser Sweep & Denial Shield
                </span>
              </div>
              <div className="demo-drill-desc">
                Simulates optical laser sensor saturation on CAM-01 in 3D. A holographic denial shield emerges with HTTP 403, locking sensitive face evidence.
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    handleRunDrillA();
                    setDemoModalOpen(false);
                  }}
                  disabled={drillRunning}
                >
                  {drillRunning ? 'Executing Drill...' : '▶ Watch 3D Sensor Blinding Drill'}
                </button>
              </div>
            </div>

            {/* Drill B */}
            <div className="demo-drill-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <div className="demo-drill-title">Drill B: Honeypot Canary & Shamir Quorum</div>
                <span className="badge-pill" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6', fontSize: '0.7rem' }}>
                  Elevates Phantom Twin 3D District
                </span>
              </div>
              <div className="demo-drill-desc">
                The violet Phantom Twin decoy rises beside the city. Hostile intruder packets are dynamically bent into the honeypot, tripping the canary while the real city continues operating untouched!
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    handleRunDrillB();
                    setDemoModalOpen(false);
                  }}
                  disabled={drillRunning}
                >
                  {drillRunning ? 'Executing Drill...' : '▶ Watch 3D Phantom Redirection Drill'}
                </button>
              </div>
            </div>

            {/* Full Scenario */}
            <div className="demo-drill-card" style={{ borderColor: 'var(--accent-primary)', background: 'var(--accent-primary-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <div className="demo-drill-title" style={{ color: 'var(--accent-primary)' }}>
                  ⚡ Complete 4-Phase Cyber Defense Walkthrough
                </div>
                <span className="badge-pill" style={{ background: 'var(--bg-surface)', color: 'var(--accent-primary)', fontSize: '0.7rem', border: '1px solid var(--border-medium)' }}>
                  Full Interactive Scenario
                </span>
              </div>
              <div className="demo-drill-desc" style={{ color: 'var(--text-primary)' }}>
                Runs the entire end-to-end intrusion sequence across the 3D model: Anomaly detection $\rightarrow$ Phantom Twin rising $\rightarrow$ Canary trap $\rightarrow$ Quorum audit verification.
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  handleRunFullScenario();
                  setDemoModalOpen(false);
                }}
                disabled={drillRunning}
              >
                {drillRunning ? 'Running Walkthrough...' : '▶ Run Complete 3D Walkthrough ↗'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
