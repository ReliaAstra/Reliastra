import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SiteFooter } from '@/components/site/site-footer';
import { Wordmark } from '@/components/site/wordmark';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import type { ObservedState } from '@/lib/observatory/format';

/* ═══════════════════════════════════════════════════════════════════════════
   Observatory primitives.

   Server components without exception - the public record must arrive as HTML.
   The only client code on these pages is the elapsed-time readout and the
   telemetry cursor, and both hydrate around content that is already painted.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Shell ──────────────────────────────────────────────────────────────── */

/**
 * The observatory chrome.
 *
 * Navigation is deliberately not the marketing header: a reader who lands here
 * during an outage is looking at a measurement record, and a product menu over
 * it is noise. Wordmark, the index, one contextual action. The global footer
 * is shared with the rest of the site, so the full link graph is still one
 * click away and every href still resolves from `lib/routes`.
 */
export function ObservatoryShell({
  children,
  breadcrumbTrail,
}: {
  children: ReactNode;
  breadcrumbTrail?: ReactNode;
}) {
  return (
    <div className="ob obs flex min-h-screen flex-col">
      <a href="#main" className="ob-skip">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-[var(--ob-line)] bg-[var(--ob-void)]/95 supports-[backdrop-filter]:bg-[var(--ob-void)]/85 supports-[backdrop-filter]:backdrop-blur-sm">
        <div className="ob-container">
          <div className="flex h-[56px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <Link href={PUBLIC_ROUTES.home} aria-label="RELIASTRA home" className="shrink-0 py-2">
                <Wordmark size="sm" />
              </Link>
              <span aria-hidden className="h-4 w-px shrink-0 bg-[var(--ob-line-2)]" />
              <Link
                href={PUBLIC_ROUTES.track}
                className="ob-label truncate transition-colors hover:text-[var(--ob-signal)]"
              >
                Observatory
              </Link>
            </div>
            <div className="flex shrink-0 items-center gap-5">
              <Link
                href={PUBLIC_ROUTES.externalDependencyIntelligence}
                className="ob-label hidden transition-colors hover:text-[var(--ob-text)] sm:inline"
              >
                What this measures
              </Link>
              <Link
                href={AUTH_ROUTES.signup}
                className="ob-label obs-label-signal transition-colors hover:text-[var(--ob-text)]"
              >
                Monitor your dependencies
              </Link>
            </div>
          </div>
        </div>
        {breadcrumbTrail}
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}

/* ── Sections ───────────────────────────────────────────────────────────── */

/**
 * A numbered section of the record. The index column is the spine of the page:
 * it makes a long, dense document navigable at a glance and signals "report",
 * not "dashboard".
 */
export function RecordSection({
  index,
  title,
  id,
  note,
  aside,
  children,
  tone = 'void',
  className,
}: {
  index: string;
  title: string;
  id: string;
  note?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  tone?: 'void' | 'base';
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className={cn(
        'obs-section',
        tone === 'base' ? 'bg-[var(--ob-base)]' : 'bg-[var(--ob-void)]',
        className
      )}
    >
      <div className="ob-container pb-14 md:pb-20">
        <div className="obs-head">
          <p className="obs-index" aria-hidden>
            {index}
          </p>
          <div className="flex flex-col gap-3">
            <h2 id={`${id}-h`} className="obs-h">
              {title}
            </h2>
            {note && <div className="obs-note max-w-[68ch]">{note}</div>}
          </div>
          {aside && <div className="flex flex-col gap-2 md:items-end">{aside}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

/* ── Figures ────────────────────────────────────────────────────────────── */

/**
 * A measured value with its label and unit.
 *
 * `muted` is set by the caller when the value is a sentinel ("no data",
 * "insufficient data") so an absence never renders with the visual weight of a
 * measurement.
 */
export function Readout({
  label,
  value,
  unit,
  note,
  size = 'md',
  state,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: ReactNode;
  size?: 'md' | 'lg';
  state?: ObservedState;
  className?: string;
}) {
  const muted = isSentinel(value);
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="ob-label">{label}</span>
      <span
        className={cn(
          'obs-num',
          size === 'lg' ? 'obs-num-lg' : 'obs-num-md',
          muted && 'obs-void text-[0.8125rem] leading-[1.3]'
        )}
        style={
          !muted && state && state !== 'unknown'
            ? { color: `var(--ob-${state === 'healthy' ? 'healthy' : state})` }
            : undefined
        }
      >
        {value}
        {!muted && unit && <span className="obs-unit">{unit}</span>}
      </span>
      {note && <span className="ob-small">{note}</span>}
    </div>
  );
}

const SENTINELS = ['no data', 'no observation', 'not recorded', 'insufficient data'];

export function isSentinel(value: string): boolean {
  return SENTINELS.includes(value.toLowerCase());
}

/** Inline value that greys itself out when it is a sentinel rather than a fact. */
export function Value({
  children,
  className,
  mono = true,
}: {
  children: string;
  className?: string;
  mono?: boolean;
}) {
  const muted = isSentinel(children);
  return (
    <span
      className={cn(
        mono && 'obs-num obs-num-sm',
        muted && 'obs-void',
        !muted && 'text-[var(--ob-text)]',
        className
      )}
    >
      {children}
    </span>
  );
}

/* ── State ──────────────────────────────────────────────────────────────── */

/** Status is dot + word, always. Colour never carries the meaning alone. */
export function StateWord({
  state,
  word,
  size = 'md',
  className,
}: {
  state: ObservedState;
  word: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cn('obs-state', size === 'sm' && 'obs-state-sm', className)}
      data-state={state}
    >
      <span className="ob-dot" data-state={state} />
      {word}
    </span>
  );
}

/* ── Definition rows ────────────────────────────────────────────────────── */

export function SpecRow({
  term,
  children,
  wide = false,
}: {
  term: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid gap-1.5 border-t border-[var(--ob-line)] py-4 sm:gap-8',
        wide ? 'sm:grid-cols-[minmax(160px,240px)_1fr]' : 'sm:grid-cols-[minmax(140px,200px)_1fr]'
      )}
    >
      <dt className="ob-label pt-[3px]">{term}</dt>
      <dd className="max-w-[70ch] text-[13.5px] leading-[1.7] text-[var(--ob-text-2)]">
        {children}
      </dd>
    </div>
  );
}

/* ── Empty / failure ────────────────────────────────────────────────────── */

export function Notice({
  kind = 'note',
  title,
  children,
}: {
  kind?: 'note' | 'error';
  title: string;
  children: ReactNode;
}) {
  return (
    <div role="status" className={cn('ob-alert', kind === 'error' ? 'ob-alert-error' : 'ob-alert-note')}>
      <p className="ob-label mb-2">{title}</p>
      <div className="max-w-[70ch] text-[13.5px] leading-[1.65] text-[var(--ob-text-2)]">
        {children}
      </div>
    </div>
  );
}

/* ── Record table ───────────────────────────────────────────────────────── */

export interface RecordColumn<T> {
  key: string;
  head: string;
  /** CSS grid track for this column at md and above. */
  width: string;
  align?: 'left' | 'right';
  cell: (row: T) => ReactNode;
  /**
   * How the column behaves below md, where a six-column grid cannot fit:
   *  - `lead`   : the row's headline, printed full width
   *  - `trail`  : sits opposite the headline on the same line
   *  - `pair`   : label/value pair in the two-column detail grid (default)
   *  - `hidden` : dropped on small screens (only for values repeated elsewhere)
   */
  mobile?: 'lead' | 'trail' | 'pair' | 'hidden';
}

/**
 * The one tabular primitive on the observatory.
 *
 * Above md it is a real ruled grid - aligned columns are the entire point of
 * publishing measurements. Below md the same rows become label/value records,
 * because a horizontally scrolling table on a phone is how a reader loses the
 * one number they came for.
 */
export function RecordTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  rowHref,
  from = 'md',
}: {
  columns: RecordColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: ReactNode;
  rowHref?: (row: T) => string | null;
  /**
   * Viewport at which the grid appears. Six or seven columns do not fit a
   * 768px tablet without crushing a title column into an ellipsis, so wide
   * tables stay in record form until 1024.
   */
  from?: 'md' | 'lg' | 'xl';
}) {
  const template = columns.map((c) => c.width).join(' ');
  const gridAt =
    from === 'xl' ? 'hidden xl:block' : from === 'lg' ? 'hidden lg:block' : 'hidden md:block';
  const stackBelow =
    from === 'xl'
      ? 'flex flex-col xl:hidden'
      : from === 'lg'
        ? 'flex flex-col lg:hidden'
        : 'flex flex-col md:hidden';
  const lead = columns.filter((c) => c.mobile === 'lead');
  const trail = columns.filter((c) => c.mobile === 'trail');
  const pairs = columns.filter((c) => !c.mobile || c.mobile === 'pair');

  return (
    <div className="flex flex-col">
      {/* Desktop: ruled grid */}
      <div className={gridAt}>
        <div
          className="obs-rowhead"
          style={{ gridTemplateColumns: template }}
          role="presentation"
        >
          {columns.map((c) => (
            <span key={c.key} className={cn('ob-label', c.align === 'right' && 'obs-r')}>
              {c.head}
            </span>
          ))}
        </div>
        <div className="obs-rows">
          {rows.map((row) => {
            const href = rowHref?.(row) ?? null;
            const cells = columns.map((c) => (
              <span key={c.key} className={cn('min-w-0 truncate', c.align === 'right' && 'obs-r')}>
                {c.cell(row)}
              </span>
            ));
            return href ? (
              <Link
                key={rowKey(row)}
                href={href}
                className="obs-row"
                style={{ gridTemplateColumns: template }}
              >
                {cells}
              </Link>
            ) : (
              <div
                key={rowKey(row)}
                className="obs-row"
                style={{ gridTemplateColumns: template }}
              >
                {cells}
              </div>
            );
          })}
        </div>
      </div>

      {/* Below the breakpoint: stacked records */}
      <div className={stackBelow}>
        {rows.map((row) => {
          const href = rowHref?.(row) ?? null;
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  {lead.map((c) => (
                    <span key={c.key} className="min-w-0 text-[13.5px] text-[var(--ob-text)]">
                      {c.cell(row)}
                    </span>
                  ))}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {trail.map((c) => (
                    <span key={c.key}>{c.cell(row)}</span>
                  ))}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-2">
                {pairs.map((c) => (
                  <div key={c.key} className="flex min-w-0 flex-col gap-0.5">
                    <dt className="ob-label">{c.head}</dt>
                    <dd className="min-w-0 truncate">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </>
          );
          return href ? (
            <Link
              key={rowKey(row)}
              href={href}
              className="flex flex-col gap-2.5 border-t border-[var(--ob-line)] py-3.5"
            >
              {body}
            </Link>
          ) : (
            <div
              key={rowKey(row)}
              className="flex flex-col gap-2.5 border-t border-[var(--ob-line)] py-3.5"
            >
              {body}
            </div>
          );
        })}
        <span className="border-t border-[var(--ob-line)]" />
      </div>

      {caption && <p className="ob-small mt-4">{caption}</p>}
    </div>
  );
}
