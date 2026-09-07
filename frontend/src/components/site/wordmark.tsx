import { cn } from '@/lib/utils';

/**
 * RELIASTRA wordmark.
 *
 * The lockup is deliberately typographic. An icon-in-a-rounded-square is the
 * single most common tell of a generated product identity, and RELIASTRA does
 * not need one: the name is short, the letterforms are strong, and a
 * letterspaced grotesk reads as an institution rather than an app.
 *
 * The only graphic element is the signal square - one 4px amber mark that
 * ends the wordmark. It is the same amber used for a degraded system state
 * everywhere else on the site, which is the point: the brand mark and the
 * status language are the same vocabulary.
 */
export function Wordmark({
  className,
  size = 'md',
  signal = true,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  signal?: boolean;
}) {
  const scale = {
    sm: 'text-[12px] tracking-[0.22em]',
    md: 'text-[14px] tracking-[0.2em]',
    lg: 'text-[17px] tracking-[0.18em]',
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-[0.45em] font-semibold uppercase leading-none text-[var(--ob-text)]',
        scale,
        className
      )}
    >
      RELIASTRA
      {signal && (
        <span
          aria-hidden
          className="mt-[0.1em] block h-[0.28em] w-[0.28em] bg-[var(--ob-signal)]"
        />
      )}
    </span>
  );
}

/**
 * Compact mark for favicons and tight chrome: the wordmark's signal square
 * inside a measurement frame. Sharp corners, 1px rules - an instrument face,
 * not an app icon.
 */
export function SignalMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect
        x="0.75"
        y="0.75"
        width="22.5"
        height="22.5"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      <path d="M4 16.5h16" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
      <path d="M8 16.5V11" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" />
      <path d="M16 16.5v-3" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" />
      <path d="M12 16.5V6.5" stroke="var(--ob-signal)" strokeWidth="1.75" />
    </svg>
  );
}
