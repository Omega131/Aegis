import React from 'react'

export const CamerasPage: React.FC = () => {
  return (
    <div className="page-container" id="page-cameras">
      <div className="page-header">
        <div className="badge owner-badge">Owner: Member A — camera mesh + face blur</div>
        <h1 id="heading-cameras">Cameras</h1>
        <p className="page-desc">Camera mesh feed ingestion, edge streaming, and automated face blurring pipeline.</p>
      </div>
      <div className="scaffold-card">
        <div className="card-status-dot"></div>
        <div>
          <h3>Phase 1 Scaffold Active</h3>
          <p>Ready for Member A feature implementation. Reads shared models from <code>schema.py</code> (CameraEvent).</p>
        </div>
      </div>
    </div>
  )
}
