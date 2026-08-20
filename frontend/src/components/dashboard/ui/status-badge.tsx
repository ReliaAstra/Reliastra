'use client';

import { cn } from '@/lib/utils';

const MAP: Record<
  string,
  { label: string; color: string; bg: string; border: string; pulse?: string }
> = {
  operational: {
    label: 'Operational',
    color: '#10B981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.2)',
  },
  up: {
    label: 'Operational',
    color: '#10B981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.2)',
  },
  degraded: {
    label: 'Degraded',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.2)',
    pulse: 'rs-pulse-degraded',
  },
  down: {
    label: 'Down',
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.1)',
    border: 'rgba(239,68,68,0.2)',
    pulse: 'rs-pulse-down',
  },
  unknown: {
    label: 'Unknown',
    color: '#64748B',
    bg: 'rgba(100,116,139,0.12)',
    border: 'rgba(100,116,139,0.25)',
  },
  paused: {
    label: 'Paused',
    color: '#64748B',
    bg: 'rgba(100,116,139,0.12)',
    border: 'rgba(100,116,139,0.25)',
  },
};

export function StatusBadge({ status }: { status: string }) {
  const s = MAP[status.toLowerCase()] ?? MAP.unknown;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium leading-none"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      <span
        className={cn('inline-block h-1.5 w-1.5 rounded-full', s.pulse)}
        style={{ background: s.color }}
      />
      {s.label}
    </span>
  );
}
