import React, { useEffect, useState } from 'react';
import './console.css';
import { api, type CameraNode, type DecoyTelemetry, type AuditBlock, type EscrowCase } from '../../api/client';

interface ConsolePageProps {
  onNavigateTab: (tab: 'city' | 'console' | 'cameras' | 'decoy' | 'campaigns') => void;
}

export const ConsolePage: React.FC<ConsolePageProps> = ({ onNavigateTab }) => {
  const [selectedDevice, setSelectedDevice] = useState<string>('camera');
  const [step, setStep] = useState<number>(0);
  const [mode, setMode] = useState<'idle' | 'attack' | 'false'>('idle');
  const [frameTimestamp, setFrameTimestamp] = useState<number>(() => Date.now());

  // Real backend metrics
  const [camera, setCamera] = useState<CameraNode | null>(null);
  const [telemetry, setTelemetry] = useState<DecoyTelemetry | null>(null);
  const [auditChain, setAuditChain] = useState<AuditBlock[]>([]);
  const [activeCase, setActiveCase] = useState<EscrowCase | null>(null);
  const [backendHealth, setBackendHealth] = useState<string>('checking');

  // Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalBody, setModalBody] = useState<React.ReactNode>(null);

  // Poll real backend telemetry
  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const health = await api.getHealth();
        if (mounted) setBackendHealth(health.status === 'ok' ? 'online' : 'offline');

        const cameras = await api.getCameras();
        if (mounted && cameras.length > 0) setCamera(cameras[0]);

        const dec = await api.getDecoyTelemetry();
        if (mounted) setTelemetry(dec);

        const logs = await api.getAuditLog();
        if (mounted) setAuditChain(logs);

        const cases = await api.getEscrowCases();
        if (mounted && cases.length > 0) setActiveCase(cases[0]);
      } catch {
        if (mounted) setBackendHealth('offline');
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Frame refresh interval
  useEffect(() => {
    const frameTimer = setInterval(() => setFrameTimestamp(Date.now()), 2500);
    return () => clearInterval(frameTimer);
  }, []);

  // Timeline scenarios
  const scenarios = {
    attack: [
      ['Sandbox ready', 'Choose a drill to explore the defense pipeline.'],
      ['Suspicious connection detected', 'Repeated SSH authentication attempts target smart city edge nodes.'],
      ['Session diverted to Phantom Twin', 'Aegis Gateway dynamic scoring redirects connection into isolated decoy twin.'],
      ['Hostility conditions met', 'Honeytoken tripwire tripped at /etc/camera/credentials.conf. Case CASE-2026-001 opened.'],
      ['Proof and approvals accepted', '2-of-3 municipal custodian quorum verified. Scoped AES-256 decryption key reconstructed.'],
      ['Audit recorded · dossier available', 'Audit block committed BEFORE key release. Decrypted evidence dossier unmasked.'],
    ],
    false: [
      ['Sandbox ready', 'Choose a drill to explore the defense pipeline.'],
      ['Edge model raises an alert', 'Camera blinding/freezing anomaly injected for testing.'],
      ['Redaction boundary preserved', 'Normal operator feed remains blurred; raw face crops remain encrypted.'],
      ['No hostile session evidence', 'Required honeypot canary breach and payload conditions are absent.'],
      ['Release request denied', 'Rogue unmask request strictly rejected with HTTP 403 Forbidden.'],
      ['Privacy preserved · review closed', 'False-positive refusal recorded to audit hash-chain. Camera recovered.'],
    ],
  };

  const handleSimulateAttack = async () => {
    setMode('attack');
    setStep(1);
    setSelectedDevice('phantom');

    try {
      // Real backend attack trigger
      const sid = 'sess-console-attack-' + Date.now().toString().slice(-4);
      await api.simulateDecoyCommand(sid, 'uname -a');
      setStep(2);

      setTimeout(async () => {
        await api.simulateDecoyCommand(sid, 'cat /etc/camera/credentials.conf');
        setStep(3);

        setTimeout(async () => {
          // Vote on case
          try {
            await api.voteEscrowCase('CASE-2026-001', 'custodian-2-cybercrime', 'approve');
          } catch {
            // Already approved or vote recorded
          }
          setStep(4);

          setTimeout(() => {
            setStep(5);
          }, 1800);
        }, 1800);
      }, 1800);
    } catch {
      setStep(5);
    }
  };

  const handleTestFalse = async () => {
    setMode('false');
    setStep(1);
    setSelectedDevice('camera');

    try {
      await api.simulateCameraBlind('cam_01');
      setStep(2);

      setTimeout(async () => {
        setStep(3);
        try {
          await api.attemptUnauthorized();
        } catch {
          // Expected 403
        }
        setStep(4);

        setTimeout(async () => {
          await api.simulateCameraRecover('cam_01');
          setStep(5);
        }, 1800);
      }, 1800);
    } catch {
      setStep(5);
    }
  };

  const handleOpenReleasePolicy = () => {
    setModalTitle('Cryptographic Release Policy & Quorum Verification');
    setModalBody(
      <div>
        <p>The AegisMirage break-glass protocol enforces four mandatory release conditions:</p>
        <pre>
1. Evidence Hostility Condition  → SATISFIED (Honeytoken tripwire tripped)
2. Scoped Key Constraint        → SATISFIED (Bound to CAM-04-MARKET @ WIN-20261024-1130)
3. Shamir Quorum (2-of-3)        → SATISFIED (Hon. Justice V. Sharma & Cybercrime Forensics)
4. Cryptographic Audit Block     → COMMITTED (Hash-chain entry verified before key release)
        </pre>
        <p style={{ marginTop: '12px', fontSize: '11px', color: '#a0aec0' }}>
          Latest Audit Hash: {auditChain.length > 0 ? auditChain[auditChain.length - 1].current_hash : 'Computing...'}
        </p>
      </div>
    );
    setModalOpen(true);
  };

  const handleViewDossier = async () => {
    try {
      const footage = await api.getCaseFootage('CASE-2026-001');
      setModalTitle('Verified Incident Dossier (CASE-2026-001)');
      setModalBody(
        <div>
          <p>
            Cryptographic Shamir quorum achieved. Scoped AES-256 decryption key released.
            Audit ledger block persisted prior to unmasking.
          </p>
          <div style={{ margin: '14px 0', display: 'flex', gap: '10px' }}>
            {footage.crops_base64 && footage.crops_base64.map((b64, idx) => (
              <img
                key={idx}
                src={`data:image/jpeg;base64,${b64}`}
                alt="Decrypted Crop"
                style={{ width: '90px', height: '90px', borderRadius: '4px', border: '1px solid #10b981' }}
              />
            ))}
          </div>
          <pre>
Camera ID: {footage.camera_id}
Window ID: {footage.window_id}
Status:    {footage.status.toUpperCase()}
Decrypted Crops: {footage.crop_count}
          </pre>
        </div>
      );
    } catch (err: any) {
      setModalTitle('Dossier Locked');
      setModalBody(<p>Evidence remains locked until 2-of-3 custodian quorum is achieved ({err.message}).</p>);
    }
    setModalOpen(true);
  };

  const currentScen = scenarios[mode === 'false' ? 'false' : 'attack'];
  const activeAttack = mode === 'attack';
  const checksCount = activeAttack ? (step >= 5 ? 4 : step >= 4 ? 3 : step >= 3 ? 1 : 0) : 0;

  return (
    <div className="console-root">
      {/* Header */}
      <header className="console-header">
        <svg className="console-logo" viewBox="0 0 36 40" fill="none">
          <path d="M18 2 33 10 29 28 18 38 7 28 3 10Z" stroke="currentColor" />
          <path d="m10 26 8-16 8 16M13 21h10" stroke="currentColor" strokeWidth="2" />
        </svg>
        <div className="console-brand">Aegis<span>Mirage</span></div>
        <div className="console-edition">DEFENSE OBSERVATORY</div>

        <div className="console-topright">
          <button onClick={() => onNavigateTab('city')}>Living City ↗</button>
          <button onClick={() => onNavigateTab('cameras')}>Cameras ↗</button>
          <button onClick={() => onNavigateTab('decoy')}>Decoy ↗</button>
          <button onClick={() => onNavigateTab('campaigns')}>Intel ↗</button>
          <span style={{ fontSize: '10px', color: backendHealth === 'online' ? '#4ade80' : '#f87171', fontFamily: 'monospace' }}>
            <i className="console-dot"></i>{backendHealth === 'online' ? 'BACKEND OK' : 'OFFLINE'}
          </span>
        </div>
      </header>

      <div className="console-layout">
        {/* Nav Rail */}
        <nav className="console-nav" aria-label="Console Navigation">
          <button className={selectedDevice === 'grid' ? 'active' : ''} onClick={() => setSelectedDevice('grid')} title="Network Overview">⬡</button>
          <button className={selectedDevice === 'camera' ? 'active' : ''} onClick={() => setSelectedDevice('camera')} title="Edge Sentry">▣</button>
          <button className={selectedDevice === 'phantom' ? 'active' : ''} onClick={() => setSelectedDevice('phantom')} title="Phantom Twin">◇</button>
          <button onClick={handleOpenReleasePolicy} title="Escrow Vault">▤</button>
        </nav>

        {/* Main Content */}
        <main className="console-main">
          <section className="console-intro">
            <div>
              <div className="console-eyebrow">AEGIS NETWORK / SECTOR 07 OBSERVATORY</div>
              <h1>A city protected. A mirage deployed.</h1>
              <p className="console-subtitle">Observe the production IoT network. Follow the threat into its reflection.</p>
            </div>
            <div className="console-controls">
              <button id="console-falseBtn" onClick={handleTestFalse}>◎ False positive drill</button>
              <button id="console-attackBtn" className="console-primary" onClick={handleSimulateAttack}>↗ Simulate attack drill</button>
            </div>
          </section>

          {/* Stats Bar */}
          <section className="console-stats">
            <div className="console-stat">
              <div className="console-stat-label">Protected endpoints</div>
              <div className="console-stat-value">05 <small><i className="console-dot"></i>All operational</small></div>
            </div>
            <div className="console-stat">
              <div className="console-stat-label">Isolated sessions</div>
              <div className="console-stat-value">{telemetry?.active_sessions_count ? String(telemetry.active_sessions_count).padStart(2, '0') : '03'} <small>Phantom network</small></div>
            </div>
            <div className="console-stat">
              <div className="console-stat-label">Evidence events</div>
              <div className="console-stat-value">{telemetry?.honeytoken_hits ? String(telemetry.honeytoken_hits).padStart(2, '0') : '01'} <small>Honeytoken records</small></div>
            </div>
            <div className="console-stat">
              <div className="console-stat-label">Privacy boundary</div>
              <div className="console-stat-value" style={{ color: 'var(--c-cyan)', fontSize: '20px' }}>ENFORCED <small>YuNet blur active</small></div>
            </div>
          </section>

          {/* Isometric SVG Scene Workspace */}
          <div className="console-workspace">
            <section className="console-card">
              <div className="console-card-head">
                <h2>Mirror City <span style={{ color: '#607888', paddingLeft: '8px' }}>/</span> <span className="console-tiny" style={{ marginLeft: '8px' }}>NETWORK TOPOLOGY</span></h2>
                <span className="console-tiny">05 NODES · 02 DUAL LAYERS</span>
              </div>

              <div className={`console-scene ${activeAttack && step >= 1 ? 'console-attack-on' : ''}`} id="console-scene">
                <div className="console-scene-label">01 / PRODUCTION<small>Protected infrastructure</small></div>
                <div className="console-live-pill">● {mode === 'idle' ? 'SYSTEM NOMINAL' : activeAttack ? (step >= 2 ? 'THREAT CONTAINED' : 'DRILL IN PROGRESS') : 'PRIVACY PRESERVED'}</div>

                <svg viewBox="0 -25 800 485" role="group" aria-label="Interactive isometric dual-layer network">
                  <defs>
                    <pattern id="grid-pat" width="42" height="24" patternUnits="userSpaceOnUse">
                      <path d="M0 12 21 0 42 12 21 24Z" stroke="#33525e" strokeWidth="0.5" fill="none" />
                    </pattern>
                  </defs>

                  {/* Upper Production Grid Plane */}
                  <path d="M110 165 400 0 690 165 400 330Z" fill="url(#grid-pat)" opacity="0.22" />
                  <path d="M110 165 400 0 690 165 400 330Z" fill="#1b464933" stroke="#41696b" strokeWidth="0.7" />

                  {/* Connection Beams to Phantom Layer */}
                  <path d="M110 165v126l290 154V330ZM690 165v126L400 445V330Z" fill="#7cebd414" opacity="0.55" />

                  {/* Lower Violet Phantom Twin Plane */}
                  <g className="console-phantom">
                    <path d="m140 292 260-147 260 147-260 147Z" fill="#281b4633" stroke="#8362b8" strokeWidth="0.7" />
                    <path className="console-wire" d="m255 284 145-82 145 82-145 82Z M255 284h290 M400 202v164" />
                    <path className="console-flow" d="m255 284 145-82 145 82-145 82Z" />
                    <text x="400" y="365" textAnchor="middle" fill="#baa3ec" fontSize="9" fontFamily="monospace" letterSpacing="2">
                      PHANTOM TWIN DECOY
                    </text>
                  </g>

                  {/* Upper Production Network Flow */}
                  <path className="console-wire" d="m255 155 145-82 145 82-145 82Z M255 155h290 M400 73v164" />
                  <path className="console-flow" d="m255 155 145-82 145 82-145 82Z" />

                  {/* Aegis Gateway Hub */}
                  <path d="M400 153v126" stroke="#ae8aff" strokeDasharray="3 7" opacity="0.5" />
                  <ellipse cx="400" cy="157" rx="47" ry="24" fill="#80ead714" stroke="#80ead744" />
                  <path d="m375 149 25-15 25 15v18l-25 15-25-15Z" fill="#20444a" stroke="#80ead7" />
                  <text x="400" y="207" fill="#b3d8d4" fontSize="9" textAnchor="middle" fontFamily="monospace">
                    AEGIS GATEWAY
                  </text>

                  {/* Clickable Nodes */}
                  <g className="console-node" onClick={() => setSelectedDevice('camera')} transform="translate(255 120)">
                    <rect x="-24" y="-20" width="48" height="40" fill="#24424c" stroke="#629390" rx="4" />
                    <text x="0" y="5" textAnchor="middle" fill="#b1cbd3">CAM-01</text>
                  </g>

                  <g className="console-node" onClick={() => setSelectedDevice('grid')} transform="translate(400 35)">
                    <rect x="-24" y="-20" width="48" height="40" fill="#182f3c" stroke="#49717b" rx="4" />
                    <text x="0" y="5" textAnchor="middle" fill="#b1cbd3">GRID-02</text>
                  </g>

                  <g className="console-node" onClick={() => setSelectedDevice('signal')} transform="translate(545 120)">
                    <rect x="-24" y="-20" width="48" height="40" fill="#24424c" stroke="#629390" rx="4" />
                    <text x="0" y="5" textAnchor="middle" fill="#b1cbd3">SIGNAL-03</text>
                  </g>

                  <g className="console-node" onClick={() => setSelectedDevice('phantom')} transform="translate(400 290)">
                    <rect x="-30" y="-18" width="60" height="36" fill="#352953" stroke="#ad8bff" rx="4" />
                    <text x="0" y="5" textAnchor="middle" fill="#bc9bff">DECOY-01</text>
                  </g>

                  {/* Attack Divert Line */}
                  <path className="console-attackline" d="M55 106 145 106 255 155 400 155 400 282" />
                </svg>

                <div className="console-scene-label bottom">02 / DECEPTION<small>Isolated mirror environment</small></div>
              </div>

              <div className="console-legend">
                <span><i style={{ background: 'var(--c-cyan)' }}></i>Production</span>
                <span><i style={{ background: 'var(--c-purple)' }}></i>Phantom Decoy</span>
                <span><i style={{ background: 'var(--c-red)' }}></i>Hostile Session</span>
                <span style={{ marginLeft: 'auto', font: '9px monospace', color: '#617480' }}>SELECT A NODE TO INSPECT ↗</span>
              </div>
            </section>

            {/* Node Inspector */}
            <aside className="console-card">
              <div className="console-card-head">
                <h2>Node inspector</h2>
                <span className="console-tiny">↗</span>
              </div>

              <div className="console-inspector-panel">
                <div className="console-device-icon">
                  {selectedDevice === 'camera' ? '▣' : selectedDevice === 'phantom' ? '◇' : selectedDevice === 'signal' ? '⋮' : 'ϟ'}
                </div>

                <h3>{selectedDevice === 'camera' ? 'North Gate Camera' : selectedDevice === 'phantom' ? 'Phantom Twin Decoy' : selectedDevice === 'signal' ? 'Traffic Signal' : 'Grid Relay'}</h3>
                <div className="console-state">
                  <i className="console-dot"></i>
                  {selectedDevice === 'camera' ? 'Protected · CAM-01' : selectedDevice === 'phantom' ? 'Isolated · DECOY-01' : 'Connected'}
                </div>

                {/* Camera Live Feed Preview */}
                {selectedDevice === 'camera' && (
                  <div className="console-feed">
                    <img
                      src={`${api.getCameraFrameUrl('cam_01')}?t=${frameTimestamp}`}
                      alt="Camera Feed with Face Redaction"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <span className="console-feed-label">SYNTHETIC CAMERA PREVIEW</span>
                    <span className="console-feed-caption">PII REDACTED</span>
                  </div>
                )}

                <div className="console-kv">
                  <span>Node Status</span>
                  <span>{selectedDevice === 'camera' ? (camera ? `${camera.status.toUpperCase()} (${camera.fps} FPS)` : 'ACTIVE (24 FPS)') : 'OPERATING NORMALLY'}</span>
                </div>

                <div className="console-kv">
                  <span>Protocol</span>
                  <span>{selectedDevice === 'camera' ? 'RTSP / HTTP' : selectedDevice === 'phantom' ? 'Emulated SSH' : 'MQTT'}</span>
                </div>

                <div className="console-kv">
                  <span>Boundary</span>
                  <span>{selectedDevice === 'camera' ? 'Edge YuNet blur' : selectedDevice === 'phantom' ? 'Decoy sandbox' : 'Gateway routing'}</span>
                </div>

                <div className="console-kv">
                  <span>Raw identity</span>
                  <span>{selectedDevice === 'camera' ? 'Locked (AES-GCM)' : 'Not inferred'}</span>
                </div>

                <p className="console-info">
                  {selectedDevice === 'camera'
                    ? 'Faces and sensitive features are redacted before transmission. A model flag alone cannot authorize access to raw evidence.'
                    : selectedDevice === 'phantom'
                    ? 'The decoy captures attacker telemetry statically. Host command execution and outbound connections are disabled.'
                    : 'Municipal smart city node connected to the distributed defense mesh.'}
                </p>
              </div>
            </aside>
          </div>

          {/* Lower Section: Incident Timeline & Escrow Gate */}
          <div className="console-lower">
            <section className="console-card">
              <div className="console-card-head">
                <h2>Incident timeline</h2>
                <span className="console-tiny">{mode === 'idle' ? 'AWAITING SCENARIO' : mode === 'attack' ? 'ATTACK DRILL' : 'FALSE-POSITIVE DRILL'}</span>
              </div>

              <div className="console-events">
                {currentScen.slice(0, step + 1).map((evt, idx) => (
                  <div key={idx} className="console-event">
                    <time>00:{String(idx * 3).padStart(2, '0')}</time>
                    <i style={{ background: activeAttack && idx > 0 ? 'var(--c-purple)' : 'var(--c-cyan)' }}></i>
                    <p>{evt[0]}<small>{evt[1]}</small></p>
                  </div>
                ))}
              </div>

              <div className="console-steps">
                <button onClick={() => setStep(Math.min(5, step + 1))}>▶ Step</button>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={step}
                  onChange={(e) => setStep(Number(e.target.value))}
                />
                <span className="console-tiny">{String(step).padStart(2, '0')} / 05</span>
                <button onClick={() => { setStep(0); setMode('idle'); }}>↺ Reset</button>
              </div>
            </section>

            {/* Escrow Gate Panel */}
            <section className="console-card">
              <div className="console-card-head">
                <h2>Break-glass escrow</h2>
                <span className="console-tiny">SHAMIR (2, 3)</span>
              </div>

              <div className="console-escrow">
                <div className="console-gate">
                  <div>
                    <strong>{step >= 5 && activeAttack ? 'Session dossier released' : `Evidence stays sealed (${activeCase?.case_id || 'CASE-2026-001'})`}</strong>
                    <small>{step >= 5 && activeAttack ? 'Audit written before release' : 'Camera identity remains locked'}</small>
                  </div>
                  <span className="console-lock">{step >= 5 && activeAttack ? '🔓' : '⬡'}</span>
                </div>

                <div className="console-checks">
                  {[1, 2, 3, 4].map(c => (
                    <span key={c} className={checksCount >= c ? 'done' : ''}></span>
                  ))}
                </div>

                <p id="console-gateDetail">
                  {step >= 5 && activeAttack
                    ? 'Decrypted evidence crops released. Cryptographic audit block confirmed on chain.'
                    : 'Evidence threshold → proof → quorum → audit. Every condition must pass before release.'}
                </p>

                <button
                  style={{ width: '100%', marginTop: '12px', fontSize: '11px' }}
                  onClick={step >= 5 && activeAttack ? handleViewDossier : handleOpenReleasePolicy}
                >
                  {step >= 5 && activeAttack ? 'View decrypted dossier ↗' : 'Inspect release policy ↗'}
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* Modal Drawer */}
      {modalOpen && (
        <div className="console-modal-drawer" onClick={() => setModalOpen(false)}>
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <button style={{ float: 'right', border: 0, fontSize: '18px' }} onClick={() => setModalOpen(false)}>✕</button>
            <div className="console-eyebrow">AEGIS / RELEASE VERIFIER</div>
            <h2>{modalTitle}</h2>
            {modalBody}
          </div>
        </div>
      )}
    </div>
  );
};
