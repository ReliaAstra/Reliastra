'use client';

import { useState } from 'react';

/**
 * The maintainer's portrait.
 *
 * It is his real GitHub avatar, served from GitHub's CDN at the address
 * published on his profile — not a generated likeness and not a stock face.
 * The alternative a designer reaches for here, an AI-generated portrait
 * presented as a specific engineer, is the same class of fabrication the
 * research agenda forbids, only harder to notice.
 *
 * The fallback matters: an external image can fail to load (offline, a
 * privacy extension, a blocked CDN), and a broken-image icon on the page that
 * exists to prove a real person is behind the project is worse than a
 * monogram. On error the plate switches to initials, so the layout is never
 * broken and nothing is claimed that is not there.
 */
export function MaintainerAvatar({
  src,
  alt,
  initials,
  size = 132,
}: {
  src: string;
  alt: string;
  initials: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className="relative shrink-0 overflow-hidden border border-[var(--ob-line-2)] bg-[var(--ob-raised)]"
      style={{ width: size, height: size }}
    >
      {failed ? (
        <span
          aria-hidden
          className="flex h-full w-full items-center justify-center font-mono text-[28px] tracking-[0.14em] text-[var(--ob-text-3)]"
        >
          {initials}
        </span>
      ) : (
        /* A plain <img>, deliberately: routing an external avatar through the
           image optimizer would make every page render depend on a third-party
           fetch at build and at request time. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
          style={{ filter: 'grayscale(0.12) contrast(1.03)' }}
        />
      )}
    </div>
  );
}
