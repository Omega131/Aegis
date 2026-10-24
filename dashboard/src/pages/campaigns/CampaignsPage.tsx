import React from 'react'

export const CampaignsPage: React.FC = () => {
  return (
    <div className="page-container" id="page-campaigns">
      <div className="page-header">
        <div className="badge owner-badge">Owner: Member C — campaign clustering</div>
        <h1 id="heading-campaigns">Campaigns</h1>
        <p className="page-desc">Multi-session threat clustering, cross-sensor correlation, and escrow unblur workflows.</p>
      </div>
      <div className="scaffold-card">
        <div className="card-status-dot"></div>
        <div>
          <h3>Phase 1 Scaffold Active</h3>
          <p>Ready for Member C feature implementation. Reads shared models from <code>schema.py</code> (Campaign, CaseRequest).</p>
        </div>
      </div>
    </div>
  )
}
