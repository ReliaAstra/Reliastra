'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * The console data table.
 *
 * One implementation serves dependencies, incidents, evidence and check
 * results, because they are the same interaction: scan a dense list, sort it,
 * narrow it, open a record. Behaviour that matters:
 *
 * -  Sorting is a real `<button>` inside the `<th>`, and the `<th>` carries
 *    `aria-sort`, so the sort state is announced rather than implied by a
 *    caret. Only columns that declare a `sort` accessor are sortable.
 * -  A row is navigable by keyboard. The whole `<tr>` is clickable for the
 *    mouse, but the first cell also contains a real link, which is what a
 *    screen reader and a keyboard user actually follow. There is no
 *    `onKeyDown` re-implementation of a link.
 * -  Below `lg` the table does not scroll sideways: it becomes a stack of
 *    records, each showing the same fields as label/value pairs. Section 24
 *    is explicit that tables must transform rather than overflow.
 */

export type Column<T> = {
  key: string;
  header: string;
  /** Right-align and use mono digits. */
  numeric?: boolean;
  /** Return a sortable primitive; omit to make the column unsortable. */
  sort?: (row: T) => string | number;
  render: (row: T) => ReactNode;
  /** Hide on the mobile record stack (e.g. a redundant chevron column). */
  mobileHidden?: boolean;
  width?: number;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  rowState,
  caption,
  emptyLabel = 'No records',
  initialSort,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Makes the row a navigable record. */
  rowHref?: (row: T) => string;
  /** `crit` tints the row — used for rows with an active incident. */
  rowState?: (row: T) => 'crit' | undefined;
  caption: string;
  emptyLabel?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
}) {
  const router = useRouter();
  const [sort, setSort] = useState(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sort!(a);
      const bv = col.sort!(b);
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * dir;
    });
  }, [rows, sort, columns]);

  const toggle = (key: string) =>
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );

  if (!rows.length) {
    return (
      <p className="border border-[var(--obc-line)] px-4 py-6 text-[12.5px] text-[var(--obc-text-4)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <>
      {/* Dense table — laptop and up */}
      <div className="hidden border border-[var(--obc-line)] lg:block">
        <table className="obc-table table-fixed">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const ariaSort = active
                  ? sort!.dir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : c.sort
                    ? 'none'
                    : undefined;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn(c.numeric && 'obc-num')}
                    style={c.width ? { width: c.width } : undefined}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        className="obc-sort"
                        onClick={() => toggle(c.key)}
                      >
                        {c.header}
                        <span aria-hidden className="text-[8px] leading-none">
                          {active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  data-active={rowState?.(row) === 'crit' ? 'true' : undefined}
                  onClick={href ? () => router.push(href) : undefined}
                  className={cn(href && 'cursor-pointer')}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn(c.numeric && 'obc-num')}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Record stack — phone and tablet. Same fields, no sideways scroll. */}
      <ul className="divide-y divide-[var(--obc-line)] border border-[var(--obc-line)] lg:hidden">
        {sorted.map((row) => {
          const href = rowHref?.(row);
          const [first, ...rest] = columns.filter((c) => !c.mobileHidden);
          const body = (
            <>
              <div className="mb-2.5">{first.render(row)}</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {rest.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="obc-label">{c.header}</dt>
                    <dd
                      className={cn(
                        'mt-1 truncate text-[12.5px] text-[var(--obc-text-2)]',
                        c.numeric && 'font-[family-name:var(--ob-font-mono)] tabular-nums'
                      )}
                    >
                      {c.render(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          );
          return (
            <li
              key={rowKey(row)}
              data-active={rowState?.(row) === 'crit' ? 'true' : undefined}
              className="px-3.5 py-3.5 data-[active=true]:bg-[var(--obc-crit-wash)]"
            >
              {href ? (
                <a href={href} className="block">
                  {body}
                </a>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Table toolbar: free-text filter plus optional segmented state filter.
 * Both are real form controls with labels — the search box is not a
 * placeholder pretending to be one.
 */
export function TableFilters({
  query,
  onQuery,
  placeholder = 'Filter',
  segments,
  active,
  onSegment,
  right,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder?: string;
  segments?: { id: string; label: string; count?: number }[];
  active?: string;
  onSegment?: (id: string) => void;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label htmlFor="obc-filter" className="sr-only">
            {placeholder}
          </label>
          <input
            id="obc-filter"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            className="obc-input h-8 w-[200px] text-[12.5px]"
          />
        </div>
        {segments && (
          <div role="group" aria-label="Filter by state" className="flex items-center">
            {segments.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={active === s.id}
                onClick={() => onSegment?.(s.id)}
                className={cn(
                  'h-8 border border-[var(--obc-line-2)] px-3 text-[11.5px] transition-colors',
                  i > 0 && '-ml-px',
                  active === s.id
                    ? 'bg-[var(--obc-elevated)] text-[var(--obc-text)]'
                    : 'text-[var(--obc-text-4)] hover:text-[var(--obc-text-2)]'
                )}
              >
                {s.label}
                {s.count != null && (
                  <span className="ml-1.5 font-[family-name:var(--ob-font-mono)] text-[10px] text-[var(--obc-text-4)]">
                    {s.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}
