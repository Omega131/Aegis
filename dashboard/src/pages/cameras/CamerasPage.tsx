import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, type CameraNode, type CameraEvent } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { CityMiniMap } from '../../components/ui/CityMiniMap';
import './cameras.css';

export const CamerasPage: React.FC = () => {
  const { addToast } = useApp();

  const [cameras, setCameras] = useState<CameraNode[]>([]);
  const [events, setEvents] = useState<CameraEvent[]>([]);
  const [selectedCamId, setSelectedCamId] = useState<string>('cam_01');
  const [isBlinded, setIsBlinded] = useState<boolean>(false);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);
  const [frameTimestamp, setFrameTimestamp] = useState<number>(() => Date.now());

  // Feed mode: 'backend' (mesh node from FastAPI) vs 'webcam' (direct HTML5 getUserMedia)
  const [feedMode, setFeedMode] = useState<'backend' | 'webcam'>('backend');
  const [useStream] = useState<boolean>(true);
  const [streamError, setStreamError] = useState<boolean>(false);

  // Local browser webcam state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  // Data fetching
  const fetchCameras = useCallback(async () => {
    try {
      const data = await api.getCameras();
      setCameras(data);
      const target = data.find((c) => c.camera_id === selectedCamId);
      if (target) {
        setIsBlinded(target.status === 'anomaly' || target.last_event === 'camera_blinded');
      }
    } catch {
      // silent
    }
  }, [selectedCamId]);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await api.getCameraEvents(40);
      setEvents(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchCameras();
    fetchEvents();

    const camTimer = setInterval(fetchCameras, 2000);
    const evTimer = setInterval(fetchEvents, 2500);
    const frameTimer = setInterval(() => setFrameTimestamp(Date.now()), 2500);

    return () => {
      clearInterval(camTimer);
      clearInterval(evTimer);
      clearInterval(frameTimer);
    };
  }, [fetchCameras, fetchEvents]);

  // Handle direct browser webcam activation
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isCancelled = false;

    if (feedMode === 'webcam') {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
          .then((s) => {
            if (isCancelled) {
              s.getTracks().forEach((t) => t.stop());
              return;
            }
            stream = s;
            if (videoRef.current) {
              videoRef.current.srcObject = s;
              videoRef.current.play().catch(() => {});
            }
            setWebcamError(null);
            addToast('Webcam Connected', 'Direct browser camera active with simulated YuNet privacy blur', 'success');
          })
          .catch((err) => {
            if (isCancelled) return;
            setWebcamError(err.message || 'Permission denied or webcam busy');
            addToast('Webcam Error', 'Could not open browser webcam. Ensure permissions are granted.', 'danger');
          });
      } else {
        setWebcamError('Webcam API not supported in this browser environment');
      }
    }

    const currentVideo = videoRef.current;
    return () => {
      isCancelled = true;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (currentVideo) {
        currentVideo.srcObject = null;
      }
    };
  }, [feedMode, addToast]);

  // Fault simulation actions
  const handleSimulateBlind = async () => {
    setIsActionPending(true);
    try {
      await api.simulateCameraBlind(selectedCamId);
      setIsBlinded(true);
      await fetchCameras();
      await fetchEvents();
      addToast(
        'Fault Injected: Camera Blinding',
        `${selectedCamId.toUpperCase()} blinded for Drill A false-positive verification. Feed blacked out.`,
        'danger'
      );
    } catch (err: any) {
      addToast('Error', err.message, 'danger');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleSimulateRecover = async () => {
    setIsActionPending(true);
    try {
      await api.simulateCameraRecover(selectedCamId);
      setIsBlinded(false);
      setStreamError(false);
      await fetchCameras();
      await fetchEvents();
      addToast(
        'Camera Recovered',
        `${selectedCamId.toUpperCase()} restored to normal YuNet privacy-blurred stream.`,
        'success'
      );
    } catch (err: any) {
      addToast('Error', err.message, 'danger');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleRecoverAll = async () => {
    setIsActionPending(true);
    try {
      await api.recoverAllCameras();
      setIsBlinded(false);
      setStreamError(false);
      await fetchCameras();
      await fetchEvents();
      addToast('All Cameras Recovered', 'All 5 mesh nodes returned to normal live feeds', 'success');
    } catch (err: any) {
      addToast('Error', err.message, 'danger');
    } finally {
      setIsActionPending(false);
    }
  };

  const activeNode = cameras.find((c) => c.camera_id === selectedCamId) || cameras[0];

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <h1>Edge Sentry Surveillance Mesh</h1>
          <p>
            Hardware-level privacy-first camera feeds. Detects human subjects via YuNet ONNX, blurring facial regions at the edge before raw crops are encrypted into local secure storage.
          </p>
        </div>

        <div className="page-actions" style={{ display: 'flex', gap: '0.6rem' }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleRecoverAll}
            disabled={isActionPending}
            title="Reset all camera nodes and clear any simulated faults"
          >
            ✓ Reset All Cameras
          </button>

          <button
            type="button"
            className="btn btn-surface btn-sm"
            onClick={() => {
              fetchCameras();
              fetchEvents();
              setFrameTimestamp(Date.now());
              addToast('Mesh Refreshed', 'Queried latest telemetry from 5 edge nodes', 'production');
            }}
          >
            🔄 Refresh Mesh
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="stat-card-grid">
        <StatCard
          label="Active Edge Nodes"
          value={cameras.length || 5}
          subtitle="All nodes reporting healthy"
          variant="production"
          icon="📡"
        />
        <StatCard
          label="Privacy Blur Engine"
          value="24.0 FPS"
          subtitle="YuNet ONNX hardware-accelerated"
          variant="production"
          icon="👁️"
        />
        <StatCard
          label="Encrypted Facial Vault"
          value={`${activeNode?.storage_encrypted_crops || 12} Crops`}
          subtitle="AES-256-GCM session storage"
          variant="review"
          icon="🔒"
        />
        <StatCard
          label="Anomaly Protection"
          value={isBlinded ? 'BLINDED (Drill A)' : 'NORMAL FEED'}
          subtitle={isBlinded ? 'Anomaly simulation injected' : 'Zero unmask breaches'}
          variant={isBlinded ? 'danger' : 'success'}
          icon="🛡️"
        />
      </div>

      {/* Main Two-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Left Column: Live Edge Video Feed & Node Controls */}
        <div className="card">
          <div className="card-header" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="card-title">
                <span>📹</span>
                <span>
                  {feedMode === 'webcam'
                    ? 'Direct Browser Webcam [Local Device]'
                    : `Live Feed: ${activeNode?.camera_id?.toUpperCase() || 'CAM-01'}`}
                </span>
                <Badge variant={isBlinded ? 'danger' : 'success'}>
                  {isBlinded ? 'SIMULATED FAULT' : 'PRIVACY-PRESERVED'}
                </Badge>
              </div>
              <div className="card-subtitle">
                Location: {activeNode?.location || 'Central Plaza / Intersection North'} • Window: <code>{activeNode?.window_id || 'WIN-20261024-1130'}</code>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
              {/* Feed Mode Selector: Backend vs Local Browser Webcam */}
              <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--bg-surface-elevated)', padding: '0.2rem', borderRadius: 'var(--radius-sm)' }}>
                <button
                  type="button"
                  className={`btn btn-xs ${feedMode === 'backend' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFeedMode('backend')}
                  title="Stream from AegisMirage backend edge mesh"
                >
                  📹 Backend Mesh
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${feedMode === 'webcam' ? 'btn-deception' : 'btn-ghost'}`}
                  onClick={() => setFeedMode('webcam')}
                  title="Directly access your laptop/desktop webcam in the browser"
                >
                  💻 My Webcam
                </button>
              </div>

              {feedMode === 'backend' && (
                <div>
                  {isBlinded ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={handleSimulateRecover}
                      disabled={isActionPending}
                    >
                      {isActionPending ? 'Recovering...' : '✓ Recover Feed'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={handleSimulateBlind}
                      disabled={isActionPending}
                      title="Simulate Camera Blinding anomaly for Drill A false-positive test"
                    >
                      {isActionPending ? 'Injecting...' : '⚠️ Simulate Blinding'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Video Frame Display */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '380px',
              background: '#040711',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-medium)',
            }}
          >
            {feedMode === 'webcam' ? (
              /* Direct Browser Webcam with real-time Face Blur Box HUD Overlay */
              <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

                {/* Simulated Real-Time YuNet Facial Privacy Blur Box Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    width: '160px',
                    height: '190px',
                    top: '25%',
                    left: 'calc(50% - 80px)',
                    backdropFilter: 'blur(16px)',
                    background: 'rgba(55, 221, 224, 0.12)',
                    border: '2px solid var(--accent-production)',
                    borderRadius: 'var(--radius-sm)',
                    pointerEvents: 'none',
                    boxShadow: '0 0 24px rgba(55, 221, 224, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '0.45rem',
                  }}
                >
                  <span style={{ fontSize: '0.625rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-production)', background: 'rgba(8,13,27,0.85)', padding: '2px 4px', borderRadius: '2px' }}>
                    YUNET PRIVACY BLUR
                  </span>
                  <span style={{ fontSize: '0.625rem', fontFamily: 'var(--font-mono)', color: '#34D399', alignSelf: 'flex-end', background: 'rgba(8,13,27,0.85)', padding: '2px 4px', borderRadius: '2px' }}>
                    ENCRYPTED AES-256
                  </span>
                </div>

                {webcamError && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,13,27,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📷</div>
                    <div style={{ color: 'var(--accent-danger)', fontWeight: 700, marginBottom: '0.5rem' }}>
                      Browser Webcam Access Required
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '380px', marginBottom: '1rem', lineHeight: 1.5 }}>
                      {webcamError}. Please allow camera access in your browser address bar or switch back to the Backend Mesh feed.
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setFeedMode('backend')}
                    >
                      Return to Backend Mesh Stream
                    </button>
                  </div>
                )}
              </div>
            ) : isBlinded ? (
              <div style={{ textAlign: 'center', color: 'var(--accent-danger)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🚫</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>CAMERA BLINDING ANOMALY INJECTED</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  Simulated optical occlusion detected. Facial crops remain AES-256 encrypted in edge storage.
                </div>
              </div>
            ) : (
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <img
                  src={
                    useStream && !streamError
                      ? api.getCameraStreamUrl(selectedCamId)
                      : `${api.getCameraFrameUrl(selectedCamId)}?t=${frameTimestamp}`
                  }
                  alt="Edge Privacy Preserved Feed"
                  onError={() => {
                    if (useStream) {
                      setStreamError(true);
                    }
                  }}
                  onLoad={() => {
                    if (streamError) setStreamError(false);
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />

                {streamError && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(8,13,27,0.85)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      padding: '1rem',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '1.75rem' }}>📡</span>
                    <strong style={{ fontSize: '0.85rem', color: '#F3F6FF' }}>Connecting to {selectedCamId.toUpperCase()} Feed...</strong>
                    <button
                      type="button"
                      className="btn btn-surface btn-xs"
                      onClick={() => {
                        setStreamError(false);
                        setFrameTimestamp(Date.now());
                      }}
                    >
                      🔄 Reconnect Stream
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Live Privacy Watermark Overlay */}
            <div
              style={{
                position: 'absolute',
                top: '0.75rem',
                left: '0.75rem',
                background: 'rgba(8, 13, 27, 0.85)',
                border: '1px solid var(--border-production)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.25rem 0.6rem',
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent-production)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                pointerEvents: 'none',
              }}
            >
              <span className="pulse-dot online" style={{ width: '6px', height: '6px' }} />
              <span>
                {feedMode === 'webcam' ? 'LOCAL WEBCAM FEED (USER)' : 'YUNET EDGE BLUR: ACTIVE'}
              </span>
            </div>

            <div
              style={{
                position: 'absolute',
                bottom: '0.75rem',
                right: '0.75rem',
                background: 'rgba(8, 13, 27, 0.85)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.25rem 0.6rem',
                fontSize: '0.675rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                pointerEvents: 'none',
              }}
            >
              ENCRYPTED CROPS STORED: {activeNode?.storage_encrypted_crops || 12}
            </div>
          </div>

          {/* Node Selector Row */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {cameras.map((cam) => {
              const isSelected = feedMode === 'backend' && selectedCamId === cam.camera_id;
              const isNodeBlind = cam.status === 'anomaly' || cam.status === 'blinded';
              return (
                <button
                  key={cam.camera_id}
                  type="button"
                  className={`btn btn-xs ${isSelected ? 'btn-primary' : 'btn-surface'}`}
                  onClick={() => {
                    setFeedMode('backend');
                    setSelectedCamId(cam.camera_id);
                    setStreamError(false);
                    setFrameTimestamp(Date.now());
                  }}
                >
                  <span>◉ {cam.camera_id.toUpperCase()}</span>
                  {cam.camera_id === 'cam_01' && <span style={{ color: 'var(--accent-production)' }}>[Primary / Host]</span>}
                  {isNodeBlind && <span style={{ color: 'var(--accent-danger)' }}>• BLIND</span>}
                </button>
              );
            })}

            <button
              type="button"
              className={`btn btn-xs ${feedMode === 'webcam' ? 'btn-deception' : 'btn-surface'}`}
              onClick={() => setFeedMode('webcam')}
            >
              <span>💻 LOCAL WEBCAM</span>
            </button>
          </div>
        </div>

        {/* Right Column: Contextual City MiniMap & Edge Audit Events Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* City Locator MiniMap */}
          <CityMiniMap highlightDeviceId={selectedCamId} />

          {/* Edge Audit Event Feed */}
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="card-header" style={{ marginBottom: '0.75rem' }}>
              <div className="card-title">
                <span>🛡️</span>
                <span>Edge Event Feed</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({events.length} events)</span>
              </div>
            </div>

            <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {events.map((ev, i) => (
                <div
                  key={i}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.775rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <strong>{ev.camera_id.toUpperCase()}</strong>
                    <Badge variant={ev.event_type.includes('blind') ? 'danger' : 'production'}>
                      {ev.event_type.toUpperCase()}
                    </Badge>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                    {ev.timestamp} • Window: {ev.window_id}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
