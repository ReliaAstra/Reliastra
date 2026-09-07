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
      <ol className="ob-label flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={item.href} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {i === items.length - 1 ? (
              <span aria-current="page" className="text-[var(--ob-text-2)]">
                {item.name}
              </span>
            ) : (
              <a href={item.href} className="transition-colors hover:text-[var(--ob-signal)]">
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
    <div>
      {faqs.map((f) => (
        <details
          key={typeof f.q === 'string' ? f.q : String(f.q)}
          className="group border-t border-[var(--ob-line)] py-5"
        >
          <summary className="cursor-pointer text-[15px] font-semibold tracking-[-0.01em] text-[var(--ob-text)] marker:text-[var(--ob-signal)]">
            {f.q}
          </summary>
          <div className="mt-2 max-w-[70ch] text-[14px] leading-[1.7] text-[var(--ob-text-3)]">{f.a}</div>
        </details>
      ))}
    </div>
  );
}
