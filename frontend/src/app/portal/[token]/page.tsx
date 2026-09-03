'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatLatency, formatUptime } from '@/lib/dashboard/format';
import type { AgencyPortfolio, PortfolioClient } from '@/lib/dashboard/types';
import { cn } from '@/lib/utils';
import { PreferredSourceSection } from '@/components/seo/preferred-source';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: AgencyPortfolio };

function statusStyle(status: PortfolioClient['status']) {
  switch (status) {
    case 'critical':
      return { label: 'Critical', dot: 'bg-[#DC2626]', text: 'text-[#DC2626]', bg: 'bg-[#DC2626]/10' };
    case 'degraded':
      return { label: 'Degraded', dot: 'bg-[#D97706]', text: 'text-[#D97706]', bg: 'bg-[#D97706]/10' };
    default:
      return { label: 'Operational', dot: 'bg-[#059669]', text: 'text-[#059669]', bg: 'bg-[#059669]/10' };
  }
}

function uptimeColor(v: number) {
  if (v >= 99.9) return 'text-[#059669] dark:text-[#34D399]';
  if (v >= 99) return 'text-[#D97706] dark:text-[#FBBF24]';
  return 'text-[#DC2626] dark:text-[#F87171]';
}

/**
 * Public client-facing SLA portal — the artifact agencies hand to their
 * customers. Unauthenticated by design (HMAC-signed share link), white-label,
 * print-friendly. Spec: light-first, print-safe (borders only, no shadows/animations),
 * header 72px with logo tile 40px #2563EB, generated timestamp top-right mono 12px,
 * client cards grid sm:2 lg:3, footer signed-data line + "Powered by Reliastra" (hidden in print).
 */
export default function PortalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/public/agency-portfolio/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-[#F7F8FA] text-[#0B1220] antialiased dark:bg-[#0B0F19] dark:text-[#F8FAFC] print:bg-white print:text-black">
      {/* Header — 72px per spec, logo tile 40px #2563EB, timestamp mono 12px top-right */}
      <header className="h-[72px] border-b border-[#E8EBF0] bg-white dark:border-[#1E293B] dark:bg-[#111726] print:border-0 print:bg-white">
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB] print:bg-[#2563EB]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[-0.01em]">
                {state.kind === 'ready' ? state.data.org_name : 'Client SLA Reports'}
              </div>
              <div className="text-xs text-[#69748A] dark:text-[#6B7893] print:text-[#69748A]">
                Service reliability portal
              </div>
            </div>
          </div>
          <span className="hidden rounded-full border border-[#E8EBF0] px-3 py-1 font-mono text-[12px] text-[#69748A] sm:block dark:border-[#313F58] dark:text-[#6B7893] print:border-[#E8EBF0]">
            {state.kind === 'ready'
              ? `Generated ${new Date(state.data.generated_at).toLocaleString()}`
              : '\u00A0'}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10 print:px-0">
        {state.kind === 'error' && (
          <div className="rounded-xl border border-[#E8EBF0] bg-white p-10 text-center dark:border-[#1E293B] dark:bg-[#111726] print:border-[#E8EBF0] print:bg-white print:shadow-none">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#69748A]">Link error</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
              This report link is not valid
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-[#3F4A5C] dark:text-[#A5B0C2]">
              The link may have been mistyped or rotated by the agency. Ask them for a fresh
              link from their Clients page.
            </p>
          </div>
        )}

        {state.kind === 'loading' && (
          <div aria-busy="true">
            <div className="rs-skeleton mb-4 h-6 w-64 rounded" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[#E8EBF0] bg-white p-5 dark:border-[#1E293B] dark:bg-[#111726] print:shadow-none"
                >
                  <div className="rs-skeleton mb-3 h-4 w-28 rounded" />
                  <div className="rs-skeleton h-8 w-20 rounded" />
                  <div className="rs-skeleton mt-4 h-1 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        )}

        {state.kind === 'ready' && (
          <>
            {/* Totals — print 4-col */}
            <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4 print:grid-cols-4">
              {[
                {
                  label: 'Clients',
                  value: String(state.data.totals.clients),
                  cls: '',
                },
                {
                  label: 'Services monitored',
                  value: String(state.data.totals.dependencies),
                  cls: '',
                },
                {
                  label: 'Average uptime · 24h',
                  value: formatUptime(state.data.totals.avg_uptime_24h),
                  cls: uptimeColor(state.data.totals.avg_uptime_24h),
                },
                {
                  label: 'Open incidents',
                  value: String(state.data.totals.open_incidents),
                  cls:
                    state.data.totals.open_incidents > 0
                      ? 'text-[#D97706] dark:text-[#FBBF24]'
                      : '',
                },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-xl border border-[#E8EBF0] bg-white p-5 dark:border-[#1E293B] dark:bg-[#111726] print:border-[#E8EBF0] print:bg-white print:shadow-none"
                >
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#69748A] dark:text-[#6B7893]">
                    {c.label}
                  </div>
                  <div className={cn('font-mono text-[30px] font-bold leading-none', c.cls)}>
                    {c.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Client cards — grid sm:2 lg:3 per spec, borders only no shadows/animations in print */}
            {!state.data.clients.length ? (
              <div className="rounded-xl border border-dashed border-[#D5DAE2] p-12 text-center text-sm text-[#69748A] dark:border-[#313F58] dark:text-[#6B7893]">
                No clients are published on this portal yet.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {state.data.clients.map((client) => {
                  const s = statusStyle(client.status);
                  return (
                    <section
                      key={client.id}
                      className="flex flex-col rounded-xl border border-[#E8EBF0] bg-white p-6 dark:border-[#1E293B] dark:bg-[#111726] print:border-[#E8EBF0] print:bg-white print:shadow-none"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-base font-semibold tracking-[-0.01em]">
                          {client.name}
                        </h2>
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
                            s.text,
                            s.bg
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
                          {s.label}
                        </span>
                      </div>

                      <div className="mt-5 flex items-end justify-between">
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-[#69748A] dark:text-[#6B7893]">
                            Uptime · 24h
                          </div>
                          <div className={cn('mt-1 font-mono text-3xl font-bold leading-none', uptimeColor(client.uptime_24h))}>
                            {formatUptime(client.uptime_24h)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] uppercase tracking-wide text-[#69748A] dark:text-[#6B7893]">
                            Latency
                          </div>
                          <div className="mt-1 font-mono text-sm text-[#0B1220] dark:text-[#F8FAFC]">
                            {formatLatency(client.avg_latency_ms)}
                            <span className="ml-0.5 text-xs opacity-60">ms</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[#F1F3F7] dark:bg-[#182136] print:bg-[#F1F3F7]">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            client.uptime_24h >= 99.9
                              ? 'bg-[#059669]'
                              : client.uptime_24h >= 99
                                ? 'bg-[#D97706]'
                                : 'bg-[#DC2626]'
                          )}
                          style={{ width: `${Math.min(100, Math.max(2, client.uptime_24h))}%` }}
                        />
                      </div>

                      <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-[#E8EBF0] pt-4 text-center dark:border-[#1E293B] print:border-[#E8EBF0]">
                        {[
                          ['Services', String(client.dependency_count)],
                          ['Open incidents', String(client.open_incidents)],
                          [
                            'Last incident',
                            client.last_incident_at
                              ? new Date(client.last_incident_at).toLocaleDateString()
                              : 'Never',
                          ],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-[10px] uppercase tracking-wide text-[#69748A] dark:text-[#6B7893]">
                              {k}
                            </dt>
                            <dd className="mt-1 truncate font-mono text-sm">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  );
                })}
              </div>
            )}

            {/* Preferred Source — trust-based, after meaningful SLA data, before footer */}
            <div className="mx-auto mt-10 max-w-2xl print:hidden">
              <PreferredSourceSection variant="incident" />
            </div>

            {/* Footer — signed-data line + Powered by hidden in print */}
            <footer className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-[#E8EBF0] pt-6 text-xs text-[#69748A] sm:flex-row dark:border-[#1E293B] dark:text-[#6B7893] print:flex-row print:border-[#E8EBF0]">
              <span className="font-mono text-[12px]">
                Signed data · generated{' '}
                {new Date(state.data.generated_at).toLocaleString()}
              </span>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 hover:text-[#2563EB] print:hidden rs-no-print"
              >
                Powered by
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#2563EB]">
                  <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.75" />
                  <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Reliastra
              </Link>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
