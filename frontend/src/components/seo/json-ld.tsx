import type { ReactNode } from 'react';

/** Render JSON-LD safely. Values must match visible page content. */
export function JsonLd({ data }: { data: unknown | unknown[] }) {
  const payload = Array.isArray(data) ? data : [data];
  return (
    <>
      {payload.map((d, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(d) }}
        />
      ))}
    </>
  );
}

/** Breadcrumb navigation with matching BreadcrumbList structured data. */
export function Breadcrumbs({ items }: { items: { name: string; href: string }[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-500">
        {items.map((item, i) => (
          <li key={item.href} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {i === items.length - 1 ? (
              <span aria-current="page" className="text-zinc-700 dark:text-zinc-300">
                {item.name}
              </span>
            ) : (
              <a href={item.href} className="transition-colors hover:text-cyan-700 dark:hover:text-cyan-400">
                {item.name}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function FaqBlock({ faqs }: { faqs: { q: string; a: string | ReactNode }[] }) {
  return (
    <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-white/10 dark:border-white/10">
      {faqs.map((f) => (
        <details key={typeof f.q === 'string' ? f.q : String(f.q)} className="group px-5 py-4">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900 marker:text-cyan-700 dark:text-zinc-100">
            {f.q}
          </summary>
          <div className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{f.a}</div>
        </details>
      ))}
    </div>
  );
}
