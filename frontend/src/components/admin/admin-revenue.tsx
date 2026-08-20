'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, CircleDollarSign, TrendingDown, TrendingUp, UsersRound } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { attentionHref, formatAdminCurrency, formatAdminDate, formatCompactNumber, formatPercent, formatRelativeTime } from '@/lib/admin-utils';
import { cn } from '@/lib/utils';
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  DateRangeControl,
  MetricCard,
  SectionFailure,
  SectionHeading,
  SectionSkeleton,
  StatusPill,
  useAdminPeriod,
} from '@/components/admin/admin-primitives';

export function RevenuePage() {
  const period = useAdminPeriod();
  const summaryQuery = useQuery({ queryKey: ['admin', 'revenue', 'summary'], queryFn: adminApi.revenueSummary, staleTime: 60_000 });
  const seriesQuery = useQuery({ queryKey: ['admin', 'revenue', 'timeseries', period], queryFn: () => adminApi.revenueTimeseries(period), staleTime: 90_000 });
  const attentionQuery = useQuery({ queryKey: ['admin', 'revenue', 'attention'], queryFn: adminApi.revenueAttention, staleTime: 60_000 });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Business / Revenue"
        title="Revenue"
        description="A restrained view of MRR, the movements behind it, and the risks worth acting on."
        actions={<DateRangeControl className="md:hidden" />}
      />

      {summaryQuery.isLoading && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" />)}</div>}
      {summaryQuery.isError && <AdminCard><SectionFailure title="Revenue summary unavailable." description="MRR and movement data could not be loaded." onRetry={() => summaryQuery.refetch()} /></AdminCard>}
      {summaryQuery.data && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="MRR" value={formatAdminCurrency(summaryQuery.data.mrr, summaryQuery.data.currency)} trend={summaryQuery.data.mrr_growth} context="current recurring revenue" icon={CircleDollarSign} />
          <MetricCard label="ARR estimate" value={formatAdminCurrency(summaryQuery.data.arr_estimate, summaryQuery.data.currency)} context="MRR × 12" icon={TrendingUp} />
          <MetricCard label="Paying customers" value={formatCompactNumber(summaryQuery.data.paying_customers)} context="active subscriptions" icon={UsersRound} />
          <MetricCard label="ARPU" value={formatAdminCurrency(summaryQuery.data.arpu, summaryQuery.data.currency)} context="per paying customer" icon={CircleDollarSign} />
          <MetricCard label="Net new MRR" value={formatAdminCurrency(summaryQuery.data.net_new_mrr, summaryQuery.data.currency)} trend={summaryQuery.data.net_new_mrr} context="current reporting period" icon={summaryQuery.data.net_new_mrr >= 0 ? TrendingUp : TrendingDown} />
        </section>
      )}

      <AdminCard>
        <SectionHeading title="MRR performance" subtitle={`Actual subscription history · ${periodLabel(period)}`} />
        <div className="border-t border-slate-100 p-5 dark:border-white/10 sm:p-6">
          {seriesQuery.isLoading && <SectionSkeleton lines={7} />}
          {seriesQuery.isError && <SectionFailure title="MRR history unavailable." description="The rest of the revenue view is still available." onRetry={() => seriesQuery.refetch()} />}
          {seriesQuery.data && <RevenuePerformanceChart data={seriesQuery.data.data_points} currency={summaryQuery.data?.currency || 'USD'} />}
        </div>
      </AdminCard>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <RevenueMovements summary={summaryQuery.data} loading={summaryQuery.isLoading} />
        <RevenueWatchlist query={attentionQuery} />
      </section>
    </div>
  );
}

function RevenuePerformanceChart({ data, currency }: { data: Array<{ date: string; mrr: number; paying_customers?: number | null }>; currency: string }) {
  if (!data.length) return <AdminEmptyState title="No revenue history yet." description="MRR history will appear after subscription activity is available." icon={CircleDollarSign} />;
  const latest = data[data.length - 1];
  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div><p className="text-3xl font-semibold tracking-[-0.04em] tabular-nums text-slate-950 dark:text-white">{formatAdminCurrency(latest.mrr, currency)}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Latest recorded MRR</p></div>
        {latest.paying_customers !== null && latest.paying_customers !== undefined && <p className="text-sm text-slate-500 dark:text-slate-400"><strong className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatCompactNumber(latest.paying_customers)}</strong> paying customers at this point</p>}
      </div>
      <div className="mt-5 h-[300px]" aria-label="MRR performance chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 5, left: -18, bottom: 0 }}>
            <defs><linearGradient id="revenuePageGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1d4ed8" stopOpacity={0.18} /><stop offset="1" stopColor="#1d4ed8" stopOpacity={0.01} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="#e7edf5" strokeDasharray="3 4" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tickMargin={10} minTickGap={30} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={chartDate} />
            <YAxis axisLine={false} tickLine={false} width={42} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(value) => formatAdminCurrency(Number(value), currency, true)} />
            <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 10px 24px rgba(15,23,42,.08)', fontSize: 12 }} labelFormatter={(value) => formatAdminDate(String(value))} formatter={(value) => [formatAdminCurrency(Number(value), currency), 'MRR']} />
            <Area type="monotone" dataKey="mrr" stroke="#1d4ed8" strokeWidth={2.35} fill="url(#revenuePageGradient)" activeDot={{ r: 4, stroke: '#1d4ed8', strokeWidth: 2, fill: '#fff' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function RevenueMovements({ loading, summary }: { loading: boolean; summary?: Awaited<ReturnType<typeof adminApi.revenueSummary>> }) {
  if (loading) return <AdminCard><SectionSkeleton lines={7} /></AdminCard>;
  if (!summary) return null;
  const rows = [
    ['New MRR', summary.new_mrr, 'positive'],
    ['Expansion', summary.expansion_mrr, 'positive'],
    ['Contraction', summary.contraction_mrr, 'negative'],
    ['Churned MRR', summary.churned_mrr, 'negative'],
  ] as const;
  return (
    <AdminCard>
      <SectionHeading title="Revenue movements" subtitle="The elements that explain net MRR" />
      <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/10 dark:border-white/10">
        {rows.map(([label, amount, direction]) => <div key={label} className="flex items-center justify-between px-5 py-4 sm:px-6"><span className="text-sm text-slate-600 dark:text-slate-300">{label}</span><span className={cn('font-medium tabular-nums', direction === 'positive' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>{amount > 0 ? (direction === 'positive' ? '+' : '−') : ''}{formatAdminCurrency(Math.abs(amount), summary.currency)}</span></div>)}
        <div className="flex items-center justify-between bg-slate-50 px-5 py-4 dark:bg-white/[0.03] sm:px-6"><span className="text-sm font-semibold text-slate-900 dark:text-white">Net new MRR</span><span className={cn('text-lg font-semibold tabular-nums', summary.net_new_mrr >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>{summary.net_new_mrr > 0 ? '+' : ''}{formatAdminCurrency(summary.net_new_mrr, summary.currency)}</span></div>
      </div>
    </AdminCard>
  );
}

function RevenueWatchlist({
  query,
}: {
  query: {
    isLoading: boolean;
    isError: boolean;
    data?: Awaited<ReturnType<typeof adminApi.revenueAttention>>;
    refetch: () => unknown;
  };
}) {
  // The query state is passed through so this isolated panel can retry without
  // coupling its failure to revenue charts.
  if (query.isLoading) return <AdminCard><SectionSkeleton lines={5} /></AdminCard>;
  if (query.isError) return <AdminCard><SectionFailure title="Revenue watchlist unavailable." description="Try refreshing this isolated section." onRetry={() => query.refetch()} /></AdminCard>;
  const items = query.data?.items || [];
  return (
    <AdminCard>
      <SectionHeading title="Revenue watchlist" subtitle="Events that deserve an operator’s review" />
      <div className="border-t border-slate-100 dark:border-white/10">
        {items.length === 0 && <AdminEmptyState title="No revenue risks on the watchlist." description="Failed payment, revenue-drop, and churn-risk alerts will appear here when the backend detects them." icon={AlertTriangle} />}
        {items.map((item) => <Link key={`${item.type}-${item.title}`} href={attentionHref(item)} className="group flex items-start gap-3 border-b border-slate-100 px-5 py-4 last:border-0 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.03] sm:px-6"><span className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.priority === 'critical' ? 'bg-rose-500' : item.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500')} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{item.title}</span>{item.description && <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{item.description}</span>}</span><ArrowRight className="mt-1 size-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5" /></Link>)}
      </div>
    </AdminCard>
  );
}

function chartDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function periodLabel(period: string) {
  return period === '365d' ? 'last 12 months' : `last ${period.slice(0, -1)} days`;
}
