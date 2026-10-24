import React from 'react';
import { useApp } from '../../context/AppContext';

interface CityMiniMapProps {
  highlightDeviceId?: string;
  className?: string;
}

export const CityMiniMap: React.FC<CityMiniMapProps> = ({ highlightDeviceId, className = '' }) => {
  const { setActiveTab, setSelectedDevice } = useApp();

  const nodes = [
    { id: 'CAM-01', name: 'Edge Sentry', x: 28, y: 72, type: 'camera', color: '#37DDE0' },
    { id: 'SIG-02', name: 'Mobility Grid', x: 52, y: 68, type: 'signal', color: '#F5BC62' },
    { id: 'PWR-03', name: 'Substation Core', x: 80, y: 32, type: 'power', color: '#EC72C7' },
    { id: 'ENV-04', name: 'Telemetry Post', x: 22, y: 28, type: 'sensor', color: '#34D399' },
    { id: 'GW-05', name: 'Phantom Twin', x: 62, y: 44, type: 'gateway', color: '#A78BFA' },
  ];

  return (
    <div
      className={`city-minimap-card ${className}`}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '0.85rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '0.725rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span>🏙️</span> City Mesh Topology Locator
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => setActiveTab('city')}
          style={{ fontSize: '0.7rem', color: 'var(--accent-production)' }}
        >
          Open Observatory ↗
        </button>
      </div>

      <div
        style={{
          position: 'relative',
          height: '110px',
          background: 'radial-gradient(ellipse at center, rgba(17,27,49,0.9), #080D1B)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}
      >
        {/* Isometric Grid Lines */}
        <svg
          width="100%"
          height="100%"
          style={{ position: 'absolute', inset: 0, opacity: 0.25, pointerEvents: 'none' }}
        >
          <line x1="0" y1="55" x2="100%" y2="55" stroke="#37DDE0" strokeWidth="0.5" strokeDasharray="3 3" />
          <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#37DDE0" strokeWidth="0.5" strokeDasharray="3 3" />
          <ellipse cx="50%" cy="50%" rx="38%" ry="28%" fill="none" stroke="#A78BFA" strokeWidth="0.5" strokeDasharray="2 4" />
        </svg>

        {/* Nodes */}
        {nodes.map((node) => {
          const isTarget = highlightDeviceId && highlightDeviceId.toUpperCase().includes(node.id);
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => {
                setSelectedDevice({
                  id: node.id,
                  name: node.name,
                  type: node.type as any,
                  status: 'running',
                  district: 'Metropolitan District Alpha',
                });
                setActiveTab('city');
              }}
              title={`${node.id} (${node.name}) - Click to inspect in Living City`}
              style={{
                position: 'absolute',
                left: `${node.x}%`,
                top: `${node.y}%`,
                transform: 'translate(-50%, -50%)',
                background: isTarget ? '#FFFFFF' : node.color,
                color: isTarget ? '#080D1B' : '#FFFFFF',
                border: isTarget ? `2px solid ${node.color}` : '1px solid rgba(255,255,255,0.4)',
                borderRadius: '50%',
                width: isTarget ? '16px' : '10px',
                height: isTarget ? '16px' : '10px',
                cursor: 'pointer',
                boxShadow: isTarget ? `0 0 12px ${node.color}` : `0 0 6px ${node.color}`,
                transition: 'all var(--transition-fast)',
                zIndex: isTarget ? 10 : 2,
                padding: 0,
              }}
            />
          );
        })}

        <div
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '8px',
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          5 MESH NODES ACTIVE
        </div>
      </div>
    </div>
  );
};
