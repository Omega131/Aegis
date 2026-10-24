import React from 'react';

export interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  variant?: 'production' | 'deception' | 'review' | 'danger' | 'success';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtitle,
  icon,
  variant = 'production',
}) => {
  const accentColor =
    variant === 'production'
      ? 'var(--accent-production)'
      : variant === 'deception'
      ? 'var(--accent-deception)'
      : variant === 'danger'
      ? 'var(--accent-danger)'
      : variant === 'review'
      ? 'var(--accent-review)'
      : 'var(--accent-success)';

  return (
    <div className="stat-box" style={{ borderTop: `2px solid ${accentColor}` }}>
      <div className="stat-box-header">
        <span>{label}</span>
        {icon && <span style={{ fontSize: '1.1rem' }}>{icon}</span>}
      </div>
      <div className="stat-box-val" style={{ color: accentColor }}>
        {value}
      </div>
      {subtitle && <div className="stat-box-sub">{subtitle}</div>}
    </div>
  );
};
