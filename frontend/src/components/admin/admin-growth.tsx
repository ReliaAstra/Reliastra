'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ChartNoAxesCombined, CircleCheck, CircleDollarSign, UsersRound } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { formatCompactNumber, formatPercent, formatRatioPercent, humanize } from '@/lib/admin-utils';
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
  useAdminPeriod,
} from '@/components/admin/admin-primitives';

export function GrowthPage() {
  const period = useAdminPeriod();
  const overviewQuery = useQuery({ queryKey: ['admin', 'growth', 'overview', period], queryFn: () => adminApi.growthOverview(period), staleTime: 120_000 });
  const funnelQuery = useQuery({ queryKey: ['admin', 'growth', 'funnel', period], queryFn: () => adminApi.growthFunnel(period), staleTime: 120_000 });
  const retentionQuery = useQuery({ queryKey: ['admin', 'growth', 'retention', 12], queryFn: () => adminApi.growthRetention(12), staleTime: 5 * 60_000 });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Business / Growth"
        title="Growth"
        description="Acquisition, activation, conversion, and retention — with the biggest drop made obvious."
        actions={<DateRangeControl className="md:hidden" />}
      />
      {overviewQuery.isLoading && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" />)}</div>}
      {overviewQuery.isError && <AdminCard><SectionFailure title="Growth overview unavailable." description="Growth metrics could not be loaded." onRetry={() => overviewQuery.refetch()} /></AdminCard>}
      {overviewQuery.data && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><MetricCard label="Signups" value={formatCompactNumber(overviewQuery.data.signups)} context={periodLabel(period)} icon={UsersRound} /><MetricCard label="Activated users" value={formatCompactNumber(overviewQuery.data.activated_users)} context="organization created" icon={CircleCheck} /><MetricCard label="Activated orgs" value={formatCompactNumber(overviewQuery.data.activated_organizations)} context="with a dependency" icon={ChartNoAxesCombined} /><MetricCard label="Paying customers" value={formatCompactNumber(overviewQuery.data.paying_customers)} context="active subscriptions" icon={CircleDollarSign} /><MetricCard label="Conversion" value={formatPercent(overviewQuery.data.conversion_rate)} trend={overviewQuery.data.mrr_growth} context="paid / organizations" icon={ChartNoAxesCombined} /></section>}

      <GrowthFunnel query={funnelQuery} />
      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <RetentionPanel query={retentionQuery} />
        <GrowthInterpretation overview={overviewQuery.data} funnel={funnelQuery.data} />
      </section>
    </div>
  );
}

function GrowthFunnel({ query }: { query: { isLoading: boolean; isError: boolean; data?: Awaited<ReturnType<typeof adminApi.growthFunnel>>; refetch: () => unknown } }) {
  const stages = query.data?.stages || [];
  const largestDrop = useMemo(() => {
    if (stages.length < 2) return null;
    return stages.slice(1).reduce<{ stage: string; rate: number } | null>((largest, stage) => {
      const rate = stage.conversion_from_previous ?? 0;
      if (!largest || rate < largest.rate) return { stage: stage.stage, rate };
      return largest;
    }, null);
  }, [stages]);

  return (
    <AdminCard>
      <SectionHeading title="Activation funnel" subtitle="Signup → verification → organization → dependency → monitoring → paid" />
      <div className="border-t border-slate-100 p-5 dark:border-white/10 sm:p-6">
        {query.isLoading && <SectionSkeleton lines={7} />}
        {query.isError && <SectionFailure title="Funnel unavailable." description="Activation stages could not be loaded." onRetry={() => query.refetch()} />}
        {query.data && stages.length === 0 && <AdminEmptyState title="No funnel events yet." description="The growth funnel will appear as activation events accumulate." icon={ChartNoAxesCombined} />}
        {query.data && stages.length > 0 && (
          <div className="space-y-3">
            {stages.map((stage, index) => {
              const base = Math.max(stages[0]?.count || 1, 1);
              const width = Math.max(4, Math.min(100, (stage.count / base) * 100));
              const isLargestDrop = largestDrop?.stage === stage.stage;
              return (
                <div key={stage.stage} className={cn('rounded-lg border p-3.5 transition-colors sm:grid sm:grid-cols-[155px_minmax(0,1fr)_90px] sm:items-center sm:gap-4', isLargestDrop ? 'border-amber-200 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/[0.06]' : 'border-slate-100 bg-white dark:border-white/10 dark:bg-card')}>
                  <div className="flex items-center justify-between gap-3 sm:block"><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{humanize(stage.stage)}</p><p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Stage {index + 1}</p></div>
                  <div className="mt-3 sm:mt-0"><div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className={cn('h-full rounded-full', isLargestDrop ? 'bg-amber-500' : 'bg-blue-600')} style={{ width: `${width}%` }} /></div></div>
                  <div className="mt-3 flex items-center justify-between sm:mt-0 sm:block sm:text-right"><p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{formatCompactNumber(stage.count)}</p><p className={cn('mt-0.5 text-xs tabular-nums', isLargestDrop ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400')}>{stage.conversion_from_previous === null || stage.conversion_from_previous === undefined ? 'Starting point' : `${formatRatioPercent(stage.conversion_from_previous)} from prior`}</p></div>
                </div>
              );
            })}
          </div>
        )}
        {largestDrop && <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm dark:border-amber-500/20 dark:bg-amber-500/[0.06]"><ArrowDownRight className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" /><p className="leading-6 text-amber-900 dark:text-amber-100">Largest observed drop: <strong>{humanize(largestDrop.stage)}</strong> retains {formatRatioPercent(largestDrop.rate)} of the prior stage. This is the highest-leverage place to investigate.</p></div>}
      </div>
    </AdminCard>
  );
}

function RetentionPanel({ query }: { query: { isLoading: boolean; isError: boolean; data?: Awaited<ReturnType<typeof adminApi.growthRetention>>; refetch: () => unknown } }) {
  return (
    <AdminCard>
      <SectionHeading title="Retention" subtitle="Cohort reporting is shown when the backend has historical data" />
      <div className="border-t border-slate-100 dark:border-white/10">
        {query.isLoading && <SectionSkeleton lines={5} />}
        {query.isError && <SectionFailure title="Retention data unavailable." description="Try refreshing this section." onRetry={() => query.refetch()} />}
        {query.data && query.data.cohorts.length === 0 && <AdminEmptyState title="Retention cohorts are not available yet." description="RELIASTRA will show 30D and 90D cohort behavior here once sufficient historical activity exists." icon={UsersRound} />}
        {query.data && query.data.cohorts.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left"><thead><tr className="border-b border-slate-100 bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.02]"><th className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Cohort</th><th className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Data</th></tr></thead><tbody>{query.data.cohorts.map((cohort, index) => <tr key={index} className="border-b border-slate-100 last:border-0 dark:border-white/10"><td className="px-5 py-3.5 text-sm text-slate-700 dark:text-slate-200">Cohort {index + 1}</td><td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">{Object.entries(cohort).map(([key, value]) => `${humanize(key)}: ${String(value)}`).join(' · ')}</td></tr>)}</tbody></table></div>}
      </div>
    </AdminCard>
  );
}

function GrowthInterpretation({ overview, funnel }: { overview?: Awaited<ReturnType<typeof adminApi.growthOverview>>; funnel?: Awaited<ReturnType<typeof adminApi.growthFunnel>> }) {
  const paidStage = funnel?.stages.find((stage) => stage.stage === 'paid');
  const monitoringStage = funnel?.stages.find((stage) => stage.stage === 'monitoring_started' || stage.stage === 'activated');
  return (
    <AdminCard>
      <SectionHeading title="Operator readout" subtitle="The decision-level context behind the funnel" />
      <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/10 dark:border-white/10">
        <ReadoutRow label="Acquisition" value={overview ? `${formatCompactNumber(overview.signups)} signups` : '—'} detail={overview ? periodLabel(overview.period) : 'Waiting for growth overview'} />
        <ReadoutRow label="Activation" value={monitoringStage ? `${formatCompactNumber(monitoringStage.count)} monitoring` : '—'} detail="Organizations that reached the monitoring portion of the funnel" />
        <ReadoutRow label="Conversion" value={paidStage ? `${formatCompactNumber(paidStage.count)} paid` : '—'} detail={overview ? `${formatPercent(overview.conversion_rate)} paid / organization conversion` : 'Waiting for growth overview'} />
        <ReadoutRow label="MRR growth" value={overview ? formatPercent(overview.mrr_growth, { sign: true }) : '—'} detail="Historical MRR movement is currently supplied by the revenue view" />
      </div>
    </AdminCard>
  );
}

function ReadoutRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="px-5 py-4 sm:px-6"><div className="flex items-baseline justify-between gap-4"><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p><p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p></div><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p></div>;
}

function periodLabel(period: string) {
  if (period === '365d') return 'last 12 months';
  if (period.endsWith('d')) return `last ${period.slice(0, -1)} days`;
  return period;
}
