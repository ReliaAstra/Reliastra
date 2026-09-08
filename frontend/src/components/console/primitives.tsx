'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Console primitives — the whole vocabulary of the operational surface.
 *
 * There are deliberately few of these, and none of them is a card. Structure
 * in this application comes from rules and background steps; anything that
 * looks like a floating tile with a shadow has been removed. If a new screen
 * needs a shape that is not here, the right move is usually to compose two of
 * these rather than to invent a ninth container.
 */

/* ── System state ─────────────────────────────────────────────────────── */

export type SystemState = 'ok' | 'warn' | 'crit' | 'idle';

/**
 * Map every status string the backend can produce onto the four operational
 * states. Anything unrecognised becomes `idle` (unknown) — never `ok`, because
 * defaulting an unknown state to healthy is how a monitoring product lies.
 */
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

/**
 * Prefer the backend's own word when it is one we recognise.
 *
 * A dependency that the API reports as `down` should read "Down", not
 * "Critical" — "critical" is incident severity language and using it for a
 * host state made the health table and the incident table disagree about the
 * same event. Only genuinely unrecognised values fall back to the state word.
 */
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

/**
 * Status is a dot **and** a word, always. Colour alone fails colour-blind
 * users and fails a printed evidence export, so the word is not optional and
 * is never visually hidden.
 */
export function State({
  status,
  label,
  live = false,
  className,
}: {
  status: string | null | undefined;
  /** Override the word — e.g. an incident's own `investigating`. */
  label?: string;
  /** Pulse the dot. Reserve for genuinely active incidents. */
  live?: boolean;
  className?: string;
}) {
  const state = toState(status);
  const key = (status ?? '').toLowerCase();
  const word = label ?? EXACT_WORD[key] ?? STATE_WORD[state];
  return (
    <span
      className={cn('obc-state', live && state !== 'ok' && 'obc-live', className)}
      data-state={state}
    >
      <span className="obc-dot" aria-hidden />
      <span>{word}</span>
    </span>
  );
}

/* ── Page furniture ───────────────────────────────────────────────────── */

/**
 * Page header. `meta` is a row of key/value facts rendered inline rather than
 * as tiles — the header states what this object is, not how it is doing.
 */
export function PageHead({
  eyebrow,
  title,
  meta,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-[var(--obc-line-2)] py-6 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="obc-label mb-2">{eyebrow}</p>}
        <h1 className="obc-title">{title}</h1>
        {meta && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">{meta}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** One labelled fact. The unit lives with the number, never in the label. */
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
      <span className="obc-label">{label}</span>
      <span
        className={cn(
          'text-[13px] text-[var(--obc-text)]',
          mono && 'font-[family-name:var(--ob-font-mono)] tabular-nums',
          state === 'crit' && 'text-[#E58C85]',
          state === 'warn' && 'text-[#E3BE7A]'
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
    <section className="obc-section" id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="obc-section-head">
        <div className="min-w-0">
          <h2 className="obc-h2" id={id ? `${id}-h` : undefined}>
            {title}
          </h2>
          {hint && <p className="obc-body mt-1 text-[12px]">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A plain right-aligned text link for section headers. */
export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--obc-text-4)] transition-colors hover:text-[var(--obc-signal)]"
    >
      {children}
    </Link>
  );
}

/* ── Readouts ─────────────────────────────────────────────────────────── */

/**
 * A single measurement. Renders `no data` rather than a zero when the value
 * is absent: a monitoring product that prints 0 ms for "never checked" is
 * reporting a measurement it does not have.
 */
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
  const missing = value == null || value === '' || value === '-';
  return (
    <div className="min-w-0">
      <p className="obc-label">{label}</p>
      <p
        className={cn(
          'obc-figure mt-2',
          missing && 'text-[var(--obc-text-4)]',
          state === 'crit' && 'text-[#E58C85]',
          state === 'warn' && 'text-[#E3BE7A]',
          state === 'ok' && 'text-[var(--obc-text)]'
        )}
      >
        {missing ? <span className="text-[15px] font-normal">no data</span> : value}
        {!missing && unit && <span className="obc-unit">{unit}</span>}
      </p>
      {sub && <p className="mt-1.5 text-[11px] text-[var(--obc-text-4)]">{sub}</p>}
    </div>
  );
}

/** Definition row for detail pages: label left, value right, hairline under. */
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
    <div className="flex items-start justify-between gap-6 border-b border-[var(--obc-line)] py-2.5 last:border-b-0">
      <dt className="shrink-0 text-[12px] text-[var(--obc-text-4)]">{label}</dt>
      <dd
        className={cn(
          'min-w-0 break-words text-right text-[12.5px] text-[var(--obc-text-2)]',
          mono && 'font-[family-name:var(--ob-font-mono)] tabular-nums'
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/* ── Empty / loading / error ──────────────────────────────────────────── */

/**
 * Empty states say what the surface is for and how to populate it. No
 * illustration, no emoji, no "nothing here yet".
 */
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
    <div className="border border-[var(--obc-line)] bg-[var(--obc-base)] px-6 py-10">
      <p className="obc-label text-[var(--obc-text-3)]">{title}</p>
      <p className="obc-body mt-3 max-w-[62ch]">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Error state. Technical, specific, actionable — and it never relays a raw
 * backend message, which can carry internal detail a customer must not see.
 */
export function Failure({
  title = 'Observation unavailable',
  body,
  lastGood,
  onRetry,
}: {
  title?: string;
  body: string;
  /** Formatted timestamp of the last successful read, if one is known. */
  lastGood?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="border border-[var(--obc-crit)]/35 bg-[var(--obc-crit-wash)] px-5 py-4"
    >
      <p className="obc-label text-[#E58C85]">{title}</p>
      <p className="obc-body mt-2 max-w-[62ch] text-[var(--obc-text-2)]">{body}</p>
      {lastGood && (
        <p className="obc-mono mt-2 text-[var(--obc-text-3)]">
          Last successful observation: {lastGood}
        </p>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} className="obc-btn obc-btn-sm mt-4">
          Retry
        </button>
      )}
    </div>
  );
}

/** Row-shaped skeleton: the console is tables, so loading looks like tables. */
export function RowsSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy="true" aria-label="Retrieving telemetry" className="border border-[var(--obc-line)]">
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex h-10 items-center gap-4 border-b border-[var(--obc-line)] px-3 last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="obc-skel h-2"
              style={{ width: c === 0 ? '28%' : `${8 + ((r + c) % 3) * 4}%`, animationDelay: `${(r * cols + c) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function BlockSkeleton({ height = 120 }: { height?: number }) {
  return <div className="obc-skel w-full" style={{ height }} aria-busy="true" />;
}
