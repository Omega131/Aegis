import React from 'react';
import { useApp } from '../../context/AppContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => {
        const icon =
          toast.type === 'success'
            ? '✅'
            : toast.type === 'danger'
            ? '🚨'
            : toast.type === 'deception'
            ? '🪤'
            : toast.type === 'review'
            ? '⚖️'
            : '🛡️';

        return (
          <div
            key={toast.id}
            className={`toast-item toast-${toast.type}`}
            onClick={() => removeToast(toast.id)}
            role="status"
          >
            <span style={{ fontSize: '1.1rem' }} aria-hidden="true">
              {icon}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#FFFFFF' }}>{toast.title}</div>
              {toast.desc && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                  {toast.desc}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(toast.id);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                padding: '0 0.2rem',
              }}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
};
