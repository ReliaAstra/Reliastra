'use client';

import { useAppStore } from '@/stores/app-store';
import { getPlan, isEnterprise, nextPlan, retentionLabel } from '@/lib/dashboard/plans';
import { useDependencies, usePlan } from '@/lib/dashboard/queries';
import { formatDate } from '@/lib/dashboard/format';
import { RsButton } from '../ui/button';
import { cn } from '@/lib/utils';
import { EmptyState } from '../ui/empty-state';
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  FileText,
  Sparkles,
} from 'lucide-react';

/**
 * Billing — every number comes from the backend's authoritative
 * ``GET /v1/billing/plan`` (plan, effective plan, evaluation state, limits)
 * plus live dependency usage. The evaluation is never computed client-side.
 * The page renders the 14-day full-access evaluation, conversion preview,
 * and post-evaluation fallback with real account consequences.
 */
export function BillingPage() {
  const { data: plan } = usePlan();
  const storePlan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const { data: deps } = useDependencies();
  const p = plan ?? storePlan;
  const current = getPlan(p?.effective_plan ?? p?.plan);
  const underlying = getPlan(p?.plan);
  const used = deps?.length ?? 0;
  const limit = p?.max_dependencies ?? current.dependencies;
  // Enterprise/custom plans have no fixed dependency cap.
  const limitIsCustom = limit == null;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const fill = pct > 80 ? '#F59E0B' : pct > 60 ? '#D97706' : '#2563EB';

  if (!p) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-rs-border-subtle" />
        <div className="h-36 animate-pulse rounded-xl bg-rs-border-subtle" />
        <div className="h-24 animate-pulse rounded-xl bg-rs-border-subtle" />
      </div>
    );
  }

  const trialActive = (p.is_evaluation_active ?? p.is_trial_active) === true;
  const daysLeft = p.evaluation_days_remaining ?? p.trial_days_remaining ?? 0;
  const trialLength = p.trial_length_days ?? 14;
  const fallback = p.fallback_info ?? null;
  const isPaid = underlying.id !== 'free';

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">Billing</h1>
        <p className="mt-1.5 text-sm text-rs-text-tertiary">Plan, trial status, and usage.</p>
      </div>

      {/* Current plan */}
      <section className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              Current plan
            </div>
            <div className="mt-2 font-mono text-[32px] font-bold tracking-[-0.02em] text-rs-text">
              {underlying.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-rs-text-secondary">
              <span>{underlying.priceMonthly == null ? 'Custom pricing' : `$${underlying.priceMonthly}/mo`}</span>
              {p.subscription_status && (
                <span className="rounded-full border border-rs-border-subtle px-2 py-0.5 text-[11px] capitalize">
                  {p.subscription_status}
                </span>
              )}
              {p.current_period_end && (underlying.priceMonthly ?? 0) > 0 && (
                <span>· Renews {formatDate(p.current_period_end)}</span>
              )}
            </div>
          </div>
          {isEnterprise(underlying.id) ? (
            <a
              href="mailto:sales@reliastra.com?subject=Enterprise%20plan"
              className="inline-flex shrink-0 items-center rounded-lg border border-rs-border bg-transparent px-4 py-2 text-sm font-medium text-rs-text transition-colors hover:bg-rs-hover"
            >
              Contact Sales
            </a>
          ) : (
            <RsButton onClick={() => openUpgrade()} className="shrink-0">
              {underlying.id === 'free' ? 'Upgrade' : 'Change plan'}
            </RsButton>
          )}
        </div>

        {/* Evaluation entitlement overlay — full product, not a cheap tier */}
        {trialActive && !isPaid && (
          <div className="mt-5 rounded-lg border border-rs-brand/25 bg-rs-brand-subtle p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-rs-brand" />
              <p className="text-sm font-semibold text-rs-text">
                14-day full-access trial · Pro capabilities
              </p>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-rs-text-secondary">
              You have <strong>14 days of full access</strong> to explore RELIASTRA without feature
              restrictions — every capability across paid tiers is available. No card required.
              {daysLeft > 0 ? (
                <>
                  {' '}<strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong> remaining
                  {daysLeft <= 3 ? ' — trial ends soon' : ''}.
                </>
              ) : null}{' '}
              Your configuration and history will be preserved; paid capabilities simply pause at
              expiry until you upgrade.
            </p>
            <div className="rs-trial-progress-track mt-3 h-1.5 max-w-sm">
              <div
                className="rs-trial-progress-fill h-full rounded-full"
                data-urgent={daysLeft <= 3}
                style={{ width: `${Math.round(((trialLength - daysLeft) / trialLength) * 100)}%` }}
              />
            </div>
            {fallback && fallback.dependencies_configured > 0 && daysLeft <= 7 && daysLeft > 0 && (
              <div className="mt-4 rounded-lg border border-rs-border-subtle bg-rs-elevated p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                  What changes after evaluation
                </p>
                <div className="mt-2 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
                  <div className="rounded-md bg-rs-base p-3">
                    <p className="text-xs font-medium text-rs-text-tertiary">Your evaluation (now)</p>
                    <p className="mt-1 text-sm text-rs-text">
                      <strong>{fallback.dependencies_configured}</strong> dependencies monitored
                    </p>
                    <p className="text-xs text-rs-text-secondary">
                      {fallback.retention_days_current} days retention · Pro evidence · API access
                    </p>
                  </div>
                  <div className="rounded-md bg-rs-base p-3">
                    <p className="text-xs font-medium text-rs-text-tertiary">Free plan (after)</p>
                    <p className="mt-1 text-sm text-rs-text">
                      <strong>{fallback.free_dependency_limit}</strong> active ·{' '}
                      <span className="text-rs-text-secondary">
                        {Math.max(0, fallback.dependencies_configured - fallback.free_dependency_limit)} paused (preserved)
                      </span>
                    </p>
                    <p className="text-xs text-rs-text-secondary">
                      {fallback.retention_days_free} day retention · Basic alerts · No evidence/API
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-rs-text-tertiary">
                  No data is deleted. Paused dependencies keep their config and history and resume when you upgrade.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Evaluation ended on free — clear, meaningful fallback */}
        {!trialActive && underlying.id === 'free' && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-950/20">
            <p className="text-sm font-semibold text-rs-text">Your full-access evaluation has ended.</p>
            <p className="mt-1 text-[13px] leading-relaxed text-rs-text-secondary">
              Your account has returned to the Free plan. Your configuration and historical data are
              preserved. Some capabilities are now paused because they exceed Free-plan limits.
            </p>
            {fallback && (
              <ul className="mt-3 space-y-1.5 text-[13px] text-rs-text-secondary">
                <li>
                  • <strong className="text-rs-text">{fallback.dependencies_configured}</strong> dependencies configured ·{' '}
                  <strong className="text-rs-text">{Math.min(fallback.dependencies_configured, fallback.free_dependency_limit)}</strong>{' '}
                  active on Free ·{' '}
                  <strong className="text-rs-text">{fallback.dependencies_paused_if_expired}</strong> paused (preserved)
                </li>
                <li>
                  • Advanced evidence reports —{' '}
                  {fallback.evidence_available ? 'paused until upgrade' : 'unavailable on Free'}
                </li>
                <li>
                  • Extended retention — {fallback.retention_days_current} → {fallback.retention_days_free} day
                </li>
                <li>
                  • Team: {fallback.team_members} member{fallback.team_members === 1 ? '' : 's'} (Free allows{' '}
                  {fallback.team_free_limit})
                </li>
              </ul>
            )}
          </div>
        )}

        {current.id !== underlying.id && !trialActive && (
          <p className="mt-3 text-xs text-rs-text-tertiary">
            Effective limits currently follow {current.name}.
          </p>
        )}
      </section>

      {/* Usage against authoritative limits */}
      <section className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-rs-text">Monitored dependencies</div>
          <div
            className={cn(
              'font-mono text-sm',
              limit != null && used >= limit ? 'text-rs-degraded' : 'text-rs-text'
            )}
          >
            {limitIsCustom ? `${used} · Custom` : `${used} / ${limit}`}
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-rs-border-subtle">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${limitIsCustom ? 100 : pct}%`, background: fill }}
          />
        </div>
        {!limitIsCustom && used >= limit && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-rs-degraded/30 bg-rs-degraded/10 p-3">
            <p className="text-xs leading-relaxed text-rs-text-secondary">
              You&apos;ve reached your plan limit of {limit}.{' '}
              {nextPlan(underlying.id).name} raises it to {nextPlan(underlying.id).dependencies}.
            </p>
            <button
              type="button"
              onClick={() => openUpgrade('limit')}
              className="shrink-0 text-xs font-medium text-rs-brand hover:underline"
            >
              Upgrade
            </button>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-rs-border-subtle pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              Check interval
            </dt>
            <dd className="mt-1 font-mono text-sm text-rs-text">
              {p.min_check_interval_seconds == null
                ? 'Custom'
                : p.min_check_interval_seconds >= 60
                  ? `${Math.round(p.min_check_interval_seconds / 60)} min`
                  : `${p.min_check_interval_seconds}s`}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              Data retention
            </dt>
            <dd className="mt-1 font-mono text-sm text-rs-text">
              {retentionLabel(p.data_retention_days ?? current.retentionDays)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              Team members
            </dt>
            <dd className="mt-1 font-mono text-sm text-rs-text">
              {(p.max_team_members ?? current.teamMembers) == null ? 'Unlimited' : p.max_team_members ?? current.teamMembers}
            </dd>
          </div>
        </dl>
      </section>

      {/* Payment method — no data source yet, so the honest state is rendered */}
      <section className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              Payment method
            </div>
            <p className="mt-2 text-sm text-rs-text-secondary">No card on file. Trials do not require a card.</p>
          </div>
          <RsButton variant="secondary">Update</RsButton>
        </div>
      </section>

      {/* What this plan includes — mirrors backend PLAN_FEATURES semantics */}
      <section className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="text-sm font-semibold text-rs-text">
          {trialActive ? 'Included during your Pro trial' : `Included in ${underlying.name}`}
        </h2>
        {trialActive && (
          <p className="mt-1 text-xs text-rs-text-tertiary">
            On {underlying.name}: {getPlan('free').dependencies} dependencies ·{' '}
            {retentionLabel(getPlan('free').retentionDays)} retention. Trial restores
            Pro limits.
          </p>
        )}
        <ul className="mt-3 space-y-2.5">
          {[
            { label: `${limit} monitored dependencies`, ok: true },
            { label: `${retentionLabel(p.data_retention_days ?? current.retentionDays)} check-history retention`, ok: true },
            { label: 'Email alerts & basic incident detection', ok: true },
            { label: 'Evidence reports (PDF/JSON)', ok: getPlan(p.effective_plan ?? p.plan).evidence },
            { label: 'Deterministic vendor attribution', ok: getPlan(p.effective_plan ?? p.plan).attribution },
            { label: 'API access', ok: getPlan(p.effective_plan ?? p.plan).api },
            { label: 'Client workspaces & white-label', ok: current.clientGroups },
          ].map((f) => (
            <li key={f.label} className="flex items-center gap-2.5 text-sm">
              {f.ok ? (
                <CheckCircle2 size={16} className="shrink-0 text-rs-up" />
              ) : (
                <CircleDashed size={16} className="shrink-0 text-rs-text-tertiary" />
              )}
              <span className={f.ok ? 'text-rs-text' : 'text-rs-text-tertiary'}>{f.label}</span>
              {!f.ok && (
                <button
                  type="button"
                  onClick={() => openUpgrade()}
                  className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-rs-brand hover:underline"
                >
                  Unlock <ArrowUpRight size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Invoices — honest empty state until a billing-history endpoint exists */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-rs-text">Invoices</h2>
        <EmptyState
          icon={<FileText size={32} />}
          title="No invoices yet"
          body="Invoices appear here once a paid subscription has been billed."
          actionLabel="View plans"
          onAction={() => openUpgrade()}
          helpLabel="How does billing work?"
          onHelp={() => window.open('mailto:support@reliastra.com?subject=Billing%20question')}
        />
      </section>
    </div>
  );
}