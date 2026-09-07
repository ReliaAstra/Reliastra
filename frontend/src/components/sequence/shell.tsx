'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/site/wordmark';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════════
   INFRASTRUCTURE CONFIGURATION SEQUENCE

   The shell shared by the customer observation setup and the agency client
   setup. It is deliberately not the console shell: during configuration there
   is exactly one thing to do, and a navigation rail full of empty surfaces is
   both a distraction and a lie (there is nothing in them yet).

   What it provides, and nothing else:
   -  a numbered stage rail that always answers "where am I, what is done,
      what remains" without a progress ring or a percentage;
   -  one content column at a readable measure;
   -  a fixed action bar whose left half states what the next action will
      actually do, so no button is a surprise.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Stage {
  id: string;
  /** `01`, `02` … printed as the rail index. */
  index: string;
  label: string;
}

export function SequenceShell({
  eyebrow,
  stages,
  currentStage,
  completed,
  exitHref,
  exitLabel = 'Exit to console',
  onExit,
  children,
}: {
  eyebrow: string;
  stages: Stage[];
  currentStage: string;
  completed: string[];
  exitHref?: string;
  exitLabel?: string;
  onExit?: () => void;
  children: ReactNode;
}) {
  const currentIndex = Math.max(
    0,
    stages.findIndex((s) => s.id === currentStage)
  );
  const progress = stages.length > 1 ? (currentIndex / (stages.length - 1)) * 100 : 100;

  return (
    <div className="obc flex min-h-screen flex-col bg-[var(--obc-void)]">
      <a href="#sequence-main" className="ob-skip">
        Skip to configuration
      </a>

      <header className="border-b border-[var(--obc-line)]">
        <div className="mx-auto flex h-[52px] w-full max-w-[1080px] items-center justify-between gap-4 px-[var(--obc-gutter)]">
          <div className="flex min-w-0 items-center gap-3">
            <Wordmark size="sm" />
            <span aria-hidden className="h-3.5 w-px bg-[var(--obc-line-2)]" />
            <p className="obc-label truncate">{eyebrow}</p>
          </div>
          {onExit ? (
            <button type="button" onClick={onExit} className="obc-label hover:text-[var(--obc-text-2)]">
              {exitLabel}
            </button>
          ) : exitHref ? (
            <Link href={exitHref} className="obc-label hover:text-[var(--obc-text-2)]">
              {exitLabel}
            </Link>
          ) : null}
        </div>
      </header>

      {/* Mobile stage strip */}
      <div className="border-b border-[var(--obc-line)] lg:hidden">
        <div className="mx-auto w-full max-w-[1080px] px-[var(--obc-gutter)] py-3">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[12.5px] text-[var(--obc-text)]">
              <span className="font-[family-name:var(--ob-font-mono)] text-[var(--obc-signal)]">
                {stages[currentIndex]?.index}
              </span>{' '}
              {stages[currentIndex]?.label}
            </p>
            <p className="obc-label">
              stage {currentIndex + 1} of {stages.length}
            </p>
          </div>
          <div className="mt-2.5 h-px w-full bg-[var(--obc-line-2)]">
            <div
              className="h-px bg-[var(--obc-signal)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1080px] flex-1 gap-12 px-[var(--obc-gutter)] py-8 lg:py-14">
        {/* Desktop stage rail */}
        <nav aria-label="Configuration stages" className="hidden w-[210px] shrink-0 lg:block">
          <ol className="relative flex flex-col gap-6 border-l border-[var(--obc-line-2)] pl-5">
            <span
              aria-hidden
              className="absolute -left-px top-0 w-px bg-[var(--obc-signal)] transition-[height] duration-500 ease-out motion-reduce:transition-none"
              style={{ height: `${progress}%` }}
            />
            {stages.map((stage) => {
              const done = completed.includes(stage.id);
              const active = stage.id === currentStage;
              return (
                <li key={stage.id} className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -left-[23px] top-[6px] h-[5px] w-[5px]',
                      active
                        ? 'bg-[var(--obc-signal)]'
                        : done
                          ? 'bg-[var(--obc-text-3)]'
                          : 'bg-[var(--obc-line-3)]'
                    )}
                  />
                  <p
                    className={cn(
                      'font-[family-name:var(--ob-font-mono)] text-[11px] tracking-[0.1em]',
                      active ? 'text-[var(--obc-signal)]' : 'text-[var(--obc-text-4)]'
                    )}
                  >
                    {stage.index}
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-[12.5px] leading-snug',
                      active
                        ? 'font-medium text-[var(--obc-text)]'
                        : done
                          ? 'text-[var(--obc-text-3)]'
                          : 'text-[var(--obc-text-4)]'
                    )}
                  >
                    {stage.label}
                  </p>
                  {done && !active && (
                    <p className="obc-label mt-0.5 text-[var(--obc-ok)]">configured</p>
                  )}
                  {active && <span className="sr-only">(current stage)</span>}
                </li>
              );
            })}
          </ol>
        </nav>

        <main id="sequence-main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

/* ── Stage furniture ─────────────────────────────────────────────────────── */

export function StageHead({
  index,
  title,
  body,
}: {
  index: string;
  title: string;
  body?: ReactNode;
}) {
  return (
    <header className="border-b border-[var(--obc-line-2)] pb-6">
      <p className="obc-label text-[var(--obc-signal)]">{index}</p>
      <h1 className="mt-3 max-w-[24ch] text-[clamp(1.5rem,3.2vw,2.125rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--obc-text)]">
        {title}
      </h1>
      {body && (
        <div className="mt-4 max-w-[68ch] text-[13.5px] leading-[1.7] text-[var(--obc-text-2)]">
          {body}
        </div>
      )}
    </header>
  );
}

/**
 * The action bar. The left column is not decoration: it states the effect of
 * the primary action before it is taken, which is the difference between
 * configuring infrastructure and clicking Continue.
 */
export function StageActions({
  note,
  back,
  children,
}: {
  note?: ReactNode;
  back?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  return (
    <div className="mt-10 flex flex-col gap-4 border-t border-[var(--obc-line-2)] pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-[52ch] text-[12px] leading-[1.6] text-[var(--obc-text-3)]">{note}</p>
      <div className="flex shrink-0 items-center gap-2">
        {back && (
          <button type="button" className="obc-btn" onClick={back.onClick}>
            {back.label}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/** A labelled block inside a stage. Rules, not cards. */
export function StageBlock({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-t border-[var(--obc-line)] py-6 first:border-t-0', className)}>
      <h2 className="obc-label">{title}</h2>
      {hint && (
        <p className="mt-2 max-w-[70ch] text-[12.5px] leading-[1.65] text-[var(--obc-text-3)]">
          {hint}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Selectable option. Square, hairline, no shadow — a control, not a card.
 * `aria-pressed` carries the state so it is announced, not just coloured.
 */
export function OptionButton({
  selected,
  onClick,
  title,
  meta,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  title: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-[46px] w-full flex-col items-start justify-center gap-0.5 border px-3 py-2 text-left transition-colors',
        selected
          ? 'border-[var(--obc-signal)] bg-[var(--obc-signal-wash)]'
          : 'border-[var(--obc-line-2)] hover:border-[var(--obc-line-3)] hover:bg-[var(--obc-raised)]',
        disabled && 'cursor-not-allowed opacity-45'
      )}
    >
      <span
        className={cn(
          'text-[13px]',
          selected ? 'text-[var(--obc-text)]' : 'text-[var(--obc-text-2)]'
        )}
      >
        {title}
      </span>
      {meta && (
        <span className="truncate font-[family-name:var(--ob-font-mono)] text-[11px] text-[var(--obc-text-4)]">
          {meta}
        </span>
      )}
    </button>
  );
}

/** Review row used by the confirmation stage. */
export function ReviewRow({
  label,
  children,
  mono = true,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-[var(--obc-line)] py-3 last:border-b-0 sm:grid-cols-[minmax(140px,200px)_1fr] sm:gap-6">
      <dt className="obc-label pt-[3px]">{label}</dt>
      <dd
        className={cn(
          'min-w-0 break-words text-[12.5px] text-[var(--obc-text)]',
          mono && 'font-[family-name:var(--ob-font-mono)] tabular-nums'
        )}
      >
        {children}
      </dd>
    </div>
  );
}
