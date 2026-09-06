import type { Metadata } from 'next';
import Link from 'next/link';
import { RESEARCH_ARTICLES, researchRoute, PUBLIC_ROUTES } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Research — RELIASTRA',
  description:
    'How RELIASTRA measures vendor reliability, what the dependency gap is, and what we publish — and what we deliberately do not.',
  alternates: { canonical: PUBLIC_ROUTES.research },
};

/**
 * Research index.
 *
 * The list is derived from `RESEARCH_ARTICLES`, the same constant that drives
 * `generateStaticParams` for `/research/[slug]` and the sitemap. That is the
 * point: a route the navigation links to cannot exist in one place and 404 in
 * another, which is exactly how these four links broke.
 */
export default function ResearchIndexPage() {
  return (
    <main className="min-h-screen bg-white text-[#09090B] dark:bg-[#0A0A0F] dark:text-[#FAFAFA]">
      <div className="mx-auto max-w-[720px] px-6 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-400">
          Research
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          How we measure vendor reliability, in public.
        </h1>
        <p className="mt-4 leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
          RELIASTRA produces reliability records that customers take into
          commercial conversations with their vendors. That only works if the
          method is inspectable. Everything below describes how the product
          actually behaves — not a marketing summary of it.
        </p>

        <nav aria-label="Research articles" className="mt-12 space-y-4">
          {RESEARCH_ARTICLES.map((article) => (
            <Link
              key={article.slug}
              href={researchRoute(article.slug)}
              className="block rounded-2xl border border-[#E4E4E7] bg-white p-6 transition-colors hover:border-[#0891B2] dark:border-white/10 dark:bg-white/5 dark:hover:border-[#22D3EE]"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#71717A]">
                {article.category}
                {' · '}
                <time dateTime={article.publishedAt}>
                  {new Date(article.publishedAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </time>
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">
                {article.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
                {article.summary}
              </p>
            </Link>
          ))}
        </nav>

        <p className="mt-12 text-sm text-[#71717A]">
          Looking for live data instead?{' '}
          <Link
            href={PUBLIC_ROUTES.track}
            className="text-[#0891B2] underline underline-offset-4 dark:text-[#22D3EE]"
          >
            Track a vendor
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
