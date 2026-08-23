'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  CircleDollarSign,
  HeartPulse,
  Radio,
  ServerCog,
  ShieldCheck,
  TicketCheck,
  UsersRound,
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
import { adminApi } from '@/lib/admin-api';
import { AdminAnalyticsPanel } from '@/components/admin/analytics-panel';
import {
  attentionHref,
  formatAdminCurrency,
  formatAdminDate,
  formatCompactNumber,
  formatPercent,
  formatRatioPercent,
  formatRelativeTime,
  healthTone,
  humanize,
} from '@/lib/admin-utils';
import { useAdminAccess } from '@/components/admin/admin-provider';
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  DateRangeControl,
  HealthDot,
  MetricCard,
  SectionFailure,
  SectionHeading,
  SectionSkeleton,
  StatusPill,
  useAdminPeriod,
} from '@/components/admin/admin-primitives';
import { useChartTheme } from '@/components/admin/analytics-panel';
import { cn } from '@/lib/utils';

export function AdminOverview() {
  const { overview } = useAdminAccess();
  const period = useAdminPeriod();
  const profileQuery = useQuery({
    queryKey: ['admin', 'current-user'],
    queryFn: adminApi.currentUser,
    staleTime: 5 * 60_000,
  });
  const attentionQuery = useQuery({
    queryKey: ['admin', 'attention'],
    queryFn: adminApi.attention,
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const attention = attentionQuery.data?.items || overview.actions_required;
  const hasCriticalSystemIssue = [
    overview.system.api_health,
    overview.system.database_health,
    overview.system.redis_health,
    overview.system.worker_health,
    overview.system.scheduler_health,
  ].some((health) => healthTone(health.status) === 'critical');
  const firstName = profileQuery.data?.full_name?.trim().split(/\s+/)[0];
  const greeting = greetingForHour();

  return (
    <div className="space-y-6 sm:space-y-7">
      <AdminPageHeader
        eyebrow="Command center"
        title={firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}
        description="Here’s the clearest view of what needs your attention today."
        actions={
          <div className="flex items-center gap-3">
            <Freshness generatedAt={overview.generated_at} />
            <DateRangeControl className="md:hidden" />
          </div>
        }
      />

      {hasCriticalSystemIssue && <CriticalIncidentBanner />}

      <AttentionStrip
        items={attention}
        isLoading={attentionQuery.isLoading}
        isError={attentionQuery.isError && overview.actions_required.length === 0}
        onRetry={() => attentionQuery.refetch()}
      />

      <section aria-label="Primary business metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="MRR"
          value={formatAdminCurrency(overview.business.mrr)}
          trend={overview.growth.mrr_growth}
          context="vs prior period"
          icon={CircleDollarSign}
        />
        <MetricCard
          label="MRR growth"
          value={formatPercent(overview.growth.mrr_growth, { sign: true })}
          context="vs prior period"
          icon={ChartNoAxesCombined}
        />
        <MetricCard
          label="Paying orgs"
          value={formatCompactNumber(overview.business.paying_organizations)}
          trend={overview.growth.customer_growth}
          context="active subscriptions"
          icon={Building2}
        />
        <MetricCard
          label="New signups"
          value={formatCompactNumber(overview.business.new_signups)}
          trend={overview.growth.signup_growth}
          context="in the last 7 days"
          icon={UsersRound}
        />
        <MetricCard
          label="Retention signal"
          value={formatPercent(Math.max(0, 100 - overview.business.churn_rate))}
          context={`${formatCompactNumber(overview.business.churn_count)} churn signals`}
          icon={HeartPulse}
        />
      </section>

      <RevenueSection period={period} />

      <AdminAnalyticsPanel />

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <CustomerSignals overview={overview} attention={attention} />
        <ProductHealth overview={overview} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <RecentCustomers />
        <SupportSnapshot overview={overview} />
      </section>

      <SystemSnapshot overview={overview} />
    </div>
  );
}

function Freshness({ generatedAt }: { generatedAt: string }) {
  return (
    <span className="hidden items-center gap-1.5 text-[11px] text-slate-500 sm:inline-flex dark:text-slate-400">
      <Radio className="size-3 text-emerald-500" />
      Updated {formatRelativeTime(generatedAt)}
    </span>
  );
}

function CriticalIncidentBanner() {
  return (
    <Link
      href="/admin/operations"
      className="group flex flex-col gap-4 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-left transition-colors hover:bg-rose-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:border-rose-500/25 dark:bg-rose-500/10 dark:hover:bg-rose-500/15 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-white">
          <ServerCog className="size-4.5" />
        </span>
        <span>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">Critical system issue</span>
          <span className="mt-1 block text-sm font-medium text-rose-950 dark:text-rose-100">Infrastructure health needs review before routine work.</span>
        </span>
      </div>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-rose-800 dark:text-rose-200">
        View operations <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function AttentionStrip({
  items,
  isLoading,
  isError,
  onRetry,
}: {
  items: ReturnType<typeof useAdminAccess>['overview']['actions_required'];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading && items.length === 0) {
    return <AdminCard><SectionSkeleton lines={2} /></AdminCard>;
  }
  if (isError) {
    return (
      <AdminCard>
        <SectionFailure title="Attention data unavailable." description="Other business sections are still available." onRetry={onRetry} compact />
      </AdminCard>
    );
  }
  if (items.length === 0) {
    return (
      <AdminCard className="border-emerald-200/80 bg-emerald-50/30 dark:border-emerald-500/15 dark:bg-emerald-500/[0.03]">
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <ShieldCheck className="size-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Attention</p>
            <p className="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-100">The watchlist is clear.</p>
          </div>
        </div>
      </AdminCard>
    );
  }
  return (
    <AdminCard className="border-amber-200/90 bg-[linear-gradient(90deg,rgba(255,251,235,.92),rgba(255,255,255,.95))] dark:border-amber-500/20 dark:bg-[linear-gradient(90deg,rgba(120,53,15,.16),rgba(255,255,255,.02))]">
      <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
        <div className="flex shrink-0 items-center gap-3 lg:w-32">
          <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            <Activity className="size-4" />
          </span>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-200">Attention</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-2">
          {items.slice(0, 4).map((item, index) => (
            <span key={`${item.type}-${item.title}`} className="flex items-center">
              {index > 0 && <span className="mx-3 hidden h-4 w-px bg-amber-300/70 sm:block dark:bg-amber-500/20" />}
              <Link
                href={attentionHref(item)}
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-800 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-slate-100 dark:hover:text-white"
              >
                <span className={cn('size-1.5 rounded-full', item.priority === 'critical' ? 'bg-rose-500' : item.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500')} />
                {item.title}
                <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </span>
          ))}
          {items.length > 4 && <Link href="/admin/operations" className="text-xs font-medium text-amber-800 underline-offset-4 hover:underline dark:text-amber-200">+{items.length - 4} more</Link>}
        </div>
      </div>
    </AdminCard>
  );
}

function RevenueSection({ period }: { period: ReturnType<typeof useAdminPeriod> }) {
  const timeSeriesQuery = useQuery({
    queryKey: ['admin', 'revenue', 'timeseries', period],
    queryFn: () => adminApi.revenueTimeseries(period),
    staleTime: 90_000,
  });
  const summaryQuery = useQuery({
    queryKey: ['admin', 'revenue', 'summary'],
    queryFn: adminApi.revenueSummary,
    staleTime: 60_000,
  });

  return (
    <AdminCard>
      <SectionHeading
        title="Revenue"
        subtitle="MRR performance and the movements behind it"
        action={<Link href="/admin/revenue" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Full revenue view <ArrowRight className="size-3" /></Link>}
      />
      <div className="grid border-t border-slate-100 dark:border-white/10 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <div className="min-h-[286px] border-b border-slate-100 p-5 dark:border-white/10 xl:border-b-0 xl:border-r sm:p-6">
          {timeSeriesQuery.isLoading && <SectionSkeleton lines={6} className="pt-3" />}
          {timeSeriesQuery.isError && (
            <SectionFailure title="Revenue data unavailable." description="MRR time-series data could not be loaded." onRetry={() => timeSeriesQuery.refetch()} />
          )}
          {timeSeriesQuery.data && <RevenueChart data={timeSeriesQuery.data.data_points} currency={summaryQuery.data?.currency || 'USD'} />}
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/10">
          {summaryQuery.isLoading && <SectionSkeleton lines={5} />}
          {summaryQuery.isError && <SectionFailure title="Revenue insights unavailable." description="Try refreshing this section." onRetry={() => summaryQuery.refetch()} compact />}
          {summaryQuery.data && <RevenueInsights summary={summaryQuery.data} />}
        </div>
      </div>
    </AdminCard>
  );
}

function RevenueChart({
  data,
  currency,
}: {
  data: Array<{ date: string; mrr: number }>;
  currency: string;
}) {
  const chartTheme = useChartTheme();
  if (data.length === 0) {
    return <AdminEmptyState title="No revenue history yet." description="MRR history will appear here as active subscription data accumulates." icon={CircleDollarSign} />;
  }
  const latest = data[data.length - 1]?.mrr ?? 0;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Current MRR</p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] tabular-nums text-slate-950 dark:text-white">{formatAdminCurrency(latest, currency)}</p>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Actual subscription history</p>
      </div>
      <div className="mt-5 min-h-0 flex-1" aria-label={`MRR line chart ending at ${formatAdminCurrency(latest, currency)}`}>
        <ResponsiveContainer width="100%" height={205}>
          <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="adminMrrArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={chartTheme.grid} strokeDasharray="3 4" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              minTickGap={28}
              tick={{ fill: chartTheme.tick, fontSize: 10 }}
              tickFormatter={(value) => formatChartDate(value)}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={40}
              tick={{ fill: chartTheme.tick, fontSize: 10 }}
              tickFormatter={(value) => formatAdminCurrency(Number(value), currency, true)}
            />
            <Tooltip
              cursor={{ stroke: chartTheme.cursor, strokeWidth: 1 }}
              contentStyle={{ borderRadius: 10, border: `1px solid ${chartTheme.tooltipBorder}`, background: chartTheme.tooltipBg, boxShadow: '0 10px 24px rgba(15,23,42,.08)', fontSize: 12 }}
              labelFormatter={(label) => formatAdminDate(String(label))}
              formatter={(value) => [formatAdminCurrency(Number(value), currency), 'MRR']}
            />
            <Area type="monotone" dataKey="mrr" stroke="#2563eb" strokeWidth={2.2} fill="url(#adminMrrArea)" activeDot={{ r: 4, strokeWidth: 2, fill: chartTheme.dotFill, stroke: '#2563eb' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function RevenueInsights({ summary }: { summary: Awaited<ReturnType<typeof adminApi.revenueSummary>> }) {
  const rows = [
    ['New MRR', summary.new_mrr, 'positive'],
    ['Expansion', summary.expansion_mrr, 'positive'],
    ['Contraction', summary.contraction_mrr, 'negative'],
    ['Churned MRR', summary.churned_mrr, 'negative'],
  ] as const;
  return (
    <div>
      <div className="px-5 pb-3 pt-5 sm:px-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">MRR movement</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Why revenue moved</p>
      </div>
      {rows.map(([label, amount, direction]) => (
        <div key={label} className="flex items-center justify-between px-5 py-3 sm:px-6">
          <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
          <span className={cn('text-sm font-medium tabular-nums', direction === 'positive' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
            {direction === 'positive' && amount > 0 ? '+' : direction === 'negative' && amount > 0 ? '−' : ''}{formatAdminCurrency(Math.abs(amount), summary.currency)}
          </span>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between bg-slate-50 px-5 py-4 dark:bg-white/[0.03] sm:px-6">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Net new MRR</span>
        <span className={cn('text-base font-semibold tabular-nums', summary.net_new_mrr >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
          {summary.net_new_mrr > 0 ? '+' : ''}{formatAdminCurrency(summary.net_new_mrr, summary.currency)}
        </span>
      </div>
    </div>
  );
}

function CustomerSignals({
  overview,
  attention,
}: {
  overview: ReturnType<typeof useAdminAccess>['overview'];
  attention: ReturnType<typeof useAdminAccess>['overview']['actions_required'];
}) {
  const atRisk = attention.filter((item) => item.type.includes('churn') || item.type.includes('risk')).reduce((sum, item) => sum + Math.max(item.count, 0), 0);
  const active = Math.max(overview.business.active_organizations, overview.business.paying_organizations, 0);
  const churned = Math.max(overview.business.churn_count, 0);
  const atRiskPct = active > 0 ? Math.min(100, (atRisk / active) * 100) : 0;
  const churnedPct = active > 0 ? Math.min(100 - atRiskPct, (churned / active) * 100) : 0;
  const steadyPct = Math.max(0, 100 - atRiskPct - churnedPct);

  return (
    <AdminCard>
      <SectionHeading
        title="Customers"
        subtitle="Customer health, expressed as a clear operating signal"
        action={<Link href="/admin/customers" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Customers <ArrowRight className="size-3" /></Link>}
      />
      <div className="border-t border-slate-100 p-5 dark:border-white/10 sm:p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-semibold tracking-[-0.04em] tabular-nums text-slate-950 dark:text-white">{formatCompactNumber(active)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">active organizations in the current overview</p>
          </div>
          <Link href="/admin/customers?health=at_risk" className="text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            <p className={cn('text-xl font-semibold tabular-nums', atRisk > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200')}>{formatCompactNumber(atRisk)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">at-risk watchlist</p>
          </Link>
        </div>
        <div className="mt-7 flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10" aria-label={`Customer signals: ${steadyPct.toFixed(0)} percent steady, ${atRiskPct.toFixed(0)} percent at risk, ${churnedPct.toFixed(0)} percent churn signals`}>
          <span className="bg-emerald-500" style={{ width: `${steadyPct}%` }} />
          <span className="bg-amber-500" style={{ width: `${atRiskPct}%` }} />
          <span className="bg-rose-500" style={{ width: `${churnedPct}%` }} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SignalLegend label="Steady" value={active > 0 ? formatPercent(steadyPct, { fractionDigits: 0 }) : '—'} color="bg-emerald-500" />
          <SignalLegend label="At risk" value={formatCompactNumber(atRisk)} color="bg-amber-500" />
          <SignalLegend label="Churn signals" value={formatCompactNumber(churned)} color="bg-rose-500" />
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500 dark:text-slate-400">At-risk count comes from the live attention watchlist; the bar is contextualized against active organizations.</p>
      </div>
    </AdminCard>
  );
}

function SignalLegend({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><span className={cn('size-2 rounded-full', color)} />{label}</span>
      <span className="text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}

function ProductHealth({ overview }: { overview: ReturnType<typeof useAdminAccess>['overview'] }) {
  const metrics = [
    ['Active monitors', overview.product.active_monitors],
    ['Dependencies', overview.product.dependencies],
    ['Checks today', overview.product.checks_today],
    ['Open incidents', overview.product.open_incidents],
  ];
  return (
    <AdminCard>
      <SectionHeading
        title="Product health"
        subtitle="Are customers getting value from RELIASTRA?"
        action={<Link href="/admin/product" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Product <ArrowRight className="size-3" /></Link>}
      />
      <div className="grid border-t border-slate-100 dark:border-white/10 sm:grid-cols-2">
        {metrics.map(([label, value], index) => (
          <Link
            key={label}
            href="/admin/product"
            className={cn('group p-5 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]', index % 2 === 0 && 'sm:border-r sm:border-slate-100 dark:sm:border-white/10', index < 2 && 'border-b border-slate-100 dark:border-white/10')}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className={cn('mt-3 text-2xl font-semibold tracking-[-0.04em] tabular-nums', label === 'Open incidents' && Number(value) > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-white')}>
              {formatCompactNumber(Number(value))}
            </p>
            <span className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200">Inspect <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" /></span>
          </Link>
        ))}
      </div>
    </AdminCard>
  );
}

function RecentCustomers() {
  const query = useQuery({
    queryKey: ['admin', 'customers', 'recent', 7],
    queryFn: () => adminApi.recentCustomers(7),
    staleTime: 60_000,
  });
  return (
    <AdminCard>
      <SectionHeading
        title="Recent customers"
        subtitle="New accounts with the business context that matters"
        action={<Link href="/admin/customers" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">View all <ArrowRight className="size-3" /></Link>}
      />
      <div className="border-t border-slate-100 dark:border-white/10">
        {query.isLoading && <SectionSkeleton lines={6} />}
        {query.isError && <SectionFailure title="Recent customers unavailable." description="Customer data could not be loaded." onRetry={() => query.refetch()} />}
        {query.data && query.data.items.length === 0 && <AdminEmptyState title="No recent customers yet." description="New RELIASTRA customers will appear here as they join." icon={UsersRound} />}
        {query.data && query.data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.02]">
                  {['Customer', 'Plan', 'MRR', 'Joined', 'Health'].map((heading) => <th key={heading} className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{heading}</th>)}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((customer) => (
                  <tr key={customer.customer_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-white/10 dark:hover:bg-white/[0.03]">
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/customers/${customer.customer_id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{customer.full_name || customer.email}</span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{customer.org_name || customer.email}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-300">{customer.plan ? humanize(customer.plan) : '—'}</td>
                    <td className="px-5 py-3.5 text-sm font-medium tabular-nums text-slate-800 dark:text-slate-100">{formatAdminCurrency(customer.mrr)}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 dark:text-slate-400">{formatAdminDate(customer.created_at)}</td>
                    <td className="px-5 py-3.5"><StatusPill status={customer.health} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminCard>
  );
}

function SupportSnapshot({ overview }: { overview: ReturnType<typeof useAdminAccess>['overview'] }) {
  const rows = [
    { label: 'Urgent', value: overview.support.urgent_tickets, href: '/admin/support?priority=urgent', emphasis: overview.support.urgent_tickets > 0 },
    { label: 'Open', value: overview.support.open_tickets, href: '/admin/support?status=open', emphasis: false },
    { label: 'Unassigned', value: overview.support.unassigned_tickets, href: '/admin/support?status=open', emphasis: overview.support.unassigned_tickets > 0 },
  ];
  return (
    <AdminCard className="flex flex-col">
      <SectionHeading
        title="Support"
        subtitle="A fast triage signal, not a ticket wall"
        action={<Link href="/admin/support" className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700 hover:text-blue-800 dark:text-blue-300">View support</Link>}
      />
      <div className="flex-1 border-t border-slate-100 dark:border-white/10">
        {rows.map((row) => (
          <Link key={row.label} href={row.href} className="group flex items-center justify-between border-b border-slate-100 px-5 py-4 last:border-0 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.03]">
            <span className="text-sm text-slate-600 dark:text-slate-300">{row.label}</span>
            <span className={cn('flex items-center gap-2 text-lg font-semibold tabular-nums', row.emphasis ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-white')}>
              {row.emphasis && <span className="size-1.5 rounded-full bg-amber-500" />}
              {formatCompactNumber(row.value)}
            </span>
          </Link>
        ))}
      </div>
      <div className="mt-auto border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-400">
        Average response: <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{overview.support.average_response_time_hours.toFixed(1)}h</span>
      </div>
    </AdminCard>
  );
}

function SystemSnapshot({ overview }: { overview: ReturnType<typeof useAdminAccess>['overview'] }) {
  const systems = [
    ['API', overview.system.api_health],
    ['Database', overview.system.database_health],
    ['Redis', overview.system.redis_health],
    ['Workers', overview.system.worker_health],
    ['Scheduler', overview.system.scheduler_health],
  ] as const;
  return (
    <AdminCard>
      <SectionHeading
        title="System health"
        subtitle="Operational signals stay quiet until they matter"
        action={<Link href="/admin/operations" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Operations <ArrowRight className="size-3" /></Link>}
      />
      <div className="grid border-t border-slate-100 dark:border-white/10 sm:grid-cols-2 xl:grid-cols-5">
        {systems.map(([label, health], index) => (
          <Link
            key={label}
            href="/admin/operations"
            className={cn('group flex min-h-[102px] flex-col justify-between p-5 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]', index < systems.length - 1 && 'border-b border-slate-100 sm:border-b-0 sm:border-r dark:border-white/10')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
              <HealthDot status={health.status} />
            </div>
            <div>
              <StatusPill status={health.status} className="mt-4" />
              {health.latency_ms !== undefined && health.latency_ms !== null && <p className="mt-2 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{health.latency_ms.toFixed(0)} ms</p>}
            </div>
          </Link>
        ))}
      </div>
    </AdminCard>
  );
}

function greetingForHour() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatChartDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}
