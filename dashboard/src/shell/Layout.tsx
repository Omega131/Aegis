import React from 'react'
import { Navbar, type NavTab } from './Navbar'

interface LayoutProps {
  activeTab: NavTab
  onSelectTab: (tab: NavTab) => void
  children: React.ReactNode
}

export const Layout: React.FC<LayoutProps> = ({ activeTab, onSelectTab, children }) => {
  return (
    <div className="app-shell" id="app-shell">
      <Navbar activeTab={activeTab} onSelectTab={onSelectTab} />
      <main className="main-content" id="main-content">
        {children}
      </main>
      <footer className="shell-footer" id="shell-footer">
        <span>AegisMirage — Phase 1 Scaffold</span>
        <span className="footer-separator">•</span>
        <span>Single-Process Backend (FastAPI + SQLite)</span>
      </footer>
    </div>
  )
}
