import type { ReactNode } from 'react';

/**
 * Body-level building blocks for research papers.
 *
 * This module is deliberately dependency-free: no metadata helpers, no SEO
 * helpers, no route table. Content files import from here, and the content
 * files are imported by `research-meta` for reading time - so anything this
 * module pulled in would come back around as a cycle and arrive `undefined`
 * at module-evaluation time. That already happened once, with
 * `readingMinutes`; the fix is a module with nothing to cycle through.
 */

/** A figure: server-rendered SVG plus the interpretation in words. */
export function PaperFigure({
  n,
  caption,
  children,
}: {
  n: string;
  caption: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="not-prose my-12 border border-[var(--ob-line)] bg-[var(--ob-void)] p-5 md:p-7">
      <p className="ob-label mb-5 text-[var(--ob-signal)]">Figure {n}</p>
      {children}
      <figcaption className="mt-6 border-t border-[var(--ob-line)] pt-4 text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
        {caption}
      </figcaption>
    </figure>
  );
}

/** A measured value presented as data, with its provenance. */
export function DataPanel({
  label,
  children,
  source,
}: {
  label: string;
  children: ReactNode;
  source?: string;
}) {
  return (
    <div className="not-prose my-10 border border-[var(--ob-line)] bg-[var(--ob-raised)]">
      <p className="ob-label border-b border-[var(--ob-line)] px-5 py-3 text-[var(--ob-signal)]">
        {label}
      </p>
      <div className="overflow-x-auto px-5 py-4">{children}</div>
      {source && (
        <p className="border-t border-[var(--ob-line)] px-5 py-3 text-[12px] leading-[1.5] text-[var(--ob-text-4)]">
          Source: {source}
        </p>
      )}
    </div>
  );
}

/**
 * An explicitly typed claim. Use this instead of letting a paragraph imply
 * what kind of statement it is: the label is the discipline.
 */
export function Claim({
  kind,
  children,
}: {
  kind: 'fact' | 'observation' | 'hypothesis' | 'inference' | 'limitation' | 'recommendation';
  children: ReactNode;
}) {
  return (
    <p className="not-prose my-7 border-l-2 border-[var(--ob-signal)] bg-[var(--ob-raised)] py-3.5 pl-5 pr-4 text-[15px] leading-[1.68] text-[var(--ob-text-2)]">
      <span className="ob-mono mr-3 text-[10px] uppercase tracking-[0.11em] text-[var(--ob-signal)]">
        {kind}
      </span>
      {children}
    </p>
  );
}

/** A data table with a real caption - accessible without the visual grid. */
export function DataTable({
  caption,
  head,
  rows,
  note,
  align = 'right',
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
  note?: string;
  align?: 'right' | 'left';
}) {
  return (
    <table className="not-prose w-full border-collapse text-[13.5px]">
      <caption className="ob-label mb-3 text-left text-[var(--ob-text-3)]">{caption}</caption>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={h}
              scope="col"
              className={`border-b border-[var(--ob-line-2)] py-2.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ob-text-4)] ${
                i === 0 ? 'text-left' : align === 'right' ? 'text-right' : 'text-left'
              }`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.join('|')}>
            {r.map((c, i) => (
              <td
                key={i}
                className={`border-b border-[var(--ob-line)] py-2.5 ${
                  i === 0 ? 'text-left text-[var(--ob-text-2)]' : `ob-mono ${align === 'right' ? 'text-right' : 'text-left'} text-[var(--ob-text-3)]`
                }`}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {note && (
        <tfoot>
          <tr>
            <td colSpan={head.length} className="pt-3 text-[12px] leading-[1.5] text-[var(--ob-text-4)]">
              {note}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
