import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteShell } from '@/components/site/site-shell';
import {
  ArrowLink,
  Breadcrumb,
  CTA,
  Container,
  Eyebrow,
  Rule,
  Section,
} from '@/components/site/primitives';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';

export type MarketingLink = { label: string; href: string; description?: string };

/**
 * Shared shell for indexable marketing, concept, docs and legal pages.
 *
 * Two things changed here beyond the visual language, and both were defects:
 *
 * 1. These pages previously rendered a bare `<main>` with NO global header
 *    and NO footer. Seventeen public routes - the entire product, docs,
 *    glossary, legal and company surface - were unreachable from each other
 *    and had no site-wide navigation at all. Every one of them now renders
 *    inside `SiteShell`, so the internal link graph is complete.
 * 2. Breadcrumbs are rendered once, by this component, from the same array
 *    the page passes to its structured data - they cannot disagree.
 *
 * The contract (eyebrow / title / lede / breadcrumbs / children / related /
 * ctaTitle / ctaBody) is unchanged, so all seventeen callers were restyled
 * without touching their content or their metadata.
 */
export function MarketingPage({
  eyebrow,
  title,
  lede,
  breadcrumbs,
  visual,
  visualCaption,
  children,
  related,
  ctaTitle = 'Know what you depend on. Prove what it did.',
  ctaBody = 'RELIASTRA observes the external services your product relies on, attributes their failures, and produces evidence you can act on. Every new organization starts on a 14-day Pro trial.',
}: {
  eyebrow: string;
  title: string;
  lede: string;
  breadcrumbs: { name: string; href: string }[];
  /**
   * A product visual, rendered full-bleed between the masthead and the prose.
   *
   * This exists because these pages are capability pages, not articles: a
   * visitor should see the thing before reading about it. It is deliberately
   * a single slot rather than free-form children so the visual always lands
   * in the same place on every page, at a width that suits a diagram rather
   * than a 68ch measure.
   */
  visual?: ReactNode;
  visualCaption?: string;
  children: ReactNode;
  related?: MarketingLink[];
  ctaTitle?: string;
  ctaBody?: string;
}) {
  return (
    <SiteShell>
      {/* Masthead */}
      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container className="py-14 md:py-20">
          <Breadcrumb items={breadcrumbs} className="mb-8" />
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="ob-h1 mt-5 max-w-[17ch]">{title}</h1>
          <p className="ob-lede mt-6">{lede}</p>
        </Container>
      </header>

      {visual && (
        <Section tone="void" divider={false} tight>
          <Container width="narrow">
            {visual}
            {visualCaption && (
              <p className="ob-small mt-5 max-w-[62ch]">{visualCaption}</p>
            )}
          </Container>
        </Section>
      )}

      <Section tone="void" divider={false} tight>
        <Container width="narrow" className="!px-0">
          <div className="ob-container-read !max-w-none !px-[var(--ob-gutter)] lg:!max-w-[780px] lg:!px-0">
            {children}
          </div>
        </Container>
      </Section>

      {related && related.length > 0 && (
        <Section tone="void" tight aria-labelledby="related-heading">
          <Container width="narrow">
            <h2 id="related-heading" className="ob-label">
              Related
            </h2>
            <ul className="mt-2 grid gap-x-12 sm:grid-cols-2">
              {related.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className="group flex flex-col gap-2 border-t border-[var(--ob-line)] py-6 transition-colors hover:border-[var(--ob-line-3)]"
                  >
                    <span className="text-[15.5px] font-semibold tracking-[-0.01em] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                      {r.label}
                    </span>
                    {r.description && (
                      <span className="text-[13.5px] leading-[1.6] text-[var(--ob-text-4)]">
                        {r.description}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </Section>
      )}

      <Section tone="base" tight aria-labelledby="page-cta-heading">
        <Container width="narrow">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <h2 id="page-cta-heading" className="ob-h3 max-w-[24ch]">
                {ctaTitle}
              </h2>
              <p className="ob-body max-w-[58ch]">{ctaBody}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <CTA href={AUTH_ROUTES.signup} tone="signal">
                Start monitoring
              </CTA>
              <CTA href={PUBLIC_ROUTES.track} tone="outline">
                Public dependency data
              </CTA>
            </div>
          </div>
        </Container>
      </Section>
    </SiteShell>
  );
}

/**
 * Long-form body copy.
 *
 * All styling lives in the `.ob-prose` block in globals.css, so every article,
 * doc page and legal page shares one typographic scale, one link treatment and
 * one list style. Callers write plain semantic HTML.
 */
export function Prose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('ob-prose', className)}>{children}</div>;
}

/** Re-exported so page files can reach the shared bits without a second import. */
export { ArrowLink, Rule, Container, Eyebrow };
