import React from 'react';
import { useApp } from '../../context/AppContext';

export const AppNavbar: React.FC = () => {
  const { activeTab, setActiveTab, systemHealth } = useApp();

  const isOnline = systemHealth?.status === 'ok';

  return (
    <header className="app-navbar" id="app-navbar">
      <button
        type="button"
        className="navbar-brand-wrap"
        onClick={() => setActiveTab('city')}
        aria-label="AegisMirage Home"
      >
        <div className="brand-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        </div>
        <div className="brand-meta">
          <span className="brand-name">AegisMirage</span>
          <span className="brand-tagline">Living Defense Observatory</span>
        </div>
      </button>

      <nav className="navbar-nav" aria-label="Main Navigation">
        <button
          type="button"
          id="nav-city"
          className={`nav-tab-btn tab-city ${activeTab === 'city' ? 'active' : ''}`}
          onClick={() => setActiveTab('city')}
        >
          <span>🏙️</span>
          <span>Living City</span>
        </button>

        <button
          type="button"
          id="nav-cameras"
          className={`nav-tab-btn ${activeTab === 'cameras' ? 'active' : ''}`}
          onClick={() => setActiveTab('cameras')}
        >
          <span>📷</span>
          <span>Edge Sentry</span>
          {systemHealth?.stats?.cameras_count ? (
            <span className="nav-badge-pill">{systemHealth.stats.cameras_count}</span>
          ) : null}
        </button>

        <button
          type="button"
          id="nav-decoy"
          className={`nav-tab-btn tab-decoy ${activeTab === 'decoy' ? 'active' : ''}`}
          onClick={() => setActiveTab('decoy')}
        >
          <span>🪤</span>
          <span>Phantom Twin</span>
          {systemHealth?.stats?.decoy_sessions_count ? (
            <span className="nav-badge-pill" style={{ color: 'var(--accent-deception)' }}>
              {systemHealth.stats.decoy_sessions_count}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          id="nav-evidence"
          className={`nav-tab-btn ${activeTab === 'evidence' ? 'active' : ''}`}
          onClick={() => setActiveTab('evidence')}
        >
          <span>🛡️</span>
          <span>Threat Intel</span>
          {systemHealth?.stats?.campaigns_count ? (
            <span className="nav-badge-pill">{systemHealth.stats.campaigns_count}</span>
          ) : null}
        </button>

        <button
          type="button"
          id="nav-escrow"
          className={`nav-tab-btn ${activeTab === 'escrow' ? 'active' : ''}`}
          onClick={() => setActiveTab('escrow')}
        >
          <span>⚖️</span>
          <span>Escrow Quorum</span>
          {systemHealth?.stats?.escrow_cases_count ? (
            <span className="nav-badge-pill" style={{ color: 'var(--accent-review)' }}>
              {systemHealth.stats.escrow_cases_count}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          id="nav-audit"
          className={`nav-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <span>⛓️</span>
          <span>Audit Ledger</span>
          {systemHealth?.stats?.audit_blocks_count ? (
            <span className="nav-badge-pill">{systemHealth.stats.audit_blocks_count}</span>
          ) : null}
        </button>

        <button
          type="button"
          id="nav-settings"
          className={`nav-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <span>⚙️</span>
          <span>System</span>
        </button>
      </nav>

      <div className="navbar-actions">
        <div className="telemetry-pill" title="Unified FastAPI backend connection status">
          <span className={`pulse-dot ${isOnline ? 'online' : systemHealth ? 'offline' : 'checking'}`} />
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {isOnline ? 'ONLINE' : 'CONNECTING...'}
          </span>
        </div>
      </div>
    </header>
  );
};
