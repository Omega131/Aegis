import React from 'react';
import { useApp } from '../../context/AppContext';
import { Badge } from '../ui/Badge';
import { api } from '../../api/client';

export const DeviceInspectorDrawer: React.FC = () => {
  const {
    selectedDevice,
    setSelectedDevice,
    inspectorOpen,
    setInspectorOpen,
    navigateToOperationalDevice,
    addToast,
  } = useApp();

  if (!inspectorOpen || !selectedDevice) return null;

  const isCamera = selectedDevice.type === 'camera';
  const isGateway = selectedDevice.type === 'gateway';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setInspectorOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 1190,
          animation: 'fadeIn 180ms ease',
        }}
      />

      {/* Slide-out Drawer */}
      <aside className="inspector-drawer" id="device-inspector-drawer" aria-label="Device Inspector">
        <div className="drawer-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <Badge variant={isGateway ? 'deception' : 'production'}>
                {selectedDevice.type.toUpperCase()}
              </Badge>
              <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {selectedDevice.id}
              </span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{selectedDevice.name}</h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setInspectorOpen(false)}
            aria-label="Close Inspector"
            style={{ fontSize: '1.1rem' }}
          >
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {/* Metadata Card */}
          <div className="card card-elevated" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Operating District:</span>
              <strong style={{ fontSize: '0.8rem' }}>{selectedDevice.district || 'Metropolitan Core'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Subsystem Status:</span>
              <Badge variant="success">HEALTHY / PROTECTED</Badge>
            </div>
            {isCamera && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Live Edge Processing:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-production)' }}>24.0 FPS (YuNet)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Encrypted Face Crops:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-review)' }}>AES-256-GCM Vault</span>
                </div>
                <div style={{ marginTop: '0.75rem', position: 'relative', width: '100%', height: '140px', background: '#050811', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-production)' }}>
                  <img
                    src={api.getCameraFrameUrl('cam_01')}
                    alt="Live Camera Snapshot"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div style={{ position: 'absolute', bottom: '6px', left: '6px', background: 'rgba(8,13,27,0.85)', padding: '2px 6px', borderRadius: '2px', fontSize: '0.65rem', color: 'var(--accent-production)', fontFamily: 'var(--font-mono)' }}>
                    ● LIVE EDGE BLUR
                  </div>
                </div>
              </>
            )}
            {isGateway && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Phantom Twin Redirection:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-deception)' }}>Armed (Port 2222)</span>
              </div>
            )}
          </div>

          {/* Quick Action Navigation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Subsystem Actions
            </span>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setInspectorOpen(false);
                navigateToOperationalDevice(selectedDevice.id);
                addToast(
                  `Navigated to ${selectedDevice.name}`,
                  `Loaded operational controls for ${selectedDevice.id}`,
                  'production'
                );
              }}
            >
              {isCamera ? 'Open Camera Mesh Sentry ↗' : isGateway ? 'Open Decoy Honeytrap Terminal ↗' : 'Inspect Operational Feed ↗'}
            </button>

            <button
              type="button"
              className="btn btn-surface"
              onClick={() => {
                addToast(
                  'Diagnostic Ping Sent',
                  `Received 0.4ms latency ack from node ${selectedDevice.id}`,
                  'success'
                );
              }}
            >
              📡 Ping Node Telemetry
            </button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setSelectedDevice(null);
                setInspectorOpen(false);
              }}
            >
              Deselect Node
            </button>
          </div>

          {/* Informational Guidance */}
          <div
            style={{
              padding: '0.85rem',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <strong>Epistemic Protection Guarantee:</strong> Edge cameras blur all detected human faces at source. Raw facial crops are encrypted with session-scoped keys and only reconstructable via judicial 2-of-3 Shamir quorum verification.
          </div>
        </div>
      </aside>
    </>
  );
};
