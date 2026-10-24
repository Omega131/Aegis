/**
 * Types for the Edge Sentry Camera Mesh module.
 * Matches backend contracts from edge.py and schema.py.
 */

// Centralized backend API base URL
export const API_BASE = 'http://localhost:8000'

export type CameraStatus = 'running' | 'stopped' | 'anomaly'
export type CameraHealth = 'healthy' | 'degraded' | 'offline'

export interface CameraNodeStatus {
  camera_id: string
  status: CameraStatus
  health: CameraHealth
  last_event: string
  faces_blurred_count: number
}

export interface CameraEvent {
  camera_id: string
  window_id: string
  timestamp: string
  event_type: string
  blurred: boolean
}
