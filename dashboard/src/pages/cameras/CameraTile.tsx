import React, { useEffect, useState } from 'react'
import { API_BASE, type CameraNodeStatus } from './types'

interface CameraTileProps {
  camera: CameraNodeStatus
  onSimulate: (cameraId: string, anomaly: 'blind' | 'freeze' | 'recover') => void
  isSimulating?: boolean
}

export const CameraTile: React.FC<CameraTileProps> = ({
  camera,
  onSimulate,
  isSimulating = false,
}) => {
  // Step 1: Manage timestamp state to refresh blurred frame image every ~500 ms
  const [frameTimestamp, setFrameTimestamp] = useState<number>(() => Date.now())
  const [hasImageError, setHasImageError] = useState<boolean>(false)

  useEffect(() => {
    // Only refresh frames if the camera node is currently running or in anomaly state
    if (camera.status === 'stopped') {
      return
    }

    // Step 2: Set up 1200 ms timer to update query param for live JPEG streaming (smooth without network choking)
    const intervalId = setInterval(() => {
      setFrameTimestamp(Date.now())
      setHasImageError(false)
    }, 1200)

    return () => clearInterval(intervalId)
  }, [camera.status])

  // Step 3: Compute health indicator class
  const getHealthClass = (): string => {
    switch (camera.health) {
      case 'healthy':
        return 'health-healthy'
      case 'warning':
        return 'health-warning'
      case 'offline':
      default:
        return 'health-offline'
    }
  }

  // Step 4: Compute status/health badge presentation (green=healthy, yellow=warning/anomaly, red=offline)
  const getStatusBadge = (): { label: string; className: string } => {
    if (camera.status === 'anomaly' || camera.health === 'warning') {
      return { label: 'WARNING', className: 'badge-warning' }
    }
    if (camera.status === 'running' && camera.health === 'healthy') {
      return { label: 'HEALTHY', className: 'badge-healthy' }
    }
    return { label: 'OFFLINE', className: 'badge-offline' }
  }

  const statusBadge = getStatusBadge()
  const frameUrl = `${API_BASE}/api/cameras/${camera.camera_id}/frame?t=${frameTimestamp}`

  return (
    <div
      className={`camera-tile ${camera.status === 'anomaly' ? 'tile-anomaly' : ''}`}
      id={`tile-${camera.camera_id}`}
    >
      {/* 1. Header: Camera ID, Health Indicator, Status Badge */}
      <div className="tile-header">
        <div className="tile-id-group">
          <span
            className={`health-dot ${getHealthClass()}`}
            title={`Health: ${camera.health}`}
          />
          <span className="camera-id-text">{camera.camera_id.toUpperCase()}</span>
        </div>
        <span className={`status-badge ${statusBadge.className}`}>
          {statusBadge.label}
        </span>
      </div>

      {/* 2. Viewport: Live Blurred JPEG Stream & Privacy Watermark */}
      <div className="tile-viewport">
        {/* Privacy Lock Banner - Guarantees visual evidence of automated face privacy */}
        <div className="privacy-pill">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>BLURRED BY DEFAULT</span>
        </div>

        {/* Live Frame Image or Placeholder */}
        {!hasImageError && camera.status !== 'stopped' ? (
          <img
            src={frameUrl}
            alt={`Camera feed for ${camera.camera_id}`}
            onError={() => setHasImageError(true)}
            loading="eager"
          />
        ) : (
          <div className="tile-viewport-placeholder">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
            <span>{camera.status === 'stopped' ? 'Camera Stopped' : 'Connecting feed...'}</span>
          </div>
        )}

        {/* Viewport Telemetry HUD */}
        <div className="viewport-hud">
          {camera.status === 'running' ? 'LIVE // YUNET' : camera.status.toUpperCase()}
        </div>
      </div>

      {/* 3. Metadata: Faces Blurred Counter & Last Event */}
      <div className="tile-body">
        <div className="tile-stats-row">
          <div className="stat-blurred-counter" title="Total face crops obscured and encrypted">
            <span>Faces Blurred:</span>
            <strong>{camera.faces_blurred_count}</strong>
          </div>
          <div className="last-event-tag" title="Most recent event on this node">
            {camera.last_event || 'idle'}
          </div>
        </div>

        {/* 4. Demo Drill Controls: Simulate Blinding / Freezing */}
        <div className="tile-drill-controls">
          <span className="drill-label">Drill:</span>
          <button
            type="button"
            className="btn-sm btn-amber"
            onClick={() => onSimulate(camera.camera_id, 'blind')}
            disabled={isSimulating || camera.status === 'stopped'}
            title="Simulate physical lens blinding"
          >
            Blind
          </button>
          <button
            type="button"
            className="btn-sm btn-cyan"
            onClick={() => onSimulate(camera.camera_id, 'freeze')}
            disabled={isSimulating || camera.status === 'stopped'}
            title="Simulate stream buffer freeze"
          >
            Freeze
          </button>
          {camera.status === 'anomaly' && (
            <button
              type="button"
              className="btn-sm"
              onClick={() => onSimulate(camera.camera_id, 'recover')}
              disabled={isSimulating}
              title="Reset anomaly state to normal"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
