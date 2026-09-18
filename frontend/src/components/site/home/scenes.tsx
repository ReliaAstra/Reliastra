import type { ReactNode } from 'react';
import Link from 'next/link';
import { Container } from '@/components/site/primitives';

/**
 * Shared pieces for the homepage's scene composition. Each scene on the
 * page is one argument at one scale; these are the bits of grammar several
 * of them share.
 */

/** A scene with a full-bleed media ground behind its content. */
export function MediaScene({
  id,
  src,
  srcSet,
  alt,
  ratio = 'min-h-[76vh] md:min-h-[88vh]',
  labelledBy,
  children,
}: {
  id?: string;
  src: string;
  srcSet?: string;
  alt: string;
  /** Vertical ambition of the scene. */
  ratio?: string;
  labelledBy?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`relative flex items-center overflow-hidden border-t border-[var(--ob-line)] bg-black ${ratio}`}
    >
      <div aria-hidden className="ob-scene-media">
        <img
          src={src}
          srcSet={srcSet}
          sizes="100vw"
          alt=""
          loading="lazy"
          decoding="async"
        />
        <div className="ob-scene-scrim" />
      </div>
      <Container className="relative z-[1] py-24 md:py-32">{children}</Container>
    </section>
  );
}

/** The large statement between scenes: typography as the entire scene. */
export function Manifesto({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section aria-label="What RELIASTRA asserts" className="border-t border-[var(--ob-line)] bg-[var(--ob-void)]">
      <Container className="py-24 md:py-36 lg:py-40">
        <p className="ob-manifesto max-w-[22ch]">{children}</p>
        {aside && <div className="mt-10 max-w-[52ch]">{aside}</div>}
      </Container>
    </section>
  );
}

/** A secondary call-to-action row: text links with direction, not buttons. */
export function SceneLinks({
  items,
}: {
  items: { href: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-x-9 gap-y-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group inline-flex items-center gap-2 border-b border-[var(--ob-line-2)] pb-1 text-[13px] font-medium tracking-[0.02em] text-[var(--ob-text)] transition-colors hover:border-[var(--ob-text)]"
        >
          {item.label}
          <span
            aria-hidden
            className="inline-block transition-transform duration-200 group-hover:translate-x-1"
          >
            →
          </span>
        </Link>
      ))}
    </div>
  );
}
