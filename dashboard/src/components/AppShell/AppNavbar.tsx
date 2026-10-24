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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M12 7c-2 2-2 5 0 7" />
            <path d="M12 14c2-2 2-5 0-7" />
            <path d="M12 14v4" />
          </svg>
        </div>
        <span className="brand-name">AegisMirage</span>
      </button>

      <nav className="navbar-nav" aria-label="Main Navigation">
        <button
          type="button"
          id="nav-city"
          className={`nav-tab-btn ${activeTab === 'city' ? 'active' : ''}`}
          onClick={() => setActiveTab('city')}
        >
          <span>Overview</span>
        </button>

        <button
          type="button"
          id="nav-cameras"
          className={`nav-tab-btn ${activeTab === 'cameras' ? 'active' : ''}`}
          onClick={() => setActiveTab('cameras')}
        >
          <span>Edge Sentry</span>
        </button>

        <button
          type="button"
          id="nav-decoy"
          className={`nav-tab-btn ${activeTab === 'decoy' ? 'active' : ''}`}
          onClick={() => setActiveTab('decoy')}
        >
          <span>Phantom Twin</span>
        </button>

        <button
          type="button"
          id="nav-evidence"
          className={`nav-tab-btn ${activeTab === 'evidence' ? 'active' : ''}`}
          onClick={() => setActiveTab('evidence')}
        >
          <span>Threat Intel</span>
        </button>

        <button
          type="button"
          id="nav-escrow"
          className={`nav-tab-btn ${activeTab === 'escrow' ? 'active' : ''}`}
          onClick={() => setActiveTab('escrow')}
        >
          <span>Escrow</span>
        </button>

        <button
          type="button"
          id="nav-audit"
          className={`nav-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <span>Audit</span>
        </button>
      </nav>

      <div className="navbar-actions">
        <div className="demo-env-indicator" title={isOnline ? "Unified FastAPI Backend Connected" : "Connecting to backend..."}>
          <span className={`pulse-dot ${isOnline ? 'online' : 'checking'}`} />
          <span className="demo-env-label">Demo environment</span>
        </div>
      </div>
    </header>
  );
};

