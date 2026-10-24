import React, { useEffect, useState, useCallback } from 'react';
import { api, type AuditBlock, type AuditVerification } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { CityMiniMap } from '../../components/ui/CityMiniMap';

export const AuditPage: React.FC = () => {
  const { addToast } = useApp();

  const [auditLogs, setAuditLogs] = useState<AuditBlock[]>([]);
  const [verification, setVerification] = useState<AuditVerification | null>(null);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Fetch Audit Log
  const loadLogs = useCallback(async () => {
    try {
      const logs = await api.getAuditLog();
      setAuditLogs(logs);
      if (logs.length > 0 && selectedBlockIndex === null) {
        setSelectedBlockIndex(logs[logs.length - 1].index);
      }
    } catch {
      // silent
    }
  }, [selectedBlockIndex]);

  const handleVerifyLedger = useCallback(async () => {
    setIsVerifying(true);
    try {
      const res = await api.verifyAuditLog();
      setVerification(res);
      if (res.valid) {
        addToast(
          'Cryptographic Ledger Verified',
          `All ${res.total_blocks} SHA-256 blocks mathematically verified. Hash chain is intact and tamper-free.`,
          'success'
        );
      } else {
        addToast('Integrity Alert', `Ledger verification failed at block ${res.tampered_index}`, 'danger');
      }
    } catch (err: any) {
      addToast('Verification Error', err.message, 'danger');
    } finally {
      setIsVerifying(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadLogs();
    handleVerifyLedger();
    const timer = setInterval(loadLogs, 3500);
    return () => clearInterval(timer);
  }, [loadLogs, handleVerifyLedger]);

  const filteredLogs = auditLogs.filter((b) => {
    if (filterAction === 'all') return true;
    return b.action.toLowerCase().includes(filterAction.toLowerCase());
  });

  const selectedBlock = auditLogs.find((b) => b.index === selectedBlockIndex) || auditLogs[auditLogs.length - 1];

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-wrap">
          <h1>Cryptographic Audit Trail & Hash Chain</h1>
          <p>
            Immutable SHA-256 append-only ledger. Records every unmasking grant, false-positive refusal, honeytoken canary trip, and administrative action with back-linked cryptographic parent hashes.
          </p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleVerifyLedger}
            disabled={isVerifying}
          >
            {isVerifying ? 'Verifying Chain...' : '🛡️ Verify Ledger Integrity (SHA-256)'}
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="stat-card-grid">
        <StatCard
          label="Committed Audit Blocks"
          value={auditLogs.length}
          subtitle="Sequential append-only entries"
          variant="production"
          icon="⛓️"
        />
        <StatCard
          label="Hash-Chain Integrity"
          value={verification?.valid ? '100% VALID' : 'CHECKING'}
          subtitle={verification?.valid ? 'Mathematical proof intact' : 'Verifying links'}
          variant={verification?.valid ? 'success' : 'review'}
          icon="🔒"
        />
        <StatCard
          label="Pre-Commitment Rule"
          value="ENFORCED"
          subtitle="Audit block precedes key release"
          variant="review"
          icon="📜"
        />
        <StatCard
          label="Hash Algorithm"
          value="SHA-256"
          subtitle="256-bit cryptographic digest"
          variant="deception"
          icon="🧮"
        />
      </div>

      {/* Main Two-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem' }}>
        {/* Left Column: Filter & Table of Blocks */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span>📋</span>
              <span>Ledger Chain Entries</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({filteredLogs.length} blocks)</span>
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-xs ${filterAction === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterAction('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`btn btn-xs ${filterAction === 'unmask' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterAction('unmask')}
              >
                Unmasking
              </button>
              <button
                type="button"
                className={`btn btn-xs ${filterAction === 'blocked' ? 'btn-danger' : 'btn-ghost'}`}
                onClick={() => setFilterAction('blocked')}
              >
                Refusals (403)
              </button>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Block #</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Timestamp</th>
                  <th>Current Hash (Digest)</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((blk) => (
                  <tr
                    key={blk.index}
                    className={blk.index === selectedBlockIndex ? 'selected' : ''}
                    onClick={() => setSelectedBlockIndex(blk.index)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <code>#{blk.index}</code>
                    </td>
                    <td>
                      <Badge
                        variant={
                          blk.action.includes('APPROVED')
                            ? 'success'
                            : blk.action.includes('BLOCKED')
                            ? 'danger'
                            : 'production'
                        }
                      >
                        {blk.action}
                      </Badge>
                    </td>
                    <td>
                      <strong>{blk.actor}</strong>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {blk.timestamp ? blk.timestamp.slice(11, 19) : 'Recent'}
                    </td>
                    <td>
                      <code style={{ fontSize: '0.7rem', color: 'var(--accent-production)' }}>
                        {blk.current_hash ? blk.current_hash.slice(0, 14) + '...' : '—'}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Block Inspector & MiniMap */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <CityMiniMap />

          {selectedBlock && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <span>🔎</span>
                  <span>Block #{selectedBlock.index} Proof Inspector</span>
                </div>
                <Badge variant="production">COMMITTED</Badge>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Action Type:</span>
                  <div style={{ fontWeight: 700, marginTop: '0.15rem' }}>{selectedBlock.action}</div>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Executing Actor:</span>
                  <div style={{ color: 'var(--accent-production)', fontWeight: 600 }}>{selectedBlock.actor}</div>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Block Details:</span>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{selectedBlock.details}</div>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Previous Block Hash (Parent):</span>
                  <pre
                    style={{
                      background: '#050811',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '0.45rem',
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      wordBreak: 'break-all',
                      whiteSpace: 'pre-wrap',
                      marginTop: '0.2rem',
                    }}
                  >
                    {selectedBlock.prev_hash}
                  </pre>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Current SHA-256 Hash Digest:</span>
                  <pre
                    style={{
                      background: '#050811',
                      border: '1px solid var(--border-production)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '0.45rem',
                      fontSize: '0.7rem',
                      color: 'var(--accent-production)',
                      wordBreak: 'break-all',
                      whiteSpace: 'pre-wrap',
                      marginTop: '0.2rem',
                    }}
                  >
                    {selectedBlock.current_hash}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
