'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Column<T> = {
  key: string;
  header: string;
  numeric?: boolean;
  sort?: (row: T) => string | number;
  render: (row: T) => ReactNode;
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
  stackBelow = 'lg',
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  rowState?: (row: T) => 'crit' | undefined;
  caption: string;
  emptyLabel?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  stackBelow?: 'lg' | 'xl';
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
      <p className="px-4 py-6 text-[13px] text-rs-text-tertiary">
        {emptyLabel}
      </p>
    );
  }

  return (
    <>
      {/* Dense table: laptop and up */}
      <div className={cn('hidden', stackBelow === 'xl' ? 'xl:block' : 'lg:block')}>
        <div className="rs-table-wrap">
          <table className="rs-table">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="rs-table-header">
                {columns.map((c, i) => {
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
                      className={cn(c.numeric && 'rs-numeric-right')}
                      style={c.width && i > 0 ? { width: c.width } : undefined}
                    >
                      {c.sort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary hover:text-rs-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
                          onClick={() => toggle(c.key)}
                        >
                          {c.header}
                          <span aria-hidden className="text-[9px] leading-none">
                            {active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
                {rows.some((r) => rowHref?.(r)) && (
                  <th scope="col" className="w-8" aria-label="Open record">
                    <span className="sr-only">Open</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const href = rowHref?.(row);
                const isCrit = rowState?.(row) === 'crit';
                return (
                  <tr
                    key={rowKey(row)}
                    data-state={isCrit ? 'crit' : undefined}
                    onClick={href ? () => router.push(href) : undefined}
                    className={cn(
                      'rs-table-row',
                      href && 'cursor-pointer',
                      isCrit && 'bg-rs-down-bg/50'
                    )}
                  >
                    {columns.map((c, i) => (
                      <td key={c.key} className={cn(c.numeric && 'rs-numeric-right')}>
                        {href && i === 0 ? (
                          <a
                            href={href}
                            className="block rounded-md px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {c.render(row)}
                          </a>
                        ) : (
                          c.render(row)
                        )}
                      </td>
                    ))}
                    {href && (
                      <td className="w-8 pr-2">
                        <ChevronRight className="rs-table-chevron h-4 w-4 text-rs-text-tertiary" aria-hidden />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record stack: phone and tablet */}
      <ul
        className={cn(
          'divide-y divide-rs-border-subtle',
          stackBelow === 'xl' ? 'xl:hidden' : 'lg:hidden'
        )}
      >
        {sorted.map((row) => {
          const href = rowHref?.(row);
          const [first, ...rest] = columns.filter((c) => !c.mobileHidden);
          const isCrit = rowState?.(row) === 'crit';
          return (
            <li
              key={rowKey(row)}
              className={cn(
                'px-4 py-4',
                isCrit && 'border-l-2 border-l-rs-down bg-rs-down-bg/30'
              )}
            >
              {href ? (
                <a href={href} className="mb-3 block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus">
                  {first.render(row)}
                </a>
              ) : (
                <div className="mb-3">{first.render(row)}</div>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {rest.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="rs-label">{c.header}</dt>
                    <dd
                      className={cn(
                        'mt-1 truncate text-[12.5px] text-rs-text-secondary',
                        c.numeric && 'rs-mono'
                      )}
                    >
                      {c.render(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}

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
    <div className="flex flex-col gap-3 border-b border-rs-border-subtle bg-rs-elevated px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <label htmlFor="rs-filter" className="sr-only">
            {placeholder}
          </label>
          <input
            id="rs-filter"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            className="rs-input h-8 w-[220px] text-[13px]"
          />
        </div>
        {segments && (
          <div role="group" aria-label="Filter by state" className="inline-flex rounded-lg border border-rs-border-subtle p-0.5">
            {segments.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={active === s.id}
                onClick={() => onSegment?.(s.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
                  active === s.id
                    ? 'bg-rs-active text-rs-text'
                    : 'text-rs-text-tertiary hover:text-rs-text-secondary'
                )}
              >
                {s.label}
                {s.count != null && (
                  <span className="ml-1.5 rs-mono text-[11px] text-rs-text-tertiary">
                    {s.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {right && <div className="text-[12px] text-rs-text-tertiary">{right}</div>}
    </div>
  );
}
