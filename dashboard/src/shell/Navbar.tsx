import React, { useEffect, useState } from 'react'

export type NavTab = 'cameras' | 'decoy' | 'campaigns'

interface NavbarProps {
  activeTab: NavTab
  onSelectTab: (tab: NavTab) => void
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab }) => {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('http://localhost:8000/health', { signal: AbortSignal.timeout(2000) })
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'ok') {
            setBackendStatus('online')
            return
          }
        }
        setBackendStatus('offline')
      } catch {
        setBackendStatus('offline')
      }
    }

    checkHealth()
    const timer = setInterval(checkHealth, 5000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="navbar" id="app-navbar">
      <div className="navbar-left">
        <div className="brand-logo" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        </div>
        <div className="brand-info">
          <span className="brand-name">AegisMirage</span>
          <span className="scaffold-tag">Phase 1</span>
        </div>
      </div>

      <nav className="navbar-nav" aria-label="Main Navigation">
        <button
          type="button"
          id="nav-cameras"
          className={`nav-item ${activeTab === 'cameras' ? 'active' : ''}`}
          onClick={() => onSelectTab('cameras')}
        >
          <span className="nav-label">Cameras</span>
        </button>

        <button
          type="button"
          id="nav-decoy"
          className={`nav-item ${activeTab === 'decoy' ? 'active' : ''}`}
          onClick={() => onSelectTab('decoy')}
        >
          <span className="nav-label">Decoy Activity</span>
        </button>

        <button
          type="button"
          id="nav-campaigns"
          className={`nav-item ${activeTab === 'campaigns' ? 'active' : ''}`}
          onClick={() => onSelectTab('campaigns')}
        >
          <span className="nav-label">Campaigns</span>
        </button>
      </nav>

      <div className="navbar-right">
        <div className={`status-badge status-${backendStatus}`} id="backend-status-badge">
          <span className="status-indicator-dot"></span>
          <span className="status-text">
            {backendStatus === 'online' ? 'Backend: 8000 (OK)' : backendStatus === 'checking' ? 'Backend: Checking' : 'Backend: Offline'}
          </span>
        </div>
      </div>
    </header>
  )
}
