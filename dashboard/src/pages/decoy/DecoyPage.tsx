import React from 'react'

export const DecoyPage: React.FC = () => {
  return (
    <div className="page-container" id="page-decoy">
      <div className="page-header">
        <div className="badge owner-badge">Owner: Member B — honeypot (SSH + web decoy)</div>
        <h1 id="heading-decoy">Decoy Activity</h1>
        <p className="page-desc">Honeypot session capture, honeytoken hit tracking, and dynamic gateway routing.</p>
      </div>
      <div className="scaffold-card">
        <div className="card-status-dot"></div>
        <div>
          <h3>Phase 1 Scaffold Active</h3>
          <p>Ready for Member B feature implementation. Reads shared models from <code>schema.py</code> (DecoySessionEvent, RouteDecision).</p>
        </div>
      </div>
    </div>
  )
}
