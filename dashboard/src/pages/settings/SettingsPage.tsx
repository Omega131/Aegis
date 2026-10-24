import React, { useState } from 'react';
import { api } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { CityMiniMap } from '../../components/ui/CityMiniMap';

export const SettingsPage: React.FC = () => {
  const { motionReduced, setMotionReduced, addToast } = useApp();
  const [isResetting, setIsResetting] = useState<boolean>(false);

  const handleResetIntel = async () => {
    setIsResetting(true);
    try {
      await api.resetIntel();
      addToast('Intel Engine Reset', 'Campaign clusters and sessions returned to clean baseline', 'production');
    } catch (err: any) {
      addToast('Reset Error', err.message, 'danger');
    } finally {
      setIsResetting(false);
    }
  };

  const handleResetEscrow = async () => {
    setIsResetting(true);
    try {
      await api.resetEscrow();
      addToast('Escrow Reset', 'Escrow cases, custodian votes, and audit log reset to seed state', 'review');
    } catch (err: any) {
      addToast('Reset Error', err.message, 'danger');
    } finally {
      setIsResetting(false);
    }
  };

  const handleResetGateway = async () => {
    setIsResetting(true);
    try {
      await fetch('http://localhost:8000/api/gateway/reset', { method: 'POST' });
      addToast('Gateway Reset', 'Perimeter routing decisions and tracking table cleared', 'deception');
    } catch (err: any) {
      addToast('Reset Error', err.message, 'danger');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <h1>System Diagnostics & Runtime Configuration</h1>
          <p>
            Central architecture telemetry, active port bindings, accessibility preferences, and hackathon demonstration reset controls.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="stat-card-grid">
        <StatCard
          label="Single Process Architecture"
          value="Python 3.14"
          subtitle="Zero microservices / Flat composition"
          variant="production"
          icon="⚡"
        />
        <StatCard
          label="Local Storage Engine"
          value="SQLite3"
          subtitle="aegismirage.db (Persisted locally)"
          variant="production"
          icon="💾"
        />
        <StatCard
          label="AsyncSSH Honeypot"
          value="Port 2222"
          subtitle="Loopback / Unprivileged runtime"
          variant="deception"
          icon="🪤"
        />
        <StatCard
          label="Frontend Shell"
          value="Vite 8 + React"
          subtitle="Port 5173 / Production /app/ mount"
          variant="success"
          icon="🎨"
        />
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem' }}>
        {/* Left Column: Module Connectivity & Reset Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Module Connectivity */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <span>🔌</span>
                <span>In-Process Module Synchronizer</span>
              </div>
              <Badge variant="success">ALL 5 MODULES ONLINE</Badge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                <span><strong>edge.py</strong> (Camera Mesh & Privacy Face Blur)</span>
                <Badge variant="production">ONLINE (24.0 FPS)</Badge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                <span><strong>decoy.py</strong> (SSH + Web Honeypot & Honeytokens)</span>
                <Badge variant="deception">ONLINE (PORT 2222)</Badge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                <span><strong>gateway.py</strong> (Dynamic Routing Engine & Scoring)</span>
                <Badge variant="production">ONLINE (STICKY ACTIVE)</Badge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                <span><strong>intel.py</strong> (Campaign Clustering & MITRE Graph)</span>
                <Badge variant="production">ONLINE (STIX 2.1)</Badge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                <span><strong>escrow.py</strong> (2-of-3 Shamir Quorum & Hash Chain)</span>
                <Badge variant="review">ONLINE (TAMPER-EVIDENT)</Badge>
              </div>
            </div>
          </div>

          {/* Demonstration Reset Controls */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: '0.5rem' }}>
              <span>↺</span>
              <span>Demonstration State Resets</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.775rem', marginBottom: '1rem' }}>
              Reset backend modules between hackathon live drill presentations to clean initial baseline state.
            </p>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-surface btn-sm"
                onClick={handleResetIntel}
                disabled={isResetting}
              >
                Reset Threat Intel Engine
              </button>

              <button
                type="button"
                className="btn btn-surface btn-sm"
                onClick={handleResetEscrow}
                disabled={isResetting}
              >
                Reset Escrow & Quorum
              </button>

              <button
                type="button"
                className="btn btn-surface btn-sm"
                onClick={handleResetGateway}
                disabled={isResetting}
              >
                Reset Gateway Router
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Accessibility & MiniMap */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <CityMiniMap />

          <div className="card">
            <div className="card-title" style={{ marginBottom: '0.75rem' }}>
              <span>🎨</span>
              <span>Accessibility & Motion</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>Motion Reduction Mode</strong>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.725rem' }}>
                    Disables continuous auto-orbit and vehicle physics on lower-spec GPUs.
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn btn-xs ${motionReduced ? 'btn-primary' : 'btn-surface'}`}
                  onClick={() => {
                    setMotionReduced(!motionReduced);
                    addToast(
                      'Preference Updated',
                      motionReduced ? 'Motion animations restored' : 'Motion animations reduced',
                      'production'
                    );
                  }}
                >
                  {motionReduced ? 'ON (Reduced)' : 'OFF (Vibrant)'}
                </button>
              </div>

              <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                Hardware acceleration: WebGL / HTML5 Canvas 2D isometric math. Zero third-party cloud analytics or external trackers.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
