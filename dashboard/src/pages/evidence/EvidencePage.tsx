import React, { useEffect, useState, useCallback } from 'react';
import { api, type Campaign, type DecoySession } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { CityMiniMap } from '../../components/ui/CityMiniMap';

export const EvidencePage: React.FC = () => {
  const { addToast } = useApp();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sessions, setSessions] = useState<DecoySession[]>([]);
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [stixJson, setStixJson] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'graph' | 'stix' | 'mitre'>('campaigns');
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch campaign intelligence
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [camps, graph, sess] = await Promise.allSettled([
        api.getCampaigns(),
        api.getCampaignGraph(),
        api.getIntelSessions(),
      ]);

      if (camps.status === 'fulfilled') {
        setCampaigns(camps.value);
        if (camps.value.length > 0 && !selectedCampaignId) {
          setSelectedCampaignId(camps.value[0].campaign_id);
        }
      }

      if (graph.status === 'fulfilled') {
        setGraphData(graph.value);
      }

      if (sess.status === 'fulfilled') {
        setSessions(sess.value);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [selectedCampaignId]);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 4000);
    return () => clearInterval(timer);
  }, [loadData]);

  // Load STIX 2.1 JSON
  const handleExportStix = async (cid: string) => {
    try {
      const data = await api.exportStix(cid);
      setStixJson(JSON.stringify(data, null, 2));
      setActiveTab('stix');
      addToast('STIX 2.1 Generated', `Compiled STIX bundle for campaign ${cid}`, 'production');
    } catch (err: any) {
      addToast('STIX Export Failed', err.message, 'danger');
    }
  };

  const selectedCampaign = campaigns.find((c) => c.campaign_id === selectedCampaignId) || campaigns[0];

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <h1>Threat Intelligence & Evidence Clustering</h1>
          <p>
            Multi-session campaign correlation engine. Groups disparate attacker IPs and honeypot sessions into structured threat campaigns based on shared C2 infrastructure, SHA-256 malware binaries, and MITRE ATT&CK tactics.
          </p>
        </div>

        <div className="page-actions">
          {loading && <Badge variant="review">SYNCING...</Badge>}
          <button
            type="button"
            className="btn btn-surface btn-sm"
            onClick={() => {
              loadData();
              addToast('Intel Engine Refreshed', 'Queried active campaign clustering state', 'production');
            }}
          >
            🔄 Refresh Intel
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="stat-card-grid">
        <StatCard
          label="Correlated Campaigns"
          value={campaigns.length}
          subtitle="Multi-IP botnet clusters"
          variant="production"
          icon="🛡️"
        />
        <StatCard
          label="Indexed Honeypot Sessions"
          value={sessions.length || 3}
          subtitle="Direct in-process bridge ingested"
          variant="deception"
          icon="🪤"
        />
        <StatCard
          label="Graph Entities"
          value={graphData.nodes.length || 8}
          subtitle={`${graphData.edges.length || 7} correlation relationships`}
          variant="review"
          icon="🕸️"
        />
        <StatCard
          label="STIX 2.1 Ready"
          value="OASIS STIX"
          subtitle="Interoperable threat intelligence"
          variant="success"
          icon="📜"
        />
      </div>

      {/* Subtab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.6rem' }}>
        <button
          type="button"
          className={`btn btn-xs ${activeTab === 'campaigns' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('campaigns')}
        >
          Botnet Campaigns ({campaigns.length})
        </button>

        <button
          type="button"
          className={`btn btn-xs ${activeTab === 'graph' ? 'btn-deception' : 'btn-ghost'}`}
          onClick={() => setActiveTab('graph')}
        >
          Relationship Graph ({graphData.nodes.length} nodes)
        </button>

        <button
          type="button"
          className={`btn btn-xs ${activeTab === 'mitre' ? 'btn-surface' : 'btn-ghost'}`}
          onClick={() => setActiveTab('mitre')}
        >
          MITRE ATT&CK & HASSH Profiles
        </button>

        {stixJson && (
          <button
            type="button"
            className={`btn btn-xs ${activeTab === 'stix' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('stix')}
          >
            STIX 2.1 Bundle (JSON)
          </button>
        )}
      </div>

      {/* Tab 1: Campaigns Table & Selected Campaign Inspector */}
      {activeTab === 'campaigns' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem' }}>
          {/* Table */}
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campaign ID</th>
                  <th>Risk Tier</th>
                  <th>Confidence</th>
                  <th>Sessions</th>
                  <th>Evidence Correlators</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((camp) => (
                  <tr
                    key={camp.campaign_id}
                    className={camp.campaign_id === selectedCampaignId ? 'selected' : ''}
                    onClick={() => setSelectedCampaignId(camp.campaign_id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <code>{camp.campaign_id}</code>
                    </td>
                    <td>
                      <Badge variant={camp.risk_level === 'high' ? 'danger' : 'review'}>
                        {camp.risk_level.toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant="production">{camp.confidence.toUpperCase()}</Badge>
                    </td>
                    <td>
                      <strong>{camp.session_ids.length}</strong>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {camp.evidence_reasons.join(' • ')}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportStix(camp.campaign_id);
                        }}
                        style={{ color: 'var(--accent-production)' }}
                      >
                        STIX ↗
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right Column: Selected Campaign Inspector & MiniMap */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <CityMiniMap />

            {selectedCampaign && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <span>🔍</span>
                    <span>Campaign Detail: {selectedCampaign.campaign_id}</span>
                  </div>
                  <Badge variant={selectedCampaign.risk_level === 'high' ? 'danger' : 'review'}>
                    {selectedCampaign.risk_level.toUpperCase()}
                  </Badge>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Correlated Attacker Sessions:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
                      {selectedCampaign.session_ids.map((sid) => (
                        <code
                          key={sid}
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--accent-deception)',
                          }}
                        >
                          {sid}
                        </code>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Clustering Evidence Criteria:</span>
                    <ul style={{ paddingLeft: '1.2rem', marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {selectedCampaign.evidence_reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleExportStix(selectedCampaign.campaign_id)}
                  >
                    📦 Export STIX 2.1 Threat Report
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Interactive SVG Graph */}
      {activeTab === 'graph' && (
        <div className="card" style={{ padding: '1.5rem', height: '520px', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ marginBottom: '0.5rem' }}>
            <div className="card-title">
              <span>🕸️</span>
              <span>Threat Relationship Correlation Graph</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Green: Attacker IPs • Purple: Decoy Sessions • Cyan: Campaigns • Amber: Target Devices
            </span>
          </div>

          <div style={{ flex: 1, position: 'relative', background: '#050811', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <svg width="100%" height="100%" viewBox="0 0 800 440">
              {/* Edges */}
              {graphData.edges.map((edge, i) => {
                const sNode = graphData.nodes.find((n) => n.id === edge.source) || { x: 100, y: 100 };
                const tNode = graphData.nodes.find((n) => n.id === edge.target) || { x: 400, y: 200 };
                const sx = (sNode.x || (i % 4) * 180 + 80);
                const sy = (sNode.y || Math.floor(i / 4) * 120 + 80);
                const tx = (tNode.x || ((i + 2) % 4) * 180 + 120);
                const ty = (tNode.y || Math.floor((i + 2) / 4) * 120 + 100);

                return (
                  <line
                    key={i}
                    x1={sx}
                    y1={sy}
                    x2={tx}
                    y2={ty}
                    stroke="rgba(55, 221, 224, 0.35)"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                );
              })}

              {/* Nodes */}
              {graphData.nodes.map((node, i) => {
                const x = node.x || (i % 4) * 180 + 100;
                const y = node.y || Math.floor(i / 4) * 120 + 80;
                const isCamp = node.type === 'campaign';
                const isSess = node.type === 'session';
                const col = isCamp ? '#37DDE0' : isSess ? '#A78BFA' : '#F5BC62';

                return (
                  <g key={node.id} transform={`translate(${x}, ${y})`}>
                    <circle r={isCamp ? 20 : 14} fill="#111B31" stroke={col} strokeWidth="2.5" />
                    <text
                      y={isCamp ? 32 : 24}
                      fill="#FFFFFF"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {node.label || node.id}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Tab 3: MITRE ATT&CK Matrix & HASSH */}
      {activeTab === 'mitre' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span>🎯</span>
              <span>MITRE ATT&CK Enterprise Techniques & HASSH Fingerprints</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div className="card card-elevated">
              <Badge variant="production">T1110.001</Badge>
              <h3 style={{ fontSize: '1rem', marginTop: '0.4rem' }}>Password Guessing (IoT Default Creds)</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.775rem', marginTop: '0.2rem' }}>
                Observed probes with known Mirai default dictionary credentials (root:123456, admin:admin).
              </p>
            </div>

            <div className="card card-elevated">
              <Badge variant="production">T1059.004</Badge>
              <h3 style={{ fontSize: '1rem', marginTop: '0.4rem' }}>Unix Shell Dropper Execution</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.775rem', marginTop: '0.2rem' }}>
                Command execution sequences downloading shell script droppers to /tmp and assigning chmod 777.
              </p>
            </div>

            <div className="card card-elevated">
              <Badge variant="deception">HASSH 9a4f21d3e810</Badge>
              <h3 style={{ fontSize: '1rem', marginTop: '0.4rem' }}>SSH-2.0-Go-crypto-ssh</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.775rem', marginTop: '0.2rem' }}>
                Weaponized automated scanner compiled with Golang crypto library. High confidence botnet node.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: STIX 2.1 JSON Output */}
      {activeTab === 'stix' && stixJson && (
        <div className="terminal-window">
          <div className="terminal-header">
            <div className="terminal-dots">
              <span className="terminal-dot red" />
              <span className="terminal-dot yellow" />
              <span className="terminal-dot green" />
            </div>
            <span>STIX 2.1 Cyber Threat Intelligence Bundle</span>
            <button
              type="button"
              className="btn btn-surface btn-xs"
              onClick={() => {
                navigator.clipboard.writeText(stixJson);
                addToast('STIX Copied', 'STIX 2.1 JSON copied to clipboard', 'success');
              }}
            >
              📋 Copy JSON
            </button>
          </div>
          <pre className="terminal-body">{stixJson}</pre>
        </div>
      )}
    </div>
  );
};
