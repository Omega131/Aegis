import React from 'react';
import { useApp } from '../../context/AppContext';

export const AppNavbar: React.FC = () => {
  const { activeTab, setActiveTab, systemHealth, theme, toggleTheme } = useApp();

  const isOnline = systemHealth?.status === 'ok';

  return (
    <header className="app-navbar" id="app-navbar">
      <button
        type="button"
        className="navbar-brand-wrap"
        onClick={() => setActiveTab('city')}
        aria-label="Aegis Home"
      >
        <img
          src="/assets/aegis_shield.png"
          alt="Aegis Emblem"
          className="brand-logo-img"
        />
        <span className="brand-name">Aegis</span>
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
          id="nav-hacker"
          className={`nav-tab-btn nav-item-hacker ${activeTab === 'hacker' ? 'active' : ''}`}
          onClick={() => setActiveTab('hacker')}
          title="Offensive Red Team Perspective & Exploit Simulation Console"
        >
          <span className="hacker-dot" aria-hidden="true" />
          <span>Hacker POV</span>
          <span className="nav-pill-red">Red Team</span>
        </button>
      </nav>

      <div className="navbar-actions">
        {/* Dark / Light Mode Toggle Button */}
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          aria-label="Toggle theme mode"
          id="theme-mode-toggle-btn"
        >
          <span className="theme-toggle-icon" aria-hidden="true">
            {theme === 'light' ? '🌙' : '☀️'}
          </span>
          <span className="theme-toggle-label">
            {theme === 'light' ? 'Dark' : 'Light'}
          </span>
        </button>

        <div className="demo-env-indicator" title={isOnline ? "Unified FastAPI Backend Connected" : "Connecting to backend..."}>
          <span className={`pulse-dot ${isOnline ? 'online' : 'checking'}`} />
          <span className="demo-env-label">Demo environment</span>
        </div>
      </div>
    </header>
  );
};

