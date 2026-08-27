'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  Link2,
  Copy,
  Check,
  Share2,
  ExternalLink,
  Activity,
  BarChart3,
  Target,
  AlertCircle,
  Clock,
  Zap,
} from 'lucide-react';
import { usePartnerStore } from '@/stores/partner-store';
import { partnerApi } from '@/lib/partner-api';
import { formatCurrencyFromMinor, formatDate } from '@/lib/format';
import { MetricCard } from '@/components/partner/shared/metric-card';
import { StatusBadge } from '@/components/partner/shared/status-badge';
import { EmptyState } from '@/components/partner/shared/empty-state';
import { DashboardOverviewSkeleton } from '@/components/partner/shared/dashboard-skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useState } from 'react';
import type { ReferralItem, CommissionItem } from '@/types/partner';

// ── Referral Link Hero ──
function ReferralLinkHero({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Referral link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      toast.success('Referral link copied');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpen = () => window.open(link, '_blank');

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join RELIASTRA', url: link });
      } catch {}
    } else {
      handleCopy();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background">
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,theme(colors.border/20)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.border/20)_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="relative p-5 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center size-7 rounded-md bg-foreground text-background">
              <Link2 className="size-3.5" />
            </div>
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Your referral link</p>
              <p className="text-[11px] text-muted-foreground">Share to earn 30% recurring</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Live</span>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border border-border/40 font-mono text-sm">
          <span className="flex-1 truncate text-foreground/90 select-all">{link}</span>
          <span className="hidden sm:block size-px h-6 bg-border shrink-0" />
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="secondary" onClick={handleCopy} className="h-7 px-2.5 text-xs gap-1">
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleShare} className="h-7 px-2 hidden sm:inline-flex">
              <Share2 className="size-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleOpen} className="h-7 px-2 hidden sm:inline-flex">
              <ExternalLink className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KPI Grid ──
function KPIGrid({ d }: { d: any }) {
  const currency = d.currency || 'USD';
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      <MetricCard label="Total referrals" value={String(d.signups)} sublabel="All signups" delay={0.05} />
      <MetricCard label="Active customers" value={String(d.active_paid_customers)} sublabel={`${d.signups > 0 ? Math.round((d.active_paid_customers / d.signups) * 100) : 0}% conversion`} delay={0.1} />
      <MetricCard label="Total earned" value={formatCurrencyFromMinor(d.total_earned_minor, currency)} delay={0.15} />
      <MetricCard label="Available" value={formatCurrencyFromMinor(d.payable_balance_minor, currency)} sublabel={d.pending_commission_minor > d.payable_balance_minor ? `${formatCurrencyFromMinor(d.pending_commission_minor - d.payable_balance_minor, currency)} on hold` : 'Ready to withdraw'} delay={0.2} />
    </div>
  );
}

// ── Attribution Chart ──
function AttributionCard({ analytics }: { analytics: any }) {
  const items: { bucket: string; count: number; pct: number }[] = analytics?.attribution || [];
  const hasData = items.length > 0 && items.some((i) => i.count > 0);

  return (
    <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-muted-foreground" />
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Where referred users came from</p>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">First-touch</span>
      </div>
      <div className="p-5">
        {!hasData ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No attribution data yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Aggregate breakdown appears after referrals sign up via campaigns.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={item.bucket} className="flex items-center gap-3">
                <span className="text-xs font-medium w-24 truncate text-right shrink-0">{item.bucket}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.pct}%` }}
                    transition={{ duration: 0.6, delay: 0.1 + i * 0.06 }}
                    className="h-full rounded-full bg-foreground"
                    style={{ minWidth: item.pct > 2 ? undefined : 2 }}
                  />
                </div>
                <span className="text-xs font-mono tabular-nums w-12 text-right shrink-0">{item.pct}%</span>
                <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">{item.count}</span>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground pt-2 border-t border-border/30">
              Partner attribution (who you referred) is separate from acquisition (how they found RELIASTRA). This is aggregate, privacy-safe.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Time Trend ──
function TrendCard({ analytics }: { analytics: any }) {
  const series: { date: string; signups: number }[] = analytics?.timeseries || [];
  const maxVal = Math.max(...series.map((s) => s.signups), 1);
  const recent = series.slice(-14);

  if (!series.length) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
        <Activity className="size-4 text-muted-foreground" />
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Referral signups — last 14 days</p>
      </div>
      <div className="p-5">
        <div className="flex items-end gap-1 h-[80px]">
          {recent.map((pt) => {
            const hPct = maxVal ? (pt.signups / maxVal) * 100 : 0;
            return (
              <div key={pt.date} className="flex-1 flex flex-col items-center gap-1">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(hPct, pt.signups > 0 ? 8 : 2)}%` }}
                  transition={{ duration: 0.5, delay: 0.02 * recent.indexOf(pt) }}
                  className={`w-full rounded-sm ${pt.signups > 0 ? 'bg-foreground' : 'bg-muted'}`}
                  title={`${pt.date}: ${pt.signups}`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] font-mono text-muted-foreground">{recent[0]?.date.slice(5)}</span>
          <span className="text-[10px] font-mono text-muted-foreground">{recent[recent.length - 1]?.date.slice(5)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Funnel ──
function FunnelCard({ analytics }: { analytics: any }) {
  const funnel: { status: string; count: number }[] = analytics?.funnel || [];
  if (!funnel.length) return null;

  const labels: Record<string, string> = {
    signed_up: 'Signed up',
    paid: 'Customer',
    churned: 'Churned',
    referred: 'Referred',
  };

  const max = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
        <Target className="size-4 text-muted-foreground" />
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Conversion funnel</p>
      </div>
      <div className="p-5 space-y-3">
        {funnel.map((stage, i) => (
          <div key={stage.status} className="flex items-center gap-3">
            <span className="text-xs w-20 shrink-0">{labels[stage.status] || stage.status}</span>
            <div className="flex-1 h-6 rounded-md bg-muted/60 overflow-hidden flex items-center">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(stage.count / max) * 100}%` }}
                transition={{ duration: 0.5, delay: 0.05 * i }}
                className="h-full rounded-md bg-foreground flex items-center justify-end pr-2"
              >
                <span className="text-[11px] font-mono text-background font-medium">{stage.count}</span>
              </motion.div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Next Action / Insight Banner ──
function InsightBanner({ analytics, d }: { analytics: any; d: any }) {
  const insights: string[] = analytics?.insights || [];
  const hasPendingActivation = analytics?.funnel?.find((f: any) => f.status === 'signed_up')?.count > 0;

  let title = 'Operating insights';
  let body = insights[0] || `${d.signups} referrals · ${d.active_paid_customers} active`;
  let action = null as { label: string; page: string } | null;

  if (insights[0]?.includes('have not yet activated')) {
    title = 'Action suggested';
    body = insights[0];
    action = { label: 'View referrals', page: 'referrals' };
  } else if (d.signups === 0) {
    title = 'Get your first referral';
    body = 'Share your link with teams that depend on external APIs — your dashboard updates in seconds when someone signs up.';
    action = null;
  }

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-5 flex items-start gap-3">
      <div className="size-8 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0 mt-0.5">
        <Zap className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{body}</p>
        {insights.length > 1 && (
          <ul className="mt-2 space-y-1">
            {insights.slice(1, 3).map((ins: string, i: number) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="mt-1 size-1 rounded-full bg-muted-foreground shrink-0" />
                {ins}
              </li>
            ))}
          </ul>
        )}
      </div>
      {action && (
        <Button size="sm" variant="outline" className="shrink-0 hidden sm:inline-flex" onClick={() => usePartnerStore.getState().navigate(action!.page as any)}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

// ── Recent Activity ──
type ActivityItem = { type: 'referral'; item: ReferralItem } | { type: 'commission'; item: CommissionItem };

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
        <Clock className="size-4 text-muted-foreground" />
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Recent activity</p>
      </div>
      <div className="divide-y divide-border/30">
        {items.map((entry, i) => (
          <motion.div
            key={entry.type === 'referral' ? `ref-${entry.item.referral_id}` : `com-${entry.item.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.03 * i }}
            className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors"
          >
            <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              {entry.type === 'referral' ? <Users className="size-4 text-muted-foreground" /> : <DollarSign className="size-4 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">
                {entry.type === 'referral'
                  ? `New referral ${entry.item.masked_email || ''}`
                  : `Commission earned ${entry.item.period ? `· ${entry.item.period}` : ''}`}
              </p>
              <p className="text-[11px] font-mono text-muted-foreground">{formatDate(entry.item.created_at)}</p>
            </div>
            {entry.type === 'commission' && (
              <span className="font-mono text-sm tabular-nums shrink-0">{formatCurrencyFromMinor(entry.item.commission_amount_minor, entry.item.currency)}</span>
            )}
            {entry.type === 'referral' && <StatusBadge status={entry.item.status} />}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Main ──
export function PageOverview() {
  const storeDashboardData = usePartnerStore((s) => s.dashboardData);
  const partner = usePartnerStore((s) => s.partner);
  const user = usePartnerStore((s) => s.user);

  const { data: dashboard, isLoading, isError } = useQuery({
    queryKey: ['partner-dashboard'],
    queryFn: async () => {
      const data = await partnerApi.getDashboard();
      usePartnerStore.getState().setDashboardData(data);
      return data;
    },
    staleTime: 30_000,
  });

  const { data: analytics } = useQuery({
    queryKey: ['partner-analytics'],
    queryFn: () => partnerApi.getAnalytics(30),
    staleTime: 30_000,
  });

  const { data: referralsData } = useQuery({
    queryKey: ['partner-referrals-overview'],
    queryFn: () => partnerApi.getReferrals(1, 5),
    staleTime: 30_000,
  });

  const { data: commissionsData } = useQuery({
    queryKey: ['partner-commissions-overview'],
    queryFn: () => partnerApi.getCommissions(1, 5),
    staleTime: 30_000,
  });

  const d = dashboard || storeDashboardData;

  const activityItems = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    if (referralsData?.items) for (const ref of referralsData.items) items.push({ type: 'referral', item: ref });
    if (commissionsData?.items) for (const com of commissionsData.items) items.push({ type: 'commission', item: com });
    items.sort((a, b) => new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime());
    return items.slice(0, 6);
  }, [referralsData, commissionsData]);

  const isEmpty = d && d.signups === 0 && d.total_earned_minor === 0;

  if (isLoading) return <DashboardOverviewSkeleton />;
  if (isError || !d) {
    return (
      <div className="max-w-5xl">
        <div className="rounded-xl border border-border/60 bg-background p-8 text-center">
          <AlertCircle className="mx-auto size-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Unable to load dashboard data. Please refresh.</p>
        </div>
      </div>
    );
  }
  if (isEmpty) return <EmptyState referralLink={d.referral_link} />;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Partner header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight">Partner Console</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.fullName || partner?.referralCode || 'Your referral network'} · <span className="font-mono text-xs">{d.referral_link}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {d.active_paid_customers} active
          </span>
          <span className="inline-flex items-center rounded-full border border-border/60 bg-muted px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide">
            30% · 90d
          </span>
        </div>
      </motion.div>

      {/* Referral link hero */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}>
        <ReferralLinkHero link={d.referral_link} />
      </motion.div>

      {/* KPI grid */}
      <KPIGrid d={d} />

      {/* Insight / next action */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.12 }}>
        <InsightBanner analytics={analytics} d={d} />
      </motion.div>

      {/* Two-col: attribution + trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
          <AttributionCard analytics={analytics} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.18 }} className="space-y-6">
          <TrendCard analytics={analytics} />
          <FunnelCard analytics={analytics} />
        </motion.div>
      </div>

      {/* Recent activity */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
        <ActivityFeed items={activityItems} />
      </motion.div>

      {/* Top campaigns */}
      {(analytics?.top_campaigns?.length ?? 0) > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.22 }} className="rounded-xl border border-border/60 bg-background p-5">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Top campaigns</p>
          <div className="flex flex-wrap gap-2">
            {analytics?.top_campaigns?.map((c: any) => (
              <span key={c.campaign} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs">
                <TrendingUp className="size-3 text-muted-foreground" />
                {c.campaign}
                <span className="font-mono text-muted-foreground">· {c.count}</span>
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
