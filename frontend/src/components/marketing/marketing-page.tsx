import Link from 'next/link';
import type { ReactNode } from 'react';
import { Breadcrumbs } from '@/components/seo/json-ld';

export type MarketingLink = { label: string; href: string; description?: string };

/**
 * Shared shell for indexable marketing/concept/docs pages.
 * One H1 per page (via `title`), logical H2/H3 in children, breadcrumb nav,
 * related internal links, and a consistent CTA — the topical graph in markup.
 */
export function MarketingPage({
  eyebrow,
  title,
  lede,
  breadcrumbs,
  children,
  related,
  ctaTitle = 'Know when your dependencies fail. Prove what happened.',
  ctaBody = 'Monitor the external APIs your product relies on, correlate their failures with your incidents, and generate verifiable evidence when a vendor causes downtime.',
}: {
  eyebrow: string;
  title: string;
  lede: string;
  breadcrumbs: { name: string; href: string }[];
  children: ReactNode;
  related?: MarketingLink[];
  ctaTitle?: string;
  ctaBody?: string;
}) {
  return (
    <main className="min-h-screen bg-white pb-24 text-zinc-900 dark:bg-[#0A0A0F] dark:text-zinc-100">
      <section className="border-b border-zinc-200 bg-[#F8F9FA] py-12 dark:border-white/10 dark:bg-[#131318] md:py-16">
        <div className="mx-auto max-w-[880px] px-6">
          <Breadcrumbs items={breadcrumbs} />
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-cyan-700 dark:text-cyan-400">
            {eyebrow}
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
            {lede}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[880px] px-6 pt-10">{children}</div>

      {related && related.length > 0 && (
        <nav aria-label="Related" className="mx-auto mt-12 max-w-[880px] px-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider">Related</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  className="block rounded-xl border border-zinc-200 p-4 transition-colors hover:border-cyan-600 dark:border-white/10 dark:hover:border-cyan-400"
                >
                  <span className="text-sm font-semibold text-cyan-700 dark:text-cyan-400">
                    {r.label}
                  </span>
                  {r.description && (
                    <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
                      {r.description}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <section className="mx-auto mt-12 max-w-[880px] px-6">
        <div className="rounded-xl border border-zinc-200 bg-[#F8F9FA] p-6 dark:border-white/10 dark:bg-[#131318] md:p-8">
          <h2 className="text-lg font-semibold tracking-tight">{ctaTitle}</h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {ctaBody}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-[10px] bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Start free
            </Link>
            <Link
              href="/track"
              className="rounded-[10px] border border-zinc-300 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-white dark:border-white/20 dark:hover:bg-white/5"
            >
              Track a vendor
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400 [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-zinc-900 dark:[&_h2]:text-white [&_h3]:pt-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-900 dark:[&_h3]:text-zinc-100 [&_a]:text-cyan-700 [&_a]:underline [&_a]:underline-offset-4 dark:[&_a]:text-cyan-400 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-zinc-900 dark:[&_strong]:text-zinc-100">
      {children}
    </div>
  );
}
