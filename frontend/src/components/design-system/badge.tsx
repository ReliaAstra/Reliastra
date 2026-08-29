'use client';

import { cn } from '@/lib/utils';

type StatusKind = 'operational' | 'up' | 'degraded' | 'down' | 'critical' | 'paused' | 'unknown';

interface StatusConfig {
  label: string;
  dotClass: string;
  badgeClass: string;
  pulse?: string;
}

const MAP: Record<string, StatusConfig> = {
  operational: {
    label: 'Operational',
    dotClass: 'bg-rs-up',
    badgeClass: 'bg-rs-up-bg text-rs-up border-[rgb(5_150_105_/_0.20)] dark:border-[rgb(52_211_153_/_0.25)]',
  },
  up: {
    label: 'Operational',
    dotClass: 'bg-rs-up',
    badgeClass: 'bg-rs-up-bg text-rs-up border-[rgb(5_150_105_/_0.20)] dark:border-[rgb(52_211_153_/_0.25)]',
  },
  degraded: {
    label: 'Degraded',
    dotClass: 'bg-rs-degraded',
    badgeClass: 'bg-rs-degraded-bg text-rs-degraded border-[rgb(217_119_6_/_0.20)] dark:border-[rgb(251_191_36_/_0.25)]',
    pulse: 'rs-pulse-degraded',
  },
  down: {
    label: 'Down',
    dotClass: 'bg-rs-down',
    badgeClass: 'bg-rs-down-bg text-rs-down border-[rgb(220_38_38_/_0.20)] dark:border-[rgb(248_113_113_/_0.25)]',
    pulse: 'rs-pulse-down',
  },
  critical: {
    label: 'Critical',
    dotClass: 'bg-rs-down',
    badgeClass: 'bg-rs-down-bg text-rs-down border-[rgb(220_38_38_/_0.20)] dark:border-[rgb(248_113_113_/_0.25)]',
    pulse: 'rs-pulse-down',
  },
  paused: {
    label: 'Paused',
    dotClass: 'bg-rs-text-tertiary',
    badgeClass: 'bg-rs-tertiary-bg text-rs-text-tertiary border-[rgb(105_116_138_/_0.20)]',
  },
  unknown: {
    label: 'Unknown',
    dotClass: 'bg-rs-text-tertiary',
    badgeClass: 'bg-rs-tertiary-bg text-rs-text-tertiary border-[rgb(105_116_138_/_0.20)]',
  },
};

interface Props {
  status: string;
  disablePulse?: boolean;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, disablePulse = false, label, className }: Props) {
  const key = status.toLowerCase();
  const s = MAP[key] ?? MAP.unknown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
        s.badgeClass,
        className
      )}
    >
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', s.dotClass, !disablePulse && s.pulse)} aria-hidden />
      {label ?? s.label}
    </span>
  );
}

export function RsBadge({ children, variant = 'unknown', className }: { children: React.ReactNode; variant?: StatusKind; className?: string }) {
  const s = MAP[variant] ?? MAP.unknown;
  return (
    <span className={cn('rs-badge', s.badgeClass, className)}>
      <span className={cn('rs-status-dot rs-status-dot-sm', `rs-status-dot-${variant}`)} aria-hidden />
      {children}
    </span>
  );
}
