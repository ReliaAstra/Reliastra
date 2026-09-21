'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* ── System state ─────────────────────────────────────────────────────── */

export type SystemState = 'ok' | 'warn' | 'crit' | 'idle';

export function toState(raw: string | null | undefined): SystemState {
  switch ((raw ?? '').toLowerCase()) {
    case 'operational':
    case 'up':
    case 'resolved':
    case 'healthy':
      return 'ok';
    case 'degraded':
    case 'investigating':
    case 'minor':
      return 'warn';
    case 'down':
    case 'open':
    case 'critical':
    case 'major':
      return 'crit';
    default:
      return 'idle';
  }
}

const STATE_WORD: Record<SystemState, string> = {
  ok: 'Operational',
  warn: 'Degraded',
  crit: 'Critical',
  idle: 'Unknown',
};

const EXACT_WORD: Record<string, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  paused: 'Paused',
  stale: 'No recent data',
  unknown: 'Unknown',
  open: 'Open',
  investigating: 'Investigating',
  resolved: 'Resolved',
  false_positive: 'False positive',
};

export function State({
  status,
  label,
  live = false,
  className,
}: {
  status: string | null | undefined;
  label?: string;
  live?: boolean;
  className?: string;
}) {
  const state = toState(status);
  const key = (status ?? '').toLowerCase();
  const word = label ?? EXACT_WORD[key] ?? STATE_WORD[state];

  const dotClass =
    state === 'ok'
      ? 'rs-status-dot-up'
      : state === 'warn'
        ? 'rs-status-dot-degraded'
        : state === 'crit'
          ? 'rs-status-dot-down'
          : 'rs-status-dot-unknown';

  const badgeClass =
    state === 'ok'
      ? 'rs-badge-up'
      : state === 'warn'
        ? 'rs-badge-degraded'
        : state === 'crit'
          ? 'rs-badge-down'
          : 'rs-badge-unknown';

  const pulseClass =
    live && state !== 'ok'
      ? state === 'warn'
        ? 'rs-pulse-degraded'
        : state === 'crit'
          ? 'rs-pulse-down'
          : ''
      : '';

  return (
    <span className={cn('rs-badge', badgeClass, className)} data-state={state}>
      <span className={cn('rs-status-dot rs-status-dot-sm', dotClass, pulseClass)} aria-hidden />
      <span>{word}</span>
    </span>
  );
}

/* ── Page furniture ───────────────────────────────────────────────────── */

export function PageHead({
  eyebrow,
  title,
  description,
  meta,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-rs-border-subtle py-6 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="rs-label mb-1.5">{eyebrow}</p>}
        <h1 className="rs-page-title">{title}</h1>
        {description && (
          <p className="rs-secondary-body mt-1.5 max-w-[68ch] !text-rs-text-secondary">{description}</p>
        )}
        {meta && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">{meta}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  unit,
  sub,
  state,
  icon,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  state?: SystemState;
  icon?: ReactNode;
}) {
  const tileClass =
    state === 'crit'
      ? 'rs-stat-icon-down'
      : state === 'warn'
        ? 'rs-stat-icon-degraded'
        : state === 'ok'
          ? 'rs-stat-icon-up'
          : 'rs-stat-icon-brand';

  return (
    <div className="rs-stat-card">
      <div className={cn('rs-stat-icon-tile', tileClass)} aria-hidden>
        {icon ?? <span className="rs-mono text-[14px] font-bold">{String(label).slice(0, 2).toUpperCase()}</span>}
      </div>
      <p className="rs-stat-label">{label}</p>
      <p className="rs-stat-value">
        {value}
        {unit && <span className="ml-1 text-[12px] font-normal text-rs-text-tertiary">{unit}</span>}
      </p>
      {sub && <p className="rs-stat-context">{sub}</p>}
    </div>
  );
}

export function Fact({
  label,
  value,
  mono = true,
  state,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  state?: SystemState;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="rs-label">{label}</span>
      <span
        className={cn(
          'text-[13px] text-rs-text',
          mono && 'rs-mono',
          state === 'crit' && 'text-rs-down',
          state === 'warn' && 'text-rs-degraded'
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function Section({
  title,
  hint,
  action,
  children,
  id,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="rs-section-spacing" id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="rs-section-title" id={id ? `${id}-h` : undefined}>
            {title}
          </h2>
          {hint && <p className="rs-secondary-body mt-1 !text-rs-text-tertiary">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="rs-card overflow-hidden">{children}</div>
    </section>
  );
}

export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary transition-colors hover:text-rs-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2"
    >
      {children}
    </Link>
  );
}

/* ── Readouts ─────────────────────────────────────────────────────────── */

export function Readout({
  label,
  value,
  unit,
  sub,
  state,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  sub?: string;
  state?: SystemState;
}) {
  const missing = value == null || value === '' || value === '-' || value === '—';
  return (
    <div className="min-w-0">
      <p className="rs-label">{label}</p>
      <p
        className={cn(
          'rs-kpi-value-sm mt-2',
          missing && '!text-[15px] !font-normal !text-rs-text-tertiary',
          state === 'crit' && 'text-rs-down',
          state === 'warn' && 'text-rs-degraded'
        )}
      >
        {missing ? <span>—</span> : value}
        {!missing && unit && <span className="ml-1 text-[12px] font-normal text-rs-text-tertiary">{unit}</span>}
      </p>
      {sub && <p className="mt-1.5 text-[11px] text-rs-text-tertiary">{sub}</p>}
    </div>
  );
}

export function Row({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-rs-border-subtle py-2.5 last:border-b-0">
      <dt className="shrink-0 text-[12.5px] text-rs-text-tertiary">{label}</dt>
      <dd
        className={cn(
          'min-w-0 break-words text-right text-[13px] text-rs-text-secondary',
          mono && 'rs-mono'
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/* ── Empty / loading / error ──────────────────────────────────────────── */

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-10">
      <p className="text-[15px] font-semibold text-rs-text">{title}</p>
      <p className="rs-secondary-body mt-2 max-w-[62ch] !text-rs-text-secondary">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Failure({
  title = 'Observation unavailable',
  body,
  lastGood,
  onRetry,
}: {
  title?: string;
  body: string;
  lastGood?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-[10px] border border-rs-down/20 bg-rs-down-bg px-5 py-4"
    >
      <p className="text-[14px] font-semibold text-rs-down">{title}</p>
      <p className="rs-secondary-body mt-2 max-w-[62ch] !text-rs-text-secondary">{body}</p>
      {lastGood && (
        <p className="rs-mono mt-2 text-[12px] text-rs-text-tertiary">
          Last successful observation: {lastGood}
        </p>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} className="rs-button rs-button-secondary rs-button-sm mt-4">
          Retry
        </button>
      )}
    </div>
  );
}

export function RowsSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy="true" aria-label="Retrieving telemetry" className="border border-rs-border-subtle bg-rs-elevated">
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex h-10 items-center gap-4 border-b border-rs-border-subtle px-3 last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="rs-skeleton h-2"
              style={{ width: c === 0 ? '28%' : `${8 + ((r + c) % 3) * 4}%`, animationDelay: `${(r * cols + c) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function BlockSkeleton({ height = 120 }: { height?: number }) {
  return <div className="rs-skeleton w-full" style={{ height }} aria-busy="true" />;
}
