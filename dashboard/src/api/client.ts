/**
 * AegisMirage — Centralized Typed API Client
 * Connects frontend interfaces (Living City, Mirror Console, Subsystems)
 * to the unified FastAPI backend.
 */

export const API_BASE =
  (import.meta.env.VITE_API_URL as string) ||
  (typeof window !== 'undefined'
    ? (window.location.port === '5173' || window.location.port === '3000'
        ? `${window.location.protocol}//${window.location.hostname}:8000`
        : window.location.origin)
    : 'http://127.0.0.1:8000');

export interface SystemHealth {
  status: string;
  service: string;
  version: string;
  timestamp: number;
  modules: {
    edge: string;
    decoy: string;
    gateway: string;
    intel: string;
    escrow: string;
  };
  stats: {
    cameras_count: number;
    decoy_sessions_count: number;
    campaigns_count: number;
    escrow_cases_count: number;
    audit_blocks_count: number;
  };
}

export interface CameraNode {
  camera_id: string;
  location: string;
  status: string;
  fps: number;
  storage_encrypted_crops: number;
  window_id: string;
  health?: string;
  last_event?: string;
  faces_blurred_count?: number;
}

export interface CameraEvent {
  camera_id: string;
  window_id: string;
  timestamp: string;
  event_type: string;
  blurred: boolean;
  details?: Record<string, any>;
}

export interface DecoySession {
  session_id: string;
  source_ip: string;
  service: string;
  failed_logins: number;
  commands: string[];
  honeytoken_hit: boolean;
  malware_hash: string | null;
  c2_address: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DecoyTelemetry {
  service: string;
  active_sessions_count: number;
  active_sessions: DecoySession[];
  honeytoken_hits: number;
  recent_events: any[];
  timestamp: number;
}

export interface Campaign {
  campaign_id: string;
  session_ids: string[];
  confidence: string;
  evidence_reasons: string[];
  risk_level: string;
}

export interface EscrowCase {
  case_id: string;
  camera_id: string;
  window_id: string;
  campaign_id: string;
  status: 'pending' | 'approved' | 'denied';
  approvals: string[];
  created_at: string;
}

export interface AuditBlock {
  index: number;
  timestamp: string;
  action: string;
  actor: string;
  case_id: string | null;
  camera_id: string | null;
  window_id: string | null;
  details: string;
  prev_hash: string;
  current_hash: string;
}

export interface AuditVerification {
  valid: boolean;
  total_blocks: number;
  latest_hash: string;
  status: string;
  error?: string;
  tampered_index?: number;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
    } catch {
      // Ignore JSON parsing failure
    }
    const err = new Error(`API ${options.method || 'GET'} ${endpoint} failed (${response.status}): ${errorDetail}`);
    (err as any).status = response.status;
    (err as any).detail = errorDetail;
    throw err;
  }

  return response.json();
}

export const api = {
  // 1. System Health
  async getHealth(): Promise<SystemHealth> {
    return request<SystemHealth>('/health');
  },

  // 2. Camera & Edge Subsystem
  async getCameras(): Promise<CameraNode[]> {
    return request<CameraNode[]>('/api/cameras');
  },

  async getCameraEvents(limit = 50): Promise<CameraEvent[]> {
    return request<CameraEvent[]>(`/api/cameras/events?limit=${limit}`);
  },

  async simulateCameraBlind(cameraId: string): Promise<any> {
    return request<any>(`/api/cameras/${cameraId}/simulate/blind`, { method: 'POST' });
  },

  async simulateCameraRecover(cameraId: string): Promise<any> {
    return request<any>(`/api/cameras/${cameraId}/simulate/recover`, { method: 'POST' });
  },

  async recoverAllCameras(): Promise<any> {
    return request<any>('/api/cameras/recover-all', { method: 'POST' });
  },

  getCameraFrameUrl(cameraId: string): string {
    return `${API_BASE}/api/cameras/${cameraId}/frame`;
  },

  getCameraStreamUrl(cameraId: string): string {
    return `${API_BASE}/api/cameras/${cameraId}/stream`;
  },

  // 3. Decoy & Gateway Subsystem
  async getDecoyTelemetry(): Promise<DecoyTelemetry> {
    return request<DecoyTelemetry>('/api/decoy/operator/telemetry');
  },

  async getDecoySessions(): Promise<DecoySession[]> {
    return request<DecoySession[]>('/api/decoy/sessions');
  },

  async simulateDecoyCommand(sessionId: string, command: string): Promise<{ output: string; event: DecoySession }> {
    return request<{ output: string; event: DecoySession }>('/api/decoy/simulate/command', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, command }),
    });
  },

  async getGatewayStats(): Promise<any> {
    return request<any>('/api/gateway/stats');
  },

  // 4. Campaign Clustering & Intel Subsystem
  async getCampaigns(): Promise<Campaign[]> {
    return request<Campaign[]>('/intel/campaigns');
  },

  async getCampaignGraph(): Promise<{ nodes: any[]; edges: any[] }> {
    return request<{ nodes: any[]; edges: any[] }>('/intel/graph');
  },

  async getIntelSessions(): Promise<DecoySession[]> {
    return request<DecoySession[]>('/intel/sessions');
  },

  async exportStix(campaignId: string): Promise<any> {
    return request<any>(`/intel/export/stix/${campaignId}`);
  },

  // 5. Escrow & Break-Glass Subsystem
  async getEscrowCases(): Promise<EscrowCase[]> {
    return request<EscrowCase[]>('/escrow/cases');
  },

  async getEscrowCase(caseId: string): Promise<{ case: EscrowCase; approvals_count: number; votes: Record<string, string> }> {
    return request<{ case: EscrowCase; approvals_count: number; votes: Record<string, string> }>(`/escrow/cases/${caseId}`);
  },

  async voteEscrowCase(
    caseId: string,
    custodianId: string,
    decision: 'approve' | 'deny',
    justification?: string
  ): Promise<{ case: EscrowCase; quorum_achieved: boolean; unlocked_key?: string }> {
    return request<{ case: EscrowCase; quorum_achieved: boolean; unlocked_key?: string }>(`/escrow/cases/${caseId}/vote`, {
      method: 'POST',
      body: JSON.stringify({
        custodian_id: custodianId,
        decision,
        justification: justification || 'Judicial warrant compliance verification.',
      }),
    });
  },

  async getCaseFootage(caseId: string): Promise<{
    case_id: string;
    camera_id: string;
    window_id: string;
    status: string;
    crop_count: number;
    crops_base64: string[];
    details: string;
  }> {
    return request<{
      case_id: string;
      camera_id: string;
      window_id: string;
      status: string;
      crop_count: number;
      crops_base64: string[];
      details: string;
    }>(`/escrow/cases/${caseId}/footage`);
  },

  async getAuditLog(): Promise<AuditBlock[]> {
    return request<AuditBlock[]>('/escrow/audit-log');
  },

  async verifyAuditLog(): Promise<AuditVerification> {
    return request<AuditVerification>('/escrow/audit-log/verify');
  },

  async attemptUnauthorized(): Promise<any> {
    return request<any>('/escrow/attempt-unauthorized', { method: 'POST' });
  },

  // 6. Drill Triggers & Resets
  async triggerDrillB(): Promise<any> {
    return request<any>('/intel/drill/drill-b', { method: 'POST' });
  },

  async triggerDrillC(): Promise<any> {
    return request<any>('/intel/drill/drill-c', { method: 'POST' });
  },

  async resetIntel(): Promise<any> {
    return request<any>('/intel/reset', { method: 'POST' });
  },

  async resetEscrow(): Promise<any> {
    return request<any>('/escrow/reset', { method: 'POST' });
  },
};
