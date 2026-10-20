import { cn } from '@/lib/utils';

/**
 * THE APERTURE — the RELIASTRA mark.
 *
 * Four segments of equal width assembled along the edges of a square rotated
 * 45 degrees, each running slightly past the vertex it meets, with one amber
 * diamond in the opening. Exact geometry, published in
 * `design/logo/README.md`; this component is the same figure at interface size.
 *
 * The segments inherit `currentColor` so the mark is correct in any chrome.
 * The core is the signal amber, which is the accent this product reserves for
 * an observation point - and also for something needing attention. That
 * collision is deliberate and it is the reason the core is not recoloured per
 * surface: the mark should mean the same thing wherever it appears.
 */
export function ApertureMark({
  size = 22,
  className,
  core = 'var(--ob-signal, #D9A441)',
}: {
  size?: number;
  className?: string;
  core?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      <g stroke="currentColor" strokeWidth="13" fill="none">
        <path d="M45.05 5.05L94.95 54.95" />
        <path d="M94.95 45.05L45.05 94.95" />
        <path d="M54.95 94.95L5.05 45.05" />
        <path d="M5.05 54.95L54.95 5.05" />
      </g>
      <path d="M50 28L72 50L50 72L28 50Z" fill={core} />
    </svg>
  );
}

/**
 * RELIASTRA wordmark.
 *
 * The mark, then the name. The lockup is deliberately typographic: a
 * letterspaced grotesk set beside an instrument, which reads as an institution
 * rather than as an app. Set in Inter, the same face the interface uses, so
 * the wordmark and the product speak in one voice.
 */
export function Wordmark({
  className,
  size = 'md',
  mark = true,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  mark?: boolean;
}) {
  const scale = {
    sm: { text: 'text-[12px] tracking-[0.22em]', markPx: 17, gap: '0.5em' },
    md: { text: 'text-[14px] tracking-[0.2em]', markPx: 20, gap: '0.55em' },
    lg: { text: 'text-[17px] tracking-[0.18em]', markPx: 24, gap: '0.6em' },
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold uppercase leading-none text-[var(--ob-text)]',
        scale.text,
        className
      )}
      style={{ gap: scale.gap }}
    >
      {mark && <ApertureMark size={scale.markPx} />}
      RELIASTRA
    </span>
  );
}
