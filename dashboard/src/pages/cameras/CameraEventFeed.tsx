import React from 'react'
import type { CameraEvent } from './types'

interface CameraEventFeedProps {
  events: CameraEvent[]
  isLoading?: boolean
}

export const CameraEventFeed: React.FC<CameraEventFeedProps> = ({
  events,
  isLoading = false,
}) => {
  // Helper to format ISO timestamp into localized readable time
  const formatTime = (isoString: string): string => {
    try {
      const date = new Date(isoString)
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return isoString
    }
  }

  // Helper to color-code event type badges
  const getEventBadgeClass = (eventType: string): string => {
    switch (eventType) {
      case 'face_blurred':
        return 'pill-blurred'
      case 'camera_blinded':
      case 'camera_frozen':
        return 'pill-anomaly'
      case 'recovered':
      case 'node_start':
        return 'pill-recovered'
      case 'node_stop':
      default:
        return 'pill-lifecycle'
    }
  }

  return (
    <div className="events-section" id="cameras-event-feed">
      {/* Event Feed Header with Polling Status */}
      <div className="events-header">
        <div className="events-title">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span>Edge Sentry Real-Time Event Audit Log</span>
        </div>
        <div className="live-indicator">
          <span>{isLoading ? 'Polling...' : 'Live 2s Sync'}</span>
        </div>
      </div>

      {/* Events Table */}
      <div className="events-table-wrapper">
        <table className="events-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Camera</th>
              <th>Event Type</th>
              <th>Window ID</th>
              <th>Privacy Action</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No camera events recorded yet. Click &quot;Start Mesh&quot; to begin edge monitoring.
                </td>
              </tr>
            ) : (
              events.map((evt, index) => (
                <tr key={`${evt.camera_id}-${evt.timestamp}-${index}`}>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {formatTime(evt.timestamp)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {evt.camera_id.toUpperCase()}
                  </td>
                  <td>
                    <span className={`event-type-pill ${getEventBadgeClass(evt.event_type)}`}>
                      {evt.event_type}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {evt.window_id}
                  </td>
                  <td>
                    {evt.blurred ? (
                      <span style={{ color: '#34d399', fontWeight: 600, fontSize: '0.75rem' }}>
                        🛡️ Encrypted &amp; Blurred
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        System Telemetry
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
