'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  CreditCard,
  Globe2,
  Mail,
  ShoppingCart,
  UserPlus,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from 'next-themes';
import { adminApi } from '@/lib/admin-api';
import type { AbandonedCheckoutLead, AnalyticsSeriesPoint, CountrySlice } from '@/types/admin';
import {
  AdminCard,
  SectionFailure,
  SectionHeading,
  SectionSkeleton,
} from '@/components/admin/admin-primitives';
import { formatAdminDate, formatRelativeTime } from '@/lib/admin-utils';
import { cn } from '@/lib/utils';

/**
 * Theme-aware recharts palette (fixes hardcoded light-only chart colors).
 *
 * Exported: `admin-overview` and `admin-revenue` both import it, and the
 * missing `export` broke the production build with
 * "Export useChartTheme doesn't exist in target module".
 */
export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return useMemo(
    () => ({
      grid: dark ? '#1E293B' : '#e9edf3',
      tick: dark ? '#64748b' : '#94a3b8',
      cursor: dark ? '#334155' : '#cbd5e1',
      tooltipBorder: dark ? '#313F58' : '#e2e8f0',
      tooltipBg: dark ? '#111726' : '#ffffff',
      dotFill: dark ? '#0B0F19' : '#ffffff',
      line: '#2563eb',
    }),
    [dark]
  );
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', NG: 'Nigeria', CA: 'Canada',
  DE: 'Germany', FR: 'France', IN: 'India', AU: 'Australia', BR: 'Brazil',
  NL: 'Netherlands', ZA: 'South Africa', KE: 'Kenya', GH: 'Ghana',
  SG: 'Singapore', AE: 'United Arab Emirates', IE: 'Ireland', LOCAL: 'Local / internal',
  UNKNOWN: 'Unknown',
};

function countryLabel(code: string) {
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

function flagEmoji(code: string) {
  const c = code.toUpperCase();
  if (c.length !== 2 || !/^[A-Z]{2}$/.test(c)) return '🌐';
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

// ── Funnel bar ───────────────────────────────────────────────────────────────

function FunnelStage({
  label,
  value,
  rate,
  tone,
}: {
  label: string;
  value: number;
  rate?: string;
  tone: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
        {rate && <span className="shrink-0 font-mono text-[10px] text-slate-400">{rate}</span>}
      </div>
      <div className={cn('h-9 rounded-lg px-3 font-mono text-sm font-bold leading-9 tabular-nums text-white', tone)}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function ConversionFunnel({ data }: { data: AnalyticsSeriesPoint[] }) {
  const totals = data.reduce(
    (acc, p) => ({
      visitors: acc.visitors + p.visitors + p.pageviews * 0, // visitors series is daily UV
      pageviews: acc.pageviews + p.pageviews,
      signups: acc.signups + p.signups,
      started: acc.started + p.checkouts_started,
      converted: acc.converted + p.checkouts_converted,
    }),
    { visitors: 0, pageviews: 0, signups: 0, started: 0, converted: 0 }
  );
  void totals.visitors; // window UV comes from the overview card instead

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <FunnelStage label="Pageviews" value={totals.pageviews} tone="bg-slate-700" />
      <FunnelStage label="Sign-ups" value={totals.signups} tone="bg-blue-600" />
      <FunnelStage label="Checkout starts" value={totals.started} tone="bg-violet-600" />
      <FunnelStage label="Converted" value={totals.converted} tone="bg-emerald-600" />
    </div>
  );
}

// ── Traffic chart ────────────────────────────────────────────────────────────

function VisitorsChart({
  data,
  theme,
}: {
  data: AnalyticsSeriesPoint[];
  theme: ReturnType<typeof useChartTheme>;
}) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="adminVisitorsArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.01} />
          </linearGradient>
          <linearGradient id="adminSignupsArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={theme.grid} strokeDasharray="3 4" />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          tickMargin={10}
          minTickGap={28}
          tick={{ fill: theme.tick, fontSize: 10 }}
          tickFormatter={(v) => formatAdminDate(String(v))}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          width={40}
          tick={{ fill: theme.tick, fontSize: 10 }}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ stroke: theme.cursor, strokeWidth: 1 }}
          contentStyle={{
            borderRadius: 10,
            border: `1px solid ${theme.tooltipBorder}`,
            background: theme.tooltipBg,
            boxShadow: '0 10px 24px rgba(15,23,42,.08)',
            fontSize: 12,
          }}
          labelFormatter={(label) => formatAdminDate(String(label))}
        />
        <Area type="monotone" dataKey="visitors" name="Unique visitors" stroke="#7c3aed" strokeWidth={2.2} fill="url(#adminVisitorsArea)" activeDot={{ r: 4, strokeWidth: 2, fill: theme.dotFill, stroke: '#7c3aed' }} />
        <Area type="monotone" dataKey="signups" name="Sign-ups" stroke="#2563eb" strokeWidth={2.2} fill="url(#adminSignupsArea)" activeDot={{ r: 4, strokeWidth: 2, fill: theme.dotFill, stroke: '#2563eb' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Countries ────────────────────────────────────────────────────────────────

function CountryBars({ countries }: { countries: CountrySlice[] }) {
  if (!countries.length) {
    return (
      <p className="px-5 py-8 text-center text-sm text-slate-500 sm:px-6">
        No geography data yet — countries appear once the visit beacon receives traffic.
      </p>
    );
  }
  const max = Math.max(...countries.map((c) => c.views), 1);
  return (
    <ul className="space-y-2.5">
      {countries.map((c) => (
        <li key={c.country}>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
              <span aria-hidden>{flagEmoji(c.country)}</span>
              {countryLabel(c.country)}
            </span>
            <span className="font-mono tabular-nums text-slate-500">{c.views.toLocaleString()}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-500"
              style={{ width: `${Math.max(4, Math.round((c.views / max) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Abandoned checkouts — THE outreach table ────────────────────────────────

function AbandonedTable({ leads }: { leads: AbandonedCheckoutLead[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!leads.length) {
    return (
      <p className="px-5 py-8 text-center text-sm text-slate-500 sm:px-6">
        No abandoned checkouts right now. Every organization that reached
        checkout has completed payment — or their lead expired.
      </p>
    );
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left dark:border-white/10">
              {['Contact', 'Organization', 'Plan', 'Value', 'Abandoned for', 'Outreach'].map((h) => (
                <th key={h} className={cn('px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500', h !== 'Contact' && 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.org_id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                <td className="max-w-[220px] truncate px-5 py-3.5 font-medium text-slate-800 dark:text-slate-100">
                  {lead.email || '—'}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    type="button"
                    title="Copy org id"
                    onClick={async () => {
                      await navigator.clipboard.writeText(lead.org_id);
                      setCopiedId(lead.org_id);
                      setTimeout(() => setCopiedId(null), 1500);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
                  >
                    {lead.org_id.slice(0, 8)}…
                    {copiedId === lead.org_id && <span className="text-emerald-600">copied</span>}
                  </button>
                </td>
                <td className="px-5 py-3.5 text-right capitalize text-slate-600 dark:text-slate-300">{lead.plan}</td>
                <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-100">
                  ${(lead.amount_minor / 100).toFixed(2)}
                </td>
                <td className="px-5 py-3.5 text-right text-xs text-amber-600 dark:text-amber-400">
                  {lead.started_at ? formatRelativeTime(lead.started_at) : '—'}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <a
                    href={`mailto:${lead.email}?subject=${encodeURIComponent(
                      "Finish setting up Reliastra — your checkout is waiting"
                    )}&body=${encodeURIComponent(
                      `Hi,\n\nI noticed you started upgrading to the ${lead.plan} plan but didn't complete checkout. Happy to help if something got in the way.\n\nRef: ${lead.reference}\n`
                    )}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700 dark:border-white/10 dark:text-slate-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
                  >
                    <Mail size={13} /> Email
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-3 lg:hidden">
        {leads.map((lead) => (
          <li key={lead.org_id} className="rounded-xl border border-slate-100 p-4 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{lead.email}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">{lead.org_id.slice(0, 8)}…</p>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums">${(lead.amount_minor / 100).toFixed(2)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10">
              <span className="text-xs capitalize text-slate-500">
                {lead.plan} · {lead.started_at ? formatRelativeTime(lead.started_at) : '—'}
              </span>
              <a
                href={`mailto:${lead.email}?subject=${encodeURIComponent('Finish setting up Reliastra')}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
              >
                <Mail size={13} /> Reach out
              </a>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ── Panel root ───────────────────────────────────────────────────────────────

export function AdminAnalyticsPanel() {
  const query = useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: () => adminApi.analytics(14),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const chartTheme = useChartTheme();

  const v = query.data?.visitors;
  const s = query.data?.signups;
  const c = query.data?.checkout;

  return (
    <AdminCard>
      <SectionHeading
        title="Traffic & conversion"
        subtitle="Visitors, geography and the path to paying — updated every 2 minutes"
        action={
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
            {query.data ? `window ${query.data.window_days}d` : ''}
          </span>
        }
      />

      {query.isLoading && <SectionSkeleton lines={7} />}
      {query.isError && (
        <SectionFailure
          title="Traffic data unavailable."
          description="The analytics service could not be reached."
          onRetry={() => query.refetch()}
        />
      )}

      {query.data && v && s && c && (
        <div className="space-y-7 border-t border-slate-100 p-5 dark:border-white/10 sm:p-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { icon: Activity, label: 'Unique visitors', value: v.unique_total.toLocaleString(), sub: `${v.unique_today} today`, color: 'text-violet-600 dark:text-violet-400' },
              { icon: UserPlus, label: 'Sign-ups', value: s.total.toLocaleString(), sub: `${s.last_7d} in last 7 days`, color: 'text-blue-600 dark:text-blue-400' },
              { icon: ShoppingCart, label: 'Checkouts started', value: c.started_total.toLocaleString(), sub: `${c.start_rate_from_signups}% of sign-ups`, color: 'text-amber-600 dark:text-amber-400' },
              { icon: CreditCard, label: 'Converted', value: c.converted_total.toLocaleString(), sub: `${c.abandonment_rate}% abandoned`, color: 'text-emerald-600 dark:text-emerald-400' },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className="rounded-xl border border-slate-100 p-4 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <Icon size={16} className={kpi.color} />
                    <ArrowRight size={12} className="text-slate-300 dark:text-slate-600" />
                  </div>
                  <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{kpi.value}</p>
                  <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">{kpi.label}</p>
                  <p className="text-xs text-slate-400">{kpi.sub}</p>
                </div>
              );
            })}
          </div>

          {/* Chart + funnel */}
          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                Visitors vs sign-ups
              </p>
              <VisitorsChart data={query.data.series} theme={chartTheme} />
            </div>
            <div className="flex flex-col justify-between gap-4">
              <div>
                <p className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                  <Globe2 size={12} /> Top countries
                </p>
                <CountryBars countries={query.data.countries_top} />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              Window funnel ({query.data.window_days}d)
            </p>
            <ConversionFunnel data={query.data.series} />
          </div>

          {/* Abandoned checkouts */}
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-4 dark:border-amber-500/20 dark:bg-amber-500/[0.04] sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Abandoned checkouts
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    {c.abandoned_total}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Reached checkout, never paid. Copy their ID, email them directly.
                </p>
              </div>
            </div>
            <AbandonedTable leads={c.abandoned_leads} />
          </div>

          <p className="text-right font-mono text-[10px] text-slate-400">
            generated {formatAdminDate(query.data.generated_at)}
          </p>
        </div>
      )}
    </AdminCard>
  );
}
