'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

/**
 * The research index.
 *
 * Every paper is rendered into the HTML on the server. Filtering only toggles
 * `hidden` on the client, which means:
 *
 *  - a crawler and an LLM see the complete corpus, not whatever a facet
 *    happened to be selected;
 *  - no facet gets a URL, so no facet becomes a thin duplicate page in the
 *    index. `/research` is one document with one canonical URL;
 *  - the first client render matches the server render exactly, so there is no
 *    hydration mismatch and no flash of a filtered list.
 */

export type ResearchIndexEntry = {
  slug: string;
  href: string;
  title: string;
  summary: string;
  question?: string;
  group: string;
  groupHref: string;
  category: string;
  publishedAt: string;
  updatedAt?: string;
  domains: string[];
  researchType?: string;
  evidenceBasis?: string;
  tags: string[];
  vendors: string[];
  author: string;
  readingTime: string;
};

type Facet = 'domains' | 'researchType' | 'vendors' | 'evidenceBasis';

const FACET_LABEL: Record<Facet, string> = {
  domains: 'Domain',
  researchType: 'Research type',
  vendors: 'Vendor',
  evidenceBasis: 'Evidence basis',
};

function Chip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.07em] transition-colors ${
        active
          ? 'border-[var(--ob-signal)] bg-[var(--ob-signal-wash)] text-[var(--ob-signal)]'
          : 'border-[var(--ob-line-2)] text-[var(--ob-text-3)] hover:border-[var(--ob-line-3)] hover:text-[var(--ob-text-2)]'
      }`}
    >
      {label}
      <span className="ml-1.5 text-[var(--ob-text-4)]">{count}</span>
    </button>
  );
}

export function ResearchIndex({ entries }: { entries: ResearchIndexEntry[] }) {
  const [selected, setSelected] = useState<Partial<Record<Facet, string>>>({});

  const values = useMemo(() => {
    const out = {} as Record<Facet, string[]>;
    (Object.keys(FACET_LABEL) as Facet[]).forEach((facet) => {
      const set = new Set<string>();
      for (const e of entries) {
        if (facet === 'researchType' || facet === 'evidenceBasis') {
          const v = e[facet];
          if (v) set.add(v);
        } else {
          for (const v of e[facet]) set.add(v);
        }
      }
      out[facet] = [...set].sort((a, b) => a.localeCompare(b));
    });
    return out;
  }, [entries]);

  const matches = (e: ResearchIndexEntry) =>
    (Object.keys(selected) as Facet[]).every((facet) => {
      const want = selected[facet];
      if (!want) return true;
      if (facet === 'researchType' || facet === 'evidenceBasis') return e[facet] === want;
      return e[facet].includes(want);
    });

  const visible = entries.filter(matches);
  const activeCount = Object.values(selected).filter(Boolean).length;

  const countFor = (facet: Facet, value: string) =>
    entries.filter((e) => {
      const probe = { ...selected, [facet]: value };
      return (Object.keys(probe) as Facet[]).every((f) => {
        const want = probe[f];
        if (!want) return true;
        if (f === 'researchType' || f === 'evidenceBasis') return e[f] === want;
        return e[f].includes(want);
      });
    }).length;

  return (
    <div>
      {/* Facets */}
      <div className="border-y border-[var(--ob-line)] bg-[var(--ob-void)]">
        <div className="mx-auto w-full max-w-[1200px] px-[var(--ob-gutter)] py-7">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h2 className="ob-label">Browse the corpus</h2>
            <p className="font-mono text-[11px] text-[var(--ob-text-4)]">
              {activeCount === 0
                ? `${entries.length} papers`
                : `${visible.length} of ${entries.length} papers`}
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected({})}
                  className="ml-3 underline decoration-[var(--ob-signal)] underline-offset-4 hover:text-[var(--ob-signal)]"
                >
                  clear filters
                </button>
              )}
            </p>
          </div>

          <dl className="mt-5 flex flex-col gap-4">
            {(Object.keys(FACET_LABEL) as Facet[]).map((facet) =>
              values[facet].length === 0 ? null : (
                <div
                  key={facet}
                  className="grid gap-2 md:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] md:gap-6"
                >
                  <dt className="ob-label pt-1.5 text-[var(--ob-text-4)]">
                    {FACET_LABEL[facet]}
                  </dt>
                  <dd className="flex flex-wrap gap-2">
                    {values[facet].map((v) => (
                      <Chip
                        key={v}
                        label={v}
                        count={countFor(facet, v)}
                        active={selected[facet] === v}
                        onClick={() =>
                          setSelected((prev) => ({
                            ...prev,
                            [facet]: prev[facet] === v ? undefined : v,
                          }))
                        }
                      />
                    ))}
                  </dd>
                </div>
              )
            )}
          </dl>
        </div>
      </div>

      {/* The corpus. All of it, in the HTML. */}
      <ul className="mx-auto w-full max-w-[1200px] px-[var(--ob-gutter)]">
        {entries.map((e) => (
          <li
            key={e.slug}
            hidden={!matches(e)}
            className="border-b border-[var(--ob-line)]"
          >
            <Link
              href={e.href}
              className="group grid gap-6 py-10 transition-colors hover:bg-[var(--ob-base)] lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] lg:gap-14"
            >
              <div className="flex flex-col gap-3">
                <p className="ob-label">
                  <span className="text-[var(--ob-signal)]">{e.category}</span>
                  {' · '}
                  <time dateTime={e.publishedAt.slice(0, 10)}>{e.publishedAt}</time>
                  {' · '}
                  {e.readingTime}
                  {e.updatedAt && <span> · updated {e.updatedAt}</span>}
                </p>

                <h3 className="text-[clamp(1.35rem,2.4vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                  {e.title}
                </h3>

                {e.question && (
                  <p className="max-w-[66ch] border-l-2 border-[var(--ob-signal)] pl-4 text-[14px] leading-[1.6] text-[var(--ob-text-3)]">
                    <span className="ob-mono mr-2 text-[10px] uppercase tracking-[0.1em] text-[var(--ob-signal)]">
                      Question
                    </span>
                    {e.question}
                  </p>
                )}

                <p className="max-w-[74ch] text-[15px] leading-[1.68] text-[var(--ob-text-3)]">
                  {e.summary}
                </p>

                <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                  {[...new Set([...e.domains, ...e.tags])].map((t) => (
                    <li key={t} className="text-[12.5px] text-[var(--ob-text-4)]">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <dl className="flex flex-col gap-3 self-start text-[13px] lg:text-right">
                <div>
                  <dt className="ob-label mb-1 text-[var(--ob-text-4)]">Author</dt>
                  <dd className="text-[var(--ob-text-2)]">{e.author}</dd>
                </div>
                {e.researchType && (
                  <div>
                    <dt className="ob-label mb-1 text-[var(--ob-text-4)]">Type</dt>
                    <dd className="text-[var(--ob-text-2)]">{e.researchType}</dd>
                  </div>
                )}
                {e.evidenceBasis && (
                  <div>
                    <dt className="ob-label mb-1 text-[var(--ob-text-4)]">Basis</dt>
                    <dd className="text-[var(--ob-text-2)]">{e.evidenceBasis}</dd>
                  </div>
                )}
                <div>
                  <dt className="ob-label mb-1 text-[var(--ob-text-4)]">Collection</dt>
                  <dd className="text-[var(--ob-text-2)]">
                    <span className="underline decoration-[var(--ob-line-3)] underline-offset-4">
                      {e.group}
                    </span>
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
