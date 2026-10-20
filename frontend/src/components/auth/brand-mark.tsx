import { ApertureMark } from '@/components/site/wordmark';

/**
 * BrandMark — the RELIASTRA aperture at console scale, with the name.
 *
 * Was a tick inside a rounded square, which is the most common tell of a
 * generated product identity. The aperture replaces it: the same mark the
 * public site, the favicon and the evidence records carry, so an operator
 * looking at a checkout or an admin screen sees the same instrument the
 * customer sees.
 */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <ApertureMark size={size} className="text-rs-text" core="var(--rs-brand)" />
      <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.18em] text-rs-text">
        Reliastra
      </span>
    </span>
  );
}
