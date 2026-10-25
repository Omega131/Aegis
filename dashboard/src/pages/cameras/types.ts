/**
 * Types for the Edge Sentry Camera Mesh module.
 * Matches backend contracts from edge.py and schema.py.
 */

// Centralized backend API base URL
export { API_BASE } from '../../api/client'

export type CameraStatus = 'running' | 'stopped' | 'anomaly'
export type CameraHealth = 'healthy' | 'warning' | 'offline'

export type CameraEventType =
  | 'node_start'
  | 'node_stop'
  | 'face_blurred'
  | 'camera_blinded'
  | 'camera_frozen'
  | 'camera_recovered'

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
  event_type: CameraEventType | string
  blurred: boolean
}
