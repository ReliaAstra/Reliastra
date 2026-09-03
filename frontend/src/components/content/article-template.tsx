import Link from 'next/link';
import type { ReactNode } from 'react';
import { PreferredSourceSection } from '@/components/seo/preferred-source';

export type ArticleMeta = {
  title: string;
  summary: string;
  publishedAt: string; // ISO
  updatedAt?: string;
  author?: string;
  organization?: string;
  category?: string;
  tags?: string[];
};

export type RelatedLink = { href: string; label: string; description?: string };

type Props = {
  meta: ArticleMeta;
  children: ReactNode;
  evidence?: ReactNode;
  methodology?: ReactNode;
  related?: RelatedLink[];
  vendorLinks?: RelatedLink[];
};

/**
 * Reusable article/research template per STEP 14.
 * 1 Headline, 2 Summary, 3 Publication metadata, 4 Author/org, 5 Main content,
 * 6 Evidence, 7 Methodology, 8 Related research, 9 Preferred Source CTA, 10 Internal links
 */
export function ArticleTemplate({ meta, children, evidence, methodology, related, vendorLinks }: Props) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: meta.title,
    description: meta.summary,
    datePublished: meta.publishedAt,
    dateModified: meta.updatedAt ?? meta.publishedAt,
    author: meta.author ? { '@type': 'Person', name: meta.author } : { '@type': 'Organization', name: meta.organization ?? 'Reliastra' },
    publisher: { '@type': 'Organization', name: 'Reliastra', logo: { '@type': 'ImageObject', url: 'https://reliastra.com/logo.svg' } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://reliastra.com` },
  };

  return (
    <article className="mx-auto max-w-[720px] px-6 py-10">
      {/* JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* 1 Headline */}
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-400">
        {meta.category ?? 'Research'} {meta.tags?.length ? `· ${meta.tags.join(' · ')}` : ''}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white md:text-4xl">
        {meta.title}
      </h1>

      {/* 2 Summary */}
      <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">{meta.summary}</p>

      {/* 3+4 Metadata */}
      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 border-y border-zinc-200 py-3 font-mono text-[11px] text-zinc-500 dark:border-white/10 dark:text-zinc-500">
        <span>By {meta.author ?? meta.organization ?? 'Reliastra'}</span>
        <span>Published {new Date(meta.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        {meta.updatedAt && <span>Updated {new Date(meta.updatedAt).toLocaleDateString()}</span>}
      </div>

      {/* 5 Main content */}
      <div className="prose prose-zinc mt-8 max-w-none dark:prose-invert prose-a:text-cyan-700 dark:prose-a:text-cyan-400">
        {children}
      </div>

      {/* 6 Evidence */}
      {evidence && (
        <section className="mt-10 rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-white/10 dark:bg-white/5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">Evidence & data</h2>
          <div className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{evidence}</div>
        </section>
      )}

      {/* 7 Methodology */}
      {methodology && (
        <section className="mt-8 rounded-xl border border-zinc-200 p-6 dark:border-white/10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">Methodology & sources</h2>
          <div className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{methodology}</div>
        </section>
      )}

      {/* 8 Related */}
      {related && related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">Related research</h2>
          <ul className="mt-3 space-y-2">
            {related.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="text-sm font-medium text-cyan-700 hover:underline dark:text-cyan-400">
                  {r.label}
                </Link>
                {r.description && <p className="text-xs text-zinc-500">{r.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 9 Preferred Source CTA — after meaningful research, before related vendor links */}
      <div className="mt-10">
        <PreferredSourceSection variant="research" />
      </div>

      {/* 10 Internal links — vendor tracking, docs */}
      {vendorLinks && vendorLinks.length > 0 && (
        <nav className="mt-8 flex flex-wrap gap-2">
          {vendorLinks.map((v) => (
            <Link
              key={v.href}
              href={v.href}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5"
            >
              {v.label}
            </Link>
          ))}
        </nav>
      )}
    </article>
  );
}
