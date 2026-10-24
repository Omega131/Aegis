import React from 'react';
import { AppNavbar } from './AppNavbar';
import { AppContextBar } from './AppContextBar';
import { DeviceInspectorDrawer } from './DeviceInspectorDrawer';
import { ToastContainer } from '../ui/ToastContainer';
import { useApp } from '../../context/AppContext';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { systemHealth, activeTab, selectedDevice } = useApp();

  const showContextBar = activeTab !== 'city' || selectedDevice !== null;

  return (
    <div className="app-shell" id="app-shell">
      {/* Top Universal Navbar */}
      <AppNavbar />

      {/* Breadcrumb & Selected Device Context Bar (Hidden on City Overview unless node selected) */}
      {showContextBar && <AppContextBar />}

      {/* Main Operational & City View Content */}
      <main className="main-content" id="main-content">
        {children}
      </main>

      {/* Global Slide-out Device & Node Inspector Drawer */}
      <DeviceInspectorDrawer />

      {/* Universal Floating Toast Alerts */}
      <ToastContainer />

      {/* Universal Bottom Footer on Operational Views */}
      {activeTab !== 'city' && (
        <footer className="shell-footer" id="shell-footer">
          <div className="footer-left">
            <span>Aeigs — Living Defense Observatory</span>
            <span className="footer-dot" />
            <span>ChronoForge Hackathon</span>
            <span className="footer-dot" />
            <span>Single-Process Flat Architecture</span>
          </div>
          <div className="footer-right">
            <span>FastAPI + SQLite: <code>aegismirage.db</code></span>
            <span className="footer-dot" />
            <span style={{ color: systemHealth ? 'var(--accent-success)' : 'var(--accent-review)' }}>
              ● System: {systemHealth?.status === 'ok' ? 'All 5 Modules Synchronized' : 'Connecting...'}
            </span>
          </div>
        </footer>
      )}
    </div>
  );
};
