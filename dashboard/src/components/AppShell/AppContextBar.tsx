import React from 'react';
import { API_BASE } from '../../api/client';
import { useApp, type NavRoute } from '../../context/AppContext';

const ROUTE_LABELS: Record<NavRoute, { title: string; icon: string }> = {
  city: { title: 'Living City Observatory', icon: '🏙️' },
  cameras: { title: 'Edge Sentry Camera Mesh', icon: '📷' },
  decoy: { title: 'Phantom Twin & Perimeter Gateway', icon: '🪤' },
  evidence: { title: 'Campaign Intelligence & Evidence', icon: '🛡️' },
  campaigns: { title: 'Campaign Intelligence & Evidence', icon: '🛡️' },
  hacker: { title: 'Offensive Red Team Terminal (Hacker POV)', icon: '🔴' },
  settings: { title: 'System Diagnostics & Runtime', icon: '⚙️' },
};

export const AppContextBar: React.FC = () => {
  const {
    activeTab,
    selectedDevice,
    setSelectedDevice,
    selectedSessionId,
    setSelectedSessionId,
    selectedCaseId,
    setSelectedCaseId,
    motionReduced,
    setMotionReduced,
    setInspectorOpen,
  } = useApp();

  const currentRoute = ROUTE_LABELS[activeTab] || { title: 'Observatory', icon: '🏙️' };

  return (
    <div className="app-context-bar" id="app-context-bar">
      <div className="context-bar-left">
        <div className="breadcrumbs">
          <span>Aegis</span>
          <span>/</span>
          <span className="breadcrumb-curr">
            <span style={{ marginRight: '0.35rem' }}>{currentRoute.icon}</span>
            {currentRoute.title}
          </span>
        </div>

        {/* Selected Device Context Indicator */}
        {selectedDevice && (
          <div className="context-pill" title="Currently selected IoT node context">
            <span>◉</span>
            <strong>{selectedDevice.id}</strong> ({selectedDevice.name})
            <button
              type="button"
              onClick={() => setInspectorOpen(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-production)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                textDecoration: 'underline',
                marginLeft: '0.2rem',
              }}
            >
              Inspect
            </button>
            <button
              type="button"
              onClick={() => setSelectedDevice(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
              title="Clear selection"
            >
              ✕
            </button>
          </div>
        )}

        {/* Selected Decoy Session Indicator */}
        {selectedSessionId && (
          <div className="context-pill context-pill-deception" title="Active honeypot session context">
            <span>🪤</span>
            <span>Session: <code>{selectedSessionId}</code></span>
            <button
              type="button"
              onClick={() => setSelectedSessionId(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Selected Escrow Case Indicator */}
        {selectedCaseId && (
          <div className="context-pill context-pill-danger" title="Active break-glass case context">
            <span>⚖️</span>
            <span>Case: <code>{selectedCaseId}</code></span>
            <button
              type="button"
              onClick={() => setSelectedCaseId(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <button
          type="button"
          onClick={() => setMotionReduced(!motionReduced)}
          className="btn btn-ghost btn-xs"
          style={{ fontSize: '0.7rem', color: motionReduced ? 'var(--accent-review)' : 'var(--text-secondary)' }}
          title="Toggle reduced motion for low-spec devices or accessibility"
        >
          {motionReduced ? '⚡ Motion: Reduced' : '✨ Motion: Vibrant'}
        </button>

        <span
          style={{
            fontSize: '0.675rem',
            fontFamily: 'var(--font-mono)',
            padding: '0.15rem 0.5rem',
            borderRadius: 'var(--radius-xs)',
            background: 'rgba(55, 221, 224, 0.08)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--accent-production)',
          }}
        >
          BACKEND: {API_BASE.replace(/^https?:\/\//, '')}
        </span>
      </div>
    </div>
  );
};
