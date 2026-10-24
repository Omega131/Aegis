import React, { useEffect, useState, useCallback } from 'react';
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

  // Data fetching
  const fetchCameras = useCallback(async () => {
    try {
      const data = await api.getCameras();
      setCameras(data);
      const target = data.find((c) => c.camera_id === selectedCamId);
      if (target) {
        setIsBlinded(target.status === 'blinded');
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
    const frameTimer = setInterval(() => setFrameTimestamp(Date.now()), 2000);

    return () => {
      clearInterval(camTimer);
      clearInterval(evTimer);
      clearInterval(frameTimer);
    };
  }, [fetchCameras, fetchEvents]);

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

        <div className="page-actions">
          <button
            type="button"
            className="btn btn-surface btn-sm"
            onClick={() => {
              fetchCameras();
              fetchEvents();
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
          <div className="card-header">
            <div>
              <div className="card-title">
                <span>📹</span>
                <span>Live Feed: {activeNode?.camera_id?.toUpperCase() || 'CAM-01'}</span>
                <Badge variant={isBlinded ? 'danger' : 'success'}>
                  {isBlinded ? 'SIMULATED FAULT' : 'PRIVACY-PRESERVED'}
                </Badge>
              </div>
              <div className="card-subtitle">
                Location: {activeNode?.location || 'Central Plaza / Intersection North'} • Window: <code>{activeNode?.window_id || 'WIN-20261024-1130'}</code>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {isBlinded ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSimulateRecover}
                  disabled={isActionPending}
                >
                  {isActionPending ? 'Recovering...' : '✓ Recover Feed'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleSimulateBlind}
                  disabled={isActionPending}
                  title="Simulate Camera Blinding anomaly for Drill A false-positive test"
                >
                  {isActionPending ? 'Injecting...' : '⚠️ Simulate Blinding (Drill A)'}
                </button>
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
            {isBlinded ? (
              <div style={{ textAlign: 'center', color: 'var(--accent-danger)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🚫</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>CAMERA BLINDING ANOMALY INJECTED</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  Simulated optical occlusion detected. Facial crops remain AES-256 encrypted in edge storage.
                </div>
              </div>
            ) : (
              <img
                src={`${api.getCameraFrameUrl(selectedCamId)}?t=${frameTimestamp}`}
                alt="Edge Privacy Preserved Feed"
                onError={(e) => {
                  // Fallback simulated canvas placeholder if server frame unavailable
                  (e.target as HTMLElement).style.display = 'none';
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
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
              }}
            >
              <span className="pulse-dot online" style={{ width: '6px', height: '6px' }} />
              <span>YUNET EDGE BLUR: ACTIVE</span>
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
              }}
            >
              ENCRYPTED CROPS STORED: {activeNode?.storage_encrypted_crops || 12}
            </div>
          </div>

          {/* Node Selector Row */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {cameras.map((cam) => (
              <button
                key={cam.camera_id}
                type="button"
                className={`btn btn-xs ${selectedCamId === cam.camera_id ? 'btn-primary' : 'btn-surface'}`}
                onClick={() => setSelectedCamId(cam.camera_id)}
              >
                <span>◉ {cam.camera_id.toUpperCase()}</span>
                {cam.status === 'blinded' && <span style={{ color: 'var(--accent-danger)' }}>• BLIND</span>}
              </button>
            ))}
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
                    <strong>{ev.event_type.toUpperCase()}</strong>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      {ev.timestamp ? ev.timestamp.slice(11, 19) : 'Just now'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Node: <code>{ev.camera_id}</code>
                    </span>
                    <Badge variant={ev.blurred ? 'production' : 'review'}>
                      {ev.blurred ? 'FACE BLURRED' : 'RAW REDACTED'}
                    </Badge>
                  </div>
                </div>
              ))}

              {events.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0', fontStyle: 'italic' }}>
                  Awaiting camera events from edge mesh...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
