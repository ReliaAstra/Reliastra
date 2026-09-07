import Link from 'next/link';
import type { ComponentProps, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════════
   RELIASTRA public-site primitives.

   One button. One eyebrow. One section header. One data row. Everything on
   the public site composes from this file, which is the only way a design
   system survives contact with twenty-plus pages.

   All of these are server components - no 'use client'. Static marketing
   content must not cost the visitor a hydration pass.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Containers ─────────────────────────────────────────────────────────── */

export function Container({
  children,
  width = 'wide',
  className,
}: {
  children: ReactNode;
  width?: 'wide' | 'narrow' | 'read';
  className?: string;
}) {
  return (
    <div
      className={cn(
        width === 'wide' && 'ob-container',
        width === 'narrow' && 'ob-container-narrow',
        width === 'read' && 'ob-container-read',
        className
      )}
    >
      {children}
    </div>
  );
}

export function Section({
  children,
  id,
  tone = 'void',
  divider = true,
  tight = false,
  className,
  'aria-labelledby': labelledBy,
}: {
  children: ReactNode;
  id?: string;
  /** Surface tone. Alternating bands replace card-per-section layout. */
  tone?: 'void' | 'base' | 'raised';
  divider?: boolean;
  tight?: boolean;
  className?: string;
  'aria-labelledby'?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        tight ? 'ob-section-tight' : 'ob-section',
        tone === 'void' && 'bg-[var(--ob-void)]',
        tone === 'base' && 'bg-[var(--ob-base)]',
        tone === 'raised' && 'bg-[var(--ob-raised)]',
        divider && 'border-t border-[var(--ob-line)]',
        className
      )}
    >
      {children}
    </section>
  );
}

/* ── Labels & headers ───────────────────────────────────────────────────── */

/**
 * Small uppercase technical label. `index` renders the section number as a
 * separate token so the eye can use it as a spine down the page.
 */
export function Eyebrow({
  children,
  index,
  signal = false,
  className,
}: {
  children: ReactNode;
  index?: string;
  signal?: boolean;
  className?: string;
}) {
  return (
    <p className={cn('ob-label flex items-center gap-3', className)}>
      {index && (
        <>
          <span className="text-[var(--ob-signal)]">{index}</span>
          <span aria-hidden className="h-px w-6 bg-[var(--ob-line-2)]" />
        </>
      )}
      <span className={cn(signal && 'text-[var(--ob-signal)]')}>{children}</span>
    </p>
  );
}

export function SectionHeader({
  index,
  eyebrow,
  title,
  lede,
  as: Heading = 'h2',
  id,
  align = 'left',
  className,
  children,
}: {
  index?: string;
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  as?: ElementType;
  id?: string;
  align?: 'left' | 'center';
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-5',
        align === 'center' && 'items-center text-center',
        className
      )}
    >
      {eyebrow && <Eyebrow index={index}>{eyebrow}</Eyebrow>}
      <Heading id={id} className="ob-h2 max-w-[19ch]">
        {title}
      </Heading>
      {lede && (
        <p className={cn('ob-lede', align === 'center' && 'mx-auto')}>{lede}</p>
      )}
      {children}
    </div>
  );
}

/* ── Buttons ────────────────────────────────────────────────────────────── */

type ButtonTone = 'primary' | 'signal' | 'outline';

const toneClass: Record<ButtonTone, string> = {
  primary: 'ob-btn-primary',
  signal: 'ob-btn-signal',
  outline: 'ob-btn-outline',
};

/** Link that looks like a button. The only CTA element on the public site. */
export function CTA({
  href,
  children,
  tone = 'primary',
  size = 'md',
  block = false,
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
  tone?: ButtonTone;
  size?: 'sm' | 'md';
  block?: boolean;
  className?: string;
} & Omit<ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  const classes = cn(
    'ob-btn',
    toneClass[tone],
    size === 'sm' && 'ob-btn-sm',
    block && 'ob-btn-block',
    className
  );

  if (/^(https?:|mailto:|tel:)/.test(href)) {
    return (
      <a
        href={href}
        className={classes}
        {...(href.startsWith('http')
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {})}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}

/** Understated inline "next step" link with a persistent rule. */
export function ArrowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex items-center gap-2 border-b border-[var(--ob-line-2)] pb-1 text-[13px] font-medium tracking-[0.02em] text-[var(--ob-text)] transition-colors hover:border-[var(--ob-signal)]',
        className
      )}
    >
      {children}
      <span
        aria-hidden
        className="inline-block transition-transform duration-200 group-hover:translate-x-1"
      >
        →
      </span>
    </Link>
  );
}

/* ── Rules & marks ──────────────────────────────────────────────────────── */

export function Rule({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-[var(--ob-line)]', className)} />;
}

/* ── System state ───────────────────────────────────────────────────────── */

export type SystemState = 'healthy' | 'degraded' | 'critical' | 'unknown';

/** Map any backend status string onto the four states the site can render. */
export function toSystemState(raw: string | null | undefined): SystemState {
  const s = (raw || '').toLowerCase();
  if (!s) return 'unknown';
  if (s === 'up' || s === 'operational' || s === 'healthy') return 'healthy';
  if (s.includes('degrad') || s.includes('partial')) return 'degraded';
  if (s.includes('down') || s.includes('outage') || s.includes('critical'))
    return 'critical';
  return 'unknown';
}

export const STATE_LABEL: Record<SystemState, string> = {
  healthy: 'Operational',
  degraded: 'Degraded',
  critical: 'Down',
  unknown: 'Unknown',
};

/**
 * Status is always dot + word. Colour alone never carries meaning - that is a
 * WCAG requirement and, on a monitoring product, also just correct.
 */
export function StateIndicator({
  state,
  label,
  live = false,
  className,
}: {
  state: SystemState;
  label?: string;
  live?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('ob-state', className)} data-state={state}>
      <span className="relative inline-flex">
        <span className="ob-dot" data-state={state} />
        {live && state !== 'unknown' && (
          <span className="ob-live absolute inset-0" aria-hidden />
        )}
      </span>
      {label ?? STATE_LABEL[state]}
    </span>
  );
}

/* ── Data display ───────────────────────────────────────────────────────── */

/**
 * A measured value with its label. Tabular numerals, so a column of these
 * aligns on the decimal down the whole page.
 */
export function Metric({
  label,
  value,
  note,
  state,
  className,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  state?: SystemState;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <span className="ob-label">{label}</span>
      <span
        className="ob-figure"
        style={
          state && state !== 'unknown'
            ? { color: `var(--ob-${state === 'critical' ? 'critical' : state})` }
            : undefined
        }
      >
        {value}
      </span>
      {note && <span className="ob-small">{note}</span>}
    </div>
  );
}

/** Label / value row used for specification tables and methodology blocks. */
export function DataRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-2 border-t border-[var(--ob-line)] py-4 sm:grid-cols-[minmax(140px,220px)_1fr] sm:gap-8',
        className
      )}
    >
      <dt className="ob-label pt-1">{label}</dt>
      <dd className="text-[14px] leading-[1.65] text-[var(--ob-text-2)]">{children}</dd>
    </div>
  );
}

/* ── Breadcrumbs ────────────────────────────────────────────────────────── */

export function Breadcrumb({
  items,
  className,
}: {
  items: { name: string; href: string }[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="ob-label flex flex-wrap items-center gap-2">
        {items.map((item, i) => (
          <li key={item.href} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden className="text-[var(--ob-line-3)]">
                /
              </span>
            )}
            {i === items.length - 1 ? (
              <span aria-current="page" className="text-[var(--ob-text-3)]">
                {item.name}
              </span>
            ) : (
              <Link
                href={item.href}
                className="transition-colors hover:text-[var(--ob-signal)]"
              >
                {item.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ── Editorial cards (research, related links) ──────────────────────────── */

/**
 * A card only exists where the content is genuinely a discrete, clickable
 * record. Everything else on the site is laid out with rules and space.
 */
export function RecordLink({
  href,
  kicker,
  title,
  summary,
  meta,
  className,
}: {
  href: string;
  kicker?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col gap-3 border-t border-[var(--ob-line)] py-7 transition-colors hover:border-[var(--ob-line-3)]',
        className
      )}
    >
      {kicker && <div className="ob-label">{kicker}</div>}
      <h3 className="ob-h3 transition-colors group-hover:text-[var(--ob-signal)]">
        {title}
      </h3>
      {summary && (
        <p className="max-w-[64ch] text-[14.5px] leading-[1.65] text-[var(--ob-text-3)]">
          {summary}
        </p>
      )}
      {meta && <div className="ob-label pt-1">{meta}</div>}
    </Link>
  );
}

/* ── Page CTA band ──────────────────────────────────────────────────────── */

export function CTABand({
  title,
  body,
  primary = { href: '/signup', label: 'Start monitoring' },
  secondary,
  tone = 'base',
}: {
  title: string;
  body: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  tone?: 'void' | 'base' | 'raised';
}) {
  return (
    <Section tone={tone} tight>
      <Container>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4">
            <h2 className="ob-h2 max-w-[17ch]">{title}</h2>
            <p className="ob-body max-w-[54ch]">{body}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
            <CTA href={primary.href} tone="signal">
              {primary.label}
            </CTA>
            {secondary && (
              <CTA href={secondary.href} tone="outline">
                {secondary.label}
              </CTA>
            )}
          </div>
        </div>
      </Container>
    </Section>
  );
}
