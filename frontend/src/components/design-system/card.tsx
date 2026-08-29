import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function RsCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rs-card', className)}>{children}</div>;
}

export function RsCardPadded({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rs-card-padded', className)}>{children}</div>;
}

export function RsStatCard({
  icon,
  label,
  value,
  context,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  context?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rs-stat-card', className)}>
      <div className="rs-stat-icon-tile rs-stat-icon-brand">{icon}</div>
      <div className="rs-stat-label">{label}</div>
      <div className="rs-stat-value">{value}</div>
      {context && <div className="rs-stat-context">{context}</div>}
    </div>
  );
}
