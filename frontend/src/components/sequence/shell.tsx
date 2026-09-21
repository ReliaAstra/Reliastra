'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/site/wordmark';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════════
   INFRASTRUCTURE CONFIGURATION SEQUENCE

   The shell for the customer observation setup. It is deliberately not the
   console shell: during configuration there
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
    <div className="obc flex min-h-screen flex-col bg-rs-base">
      <a href="#sequence-main" className="ob-skip">
        Skip to configuration
      </a>

      <header className="border-b border-rs-border-subtle">
        <div className="mx-auto flex h-[52px] w-full max-w-[1080px] items-center justify-between gap-4 px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Wordmark size="sm" />
            <span aria-hidden className="h-3.5 w-px bg-rs-border-subtle" />
            <p className="rs-label truncate">{eyebrow}</p>
          </div>
          {onExit ? (
            <button type="button" onClick={onExit} className="rs-label hover:text-rs-text-secondary">
              {exitLabel}
            </button>
          ) : exitHref ? (
            <Link href={exitHref} className="rs-label hover:text-rs-text-secondary">
              {exitLabel}
            </Link>
          ) : null}
        </div>
      </header>

      {/* Mobile stage strip */}
      <div className="border-b border-rs-border-subtle lg:hidden">
        <div className="mx-auto w-full max-w-[1080px] px-6 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[12.5px] text-rs-text">
              <span className="font-[family-name:var(--ob-font-mono)] text-rs-brand">
                {stages[currentIndex]?.index}
              </span>{' '}
              {stages[currentIndex]?.label}
            </p>
            <p className="rs-label">
              stage {currentIndex + 1} of {stages.length}
            </p>
          </div>
          <div className="mt-2.5 h-px w-full bg-rs-border-subtle">
            <div
              className="h-px bg-rs-brand transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1080px] flex-1 gap-12 px-6 py-8 lg:py-14">
        {/* Desktop stage rail */}
        <nav aria-label="Configuration stages" className="hidden w-[210px] shrink-0 lg:block">
          <ol className="relative flex flex-col gap-6 border-l border-rs-border-subtle pl-5">
            <span
              aria-hidden
              className="absolute -left-px top-0 w-px bg-rs-brand transition-[height] duration-500 ease-out motion-reduce:transition-none"
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
                        ? 'bg-rs-brand'
                        : done
                          ? 'bg-rs-text-tertiary'
                          : 'bg-rs-border'
                    )}
                  />
                  <p
                    className={cn(
                      'font-[family-name:var(--ob-font-mono)] text-[11px] tracking-[0.1em]',
                      active ? 'text-rs-brand' : 'text-rs-text-tertiary'
                    )}
                  >
                    {stage.index}
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-[12.5px] leading-snug',
                      active
                        ? 'font-medium text-rs-text'
                        : done
                          ? 'text-rs-text-tertiary'
                          : 'text-rs-text-tertiary'
                    )}
                  >
                    {stage.label}
                  </p>
                  {done && !active && (
                    <p className="rs-label mt-0.5 text-rs-up">configured</p>
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
    <header className="border-b border-rs-border-subtle pb-6">
      <p className="rs-label text-rs-brand">{index}</p>
      <h1 className="mt-3 max-w-[24ch] text-[clamp(1.5rem,3.2vw,2.125rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-rs-text">
        {title}
      </h1>
      {body && (
        <div className="mt-4 max-w-[68ch] text-[13.5px] leading-[1.7] text-rs-text-secondary">
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
    <div className="mt-10 flex flex-col gap-4 border-t border-rs-border-subtle pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-[52ch] text-[12px] leading-[1.6] text-rs-text-tertiary">{note}</p>
      <div className="flex shrink-0 items-center gap-2">
        {back && (
          <button type="button" className="rs-button" onClick={back.onClick}>
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
    <section className={cn('border-t border-rs-border-subtle py-6 first:border-t-0', className)}>
      <h2 className="rs-label">{title}</h2>
      {hint && (
        <p className="mt-2 max-w-[70ch] text-[12.5px] leading-[1.65] text-rs-text-tertiary">
          {hint}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Selectable option. Square, hairline, no shadow - a control, not a card.
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
          ? 'border-rs-brand bg-rs-brand-subtle'
          : 'border-rs-border-subtle hover:border-rs-border hover:bg-rs-hover',
        disabled && 'cursor-not-allowed opacity-45'
      )}
    >
      <span
        className={cn(
          'text-[13px]',
          selected ? 'text-rs-text' : 'text-rs-text-secondary'
        )}
      >
        {title}
      </span>
      {meta && (
        <span className="truncate font-[family-name:var(--ob-font-mono)] text-[11px] text-rs-text-tertiary">
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
    <div className="grid grid-cols-1 gap-1 border-b border-rs-border-subtle py-3 last:border-b-0 sm:grid-cols-[minmax(140px,200px)_1fr] sm:gap-6">
      <dt className="rs-label pt-[3px]">{label}</dt>
      <dd
        className={cn(
          'min-w-0 break-words text-[12.5px] text-rs-text',
          mono && 'font-[family-name:var(--ob-font-mono)] tabular-nums'
        )}
      >
        {children}
      </dd>
    </div>
  );
}
