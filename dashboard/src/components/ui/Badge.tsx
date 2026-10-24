import React from 'react';

export interface BadgeProps {
  variant?: 'production' | 'deception' | 'review' | 'danger' | 'success' | 'neutral';
  children: React.ReactNode;
  icon?: string;
  className?: string;
  title?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  icon,
  className = '',
  title,
}) => {
  return (
    <span className={`badge badge-${variant} ${className}`} title={title}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
};
