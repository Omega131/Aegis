import React, { useEffect, useState, useCallback } from 'react'
import { API_BASE, type CameraEvent, type CameraNodeStatus } from './types'
import { CameraTile } from './CameraTile'
import { CameraEventFeed } from './CameraEventFeed'
import './cameras.css'

export const CamerasPage: React.FC = () => {
  // ---------------------------------------------------------------------------
  // STATE MANAGEMENT
  // ---------------------------------------------------------------------------
  // List of active camera nodes and their metrics
  const [cameras, setCameras] = useState<CameraNodeStatus[]>([])
  // Recent event logs from edge nodes
  const [events, setEvents] = useState<CameraEvent[]>([])
  // UI interaction flags
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isActionPending, setIsActionPending] = useState<boolean>(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // DATA FETCHING: NODES & EVENT LOGS
  // ---------------------------------------------------------------------------
  // Step 1: Fetch live status for all camera nodes in the mesh
  const fetchCameras = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/cameras`, {
        signal: AbortSignal.timeout(3000),
      })
      if (response.ok) {
        const data: CameraNodeStatus[] = await response.json()
        setCameras(data)
      }
    } catch {
      // Backend might be offline; status will reflect degraded/offline state
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Step 2: Fetch recent camera events from the backend audit log
  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/cameras/events?limit=50`, {
        signal: AbortSignal.timeout(3000),
      })
      if (response.ok) {
        const data: CameraEvent[] = await response.json()
        setEvents(data)
      }
    } catch {
      // Ignore background event polling errors
    }
  }, [])

  // ---------------------------------------------------------------------------
  // LIFECYCLE POLLING INTERVALS
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true

    const loadInitialData = async () => {
      try {
        const [camRes, evRes] = await Promise.allSettled([
          fetch(`${API_BASE}/api/cameras`, { signal: AbortSignal.timeout(3000) }),
          fetch(`${API_BASE}/api/cameras/events?limit=50`, { signal: AbortSignal.timeout(3000) }),
        ])
        if (!isMounted) return

        if (camRes.status === 'fulfilled' && camRes.value.ok) {
          const camData: CameraNodeStatus[] = await camRes.value.json()
          if (isMounted) setCameras(camData)
        }
        if (evRes.status === 'fulfilled' && evRes.value.ok) {
          const evData: CameraEvent[] = await evRes.value.json()
          if (isMounted) setEvents(evData)
        }
      } catch {
        // Backend might be offline during initial mount; handled silently
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadInitialData()

    // Poll camera node status every 1.5 seconds
    const camerasTimer = setInterval(fetchCameras, 1500)

    // Poll event feed every 2.0 seconds as requested
    const eventsTimer = setInterval(fetchEvents, 2000)

    return () => {
      isMounted = false
      clearInterval(camerasTimer)
      clearInterval(eventsTimer)
    }
  }, [fetchCameras, fetchEvents])

  // ---------------------------------------------------------------------------
  // GLOBAL MESH CONTROLS: START & STOP
  // ---------------------------------------------------------------------------
  const handleStartMesh = async () => {
    setIsActionPending(true)
    setFeedbackMessage('Starting camera mesh...')
    try {
      const response = await fetch(`${API_BASE}/api/cameras/start`, {
        method: 'POST',
      })
      if (response.ok) {
        setFeedbackMessage('Edge mesh started successfully.')
        await fetchCameras()
        await fetchEvents()
      } else {
        setFeedbackMessage('Failed to start mesh. Check backend status.')
      }
    } catch (err) {
      setFeedbackMessage(`Error starting mesh: ${(err as Error).message}`)
    } finally {
      setIsActionPending(false)
      setTimeout(() => setFeedbackMessage(null), 3000)
    }
  }

  const handleStopMesh = async () => {
    setIsActionPending(true)
    setFeedbackMessage('Stopping camera mesh...')
    try {
      const response = await fetch(`${API_BASE}/api/cameras/stop`, {
        method: 'POST',
      })
      if (response.ok) {
        setFeedbackMessage('Edge mesh stopped.')
        await fetchCameras()
        await fetchEvents()
      } else {
        setFeedbackMessage('Failed to stop mesh.')
      }
    } catch (err) {
      setFeedbackMessage(`Error stopping mesh: ${(err as Error).message}`)
    } finally {
      setIsActionPending(false)
      setTimeout(() => setFeedbackMessage(null), 3000)
    }
  }

  // ---------------------------------------------------------------------------
  // PER-TILE ANOMALY DRILL SIMULATION
  // ---------------------------------------------------------------------------
  const handleSimulate = async (
    cameraId: string,
    anomaly: 'blind' | 'freeze' | 'recover'
  ) => {
    setIsActionPending(true)
    try {
      const response = await fetch(
        `${API_BASE}/api/cameras/${cameraId}/simulate/${anomaly}`,
        { method: 'POST' }
      )
      if (response.ok) {
        setFeedbackMessage(`Triggered '${anomaly}' drill on ${cameraId.toUpperCase()}`)
        // Immediate refresh to update UI badges
        await fetchCameras()
        await fetchEvents()
      }
    } catch (err) {
      setFeedbackMessage(`Drill error: ${(err as Error).message}`)
    } finally {
      setIsActionPending(false)
      setTimeout(() => setFeedbackMessage(null), 3000)
    }
  }

  // ---------------------------------------------------------------------------
  // COMPUTED AGGREGATES FOR TOP BAR
  // ---------------------------------------------------------------------------
  const activeNodesCount = cameras.filter((c) => c.status === 'running').length
  const anomalyCount = cameras.filter((c) => c.status === 'anomaly').length
  const totalBlurredFaces = cameras.reduce(
    (sum, c) => sum + (c.faces_blurred_count || 0),
    0
  )
  const isMeshRunning = activeNodesCount > 0 || anomalyCount > 0

  return (
    <div className="page-container" id="page-cameras">
      {/* 1. Header & Module Purpose */}
      <div className="page-header">
        <div className="badge owner-badge">Owner: Member A — camera mesh + face blur</div>
        <h1 id="heading-cameras">Edge Sentry Cameras</h1>
        <p className="page-desc">
          Autonomous edge camera node mesh featuring YuNet-based automated privacy blurring,
          local AES-256-GCM content-addressed crop escrow, and real-time physical anomaly detection.
        </p>
      </div>

      <div className="cameras-container">
        {/* 2. Toolbar: Mesh Health & Global Action Controls */}
        <div className="cameras-toolbar">
          <div className="mesh-metrics">
            <div className="metric-item">
              <span className="metric-label">Active Nodes</span>
              <span className="metric-value">
                {activeNodesCount} / {cameras.length || 5}
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Detected Anomalies</span>
              <span
                className="metric-value"
                style={{ color: anomalyCount > 0 ? '#f43f5e' : '#10b981' }}
              >
                {anomalyCount}
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Total Faces Obscured</span>
              <span className="metric-value" style={{ color: 'var(--accent-cyan)' }}>
                {totalBlurredFaces}
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Privacy Mode</span>
              <span className="metric-value" style={{ color: '#10b981', fontSize: '0.9rem' }}>
                🛡️ 100% Zero Raw Ingestion
              </span>
            </div>
          </div>

          <div className="mesh-actions">
            {feedbackMessage && (
              <span
                style={{
                  fontSize: '0.8rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  marginRight: '0.5rem',
                }}
              >
                {feedbackMessage}
              </span>
            )}
            <button
              type="button"
              className="btn-primary"
              onClick={handleStartMesh}
              disabled={isActionPending || isMeshRunning}
              title="Start all camera nodes in the mesh"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Start Mesh</span>
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={handleStopMesh}
              disabled={isActionPending || !isMeshRunning}
              title="Stop all camera nodes in the mesh"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
              <span>Stop Mesh</span>
            </button>
          </div>
        </div>

        {/* 3. Responsive Camera Tile Grid */}
        <div className="cameras-grid" id="cameras-grid-list">
          {isLoading && cameras.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>
              Connecting to edge sentry mesh at {API_BASE}...
            </div>
          ) : cameras.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>
              No camera nodes detected. Ensure FastAPI backend is running at {API_BASE}.
            </div>
          ) : (
            cameras.map((camera) => (
              <CameraTile
                key={camera.camera_id}
                camera={camera}
                onSimulate={handleSimulate}
                isSimulating={isActionPending}
              />
            ))
          )}
        </div>

        {/* 4. Real-Time Event Audit Feed */}
        <CameraEventFeed events={events} isLoading={isLoading} />
      </div>
    </div>
  )
}
