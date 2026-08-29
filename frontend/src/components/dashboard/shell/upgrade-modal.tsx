'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { PLANS, annualPrice, dependencyLabel, effectivePlan, intervalLabel, monthlyPrice, retentionLabel, seatLabel } from '@/lib/dashboard/plans';
import { api } from '@/lib/dashboard/api';
import { cn } from '@/lib/utils';
import { RsButton } from '../ui/button';
import { toast } from 'sonner';

function Feature({ ok, children }: { ok: boolean | string; children: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13px]">
      <span className="text-rs-text-secondary">{children}</span>
      <span className={cn('font-mono text-xs', ok ? 'text-rs-text' : 'text-rs-text-tertiary')}>
        {typeof ok === 'string' ? ok : ok ? 'Yes' : '—'}
      </span>
    </div>
  );
}

/**
 * Upgrade flow — the REAL billing path.
 *
 * Choosing a plan calls ``POST /v1/billing/initialize`` (backend creates a
 * Paystack transaction scoped to the caller's organization) and redirects to
 * the provider's authorization page. The backend's webhook + verify endpoint
 * flip the subscription; the frontend never mutates entitlement state.
 */
export function UpgradeModal() {
  const open = useAppStore((s) => s.upgradeOpen);
  const close = useAppStore((s) => s.closeUpgrade);
  const plan = useAppStore((s) => s.plan);
  const user = useAppStore((s) => s.user);
  // Effective plan during trial is Pro; the *underlying* plan is
  // what a purchase would replace.
  const current = effectivePlan(plan);
  const [pending, setPending] = useState<string | null>(null);
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const startCheckout = async (targetId: string) => {
    setPending(targetId);
    try {
      const res = await api.initializePayment(targetId, interval);
      // Hand off to Paystack; entitlement flips server-side after payment.
      window.open(res.authorization_url, '_self', 'noopener');
    } catch (err) {
      setPending(null);
      toast.error(err instanceof Error ? err.message : 'Could not start checkout', {
        description: 'If this persists, contact support@reliastra.com.',
      });
    }
  };

  return (
    <div
      className="rs-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-[rgb(11_15_25_/_0.5)] p-4"
      onClick={close}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="rs-modal-panel-xl rs-modal-in max-h-[90vh] w-full max-w-[900px] overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated shadow-rs-modal"
        onClick={(e) => e.stopPropagation()}
        role="document"
        aria-labelledby="pricing-title"
      >
        <div className="relative px-6 pb-4 pt-7 md:px-8 md:pt-8">
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg text-rs-text-tertiary transition-colors hover:bg-rs-hover hover:text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <h2 id="pricing-title" className="rs-page-title text-xl">
            Choose your plan
          </h2>
          <p className="mt-1 text-sm text-rs-text-tertiary">
            Monitor more dependencies. Generate evidence. Protect your SLAs.
            {user?.email ? (
              <span className="hidden sm:inline"> Billing as {user.email}.</span>
            ) : null}
          </p>
        </div>

        {/* Billing interval toggle — changes the ACTUAL amount charged. */}
        <div className="flex items-center justify-center gap-3 px-6 pb-2">
          <button
            type="button"
            onClick={() => setInterval('monthly')}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
              interval === 'monthly' ? 'bg-rs-brand text-white' : 'text-rs-text-tertiary'
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval('annual')}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
              interval === 'annual' ? 'bg-rs-brand text-white' : 'text-rs-text-tertiary'
            )}
          >
            Annual · Save 2 months
          </button>
        </div>

        <div className="flex gap-3 overflow-x-auto px-5 pb-6 rs-scrollbar md:px-6">
          {PLANS.map((p) => {
            const isCurrent = p.id === current.id;
            const isPopular = p.id === 'pro';
            const isFree = p.id === 'free';
            const isEnterprise = p.isEnterprise;
            const price = interval === 'annual' ? annualPrice(p) : monthlyPrice(p);
            return (
              <div
                key={p.id}
                className={cn(
                  'relative flex min-w-[172px] flex-1 flex-col rounded-xl border p-4',
                  isPopular
                    ? 'border-2 border-rs-brand bg-[rgba(37,99,235,0.03)]'
                    : 'border-rs-border-subtle bg-rs-elevated'
                )}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-rs-brand px-2.5 py-1 text-[11px] font-semibold text-white">
                    Most Popular
                  </span>
                )}
                {isEnterprise && (
                  <span className="mb-2 inline-flex self-start rounded bg-rs-active px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rs-text">
                    Contact Sales
                  </span>
                )}
                <div className="text-sm font-medium text-rs-text">{p.name}</div>
                <div className="mt-1 min-h-[32px] text-xs leading-snug text-rs-text-tertiary">{p.tagline}</div>
                <div className="mt-3 font-mono text-2xl font-bold tracking-[-0.02em] text-rs-text">
                  {price}
                  <span className="text-xs font-normal text-rs-text-tertiary">
                    {isEnterprise ? '' : interval === 'annual' ? '/yr' : '/mo'}
                  </span>
                </div>
                <div className="mt-4 border-t border-rs-border-subtle pt-2">
                  <Feature ok={dependencyLabel(p.dependencies)}>Dependencies</Feature>
                  <Feature ok={seatLabel(p.teamMembers)}>Team</Feature>
                  <Feature ok={intervalLabel(p.minIntervalSeconds).replace(' checks', '')}>Check interval</Feature>
                  <Feature ok={retentionLabel(p.retentionDays)}>Retention</Feature>
                  <Feature ok={p.alerts}>Alerts</Feature>
                  <Feature ok={p.evidence}>Evidence</Feature>
                  <Feature ok={p.api}>API access</Feature>
                  <Feature ok={p.clientGroups}>Client groups</Feature>
                  <Feature ok={p.whiteLabel}>White-label</Feature>
                </div>
                <div className="mt-4">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full cursor-default rounded-lg py-2 text-sm text-rs-text-tertiary"
                    >
                      Current plan
                    </button>
                  ) : isFree ? (
                    <button
                      disabled
                      className="w-full cursor-default rounded-lg py-2 text-sm text-rs-text-tertiary"
                    >
                      Default tier
                    </button>
                  ) : isEnterprise ? (
                    <a
                      href="mailto:sales@reliastra.com?subject=Enterprise%20plan"
                      className="block w-full rounded-lg border border-rs-border bg-transparent py-2 text-center text-sm font-medium text-rs-text transition-colors hover:bg-rs-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
                    >
                      Contact Sales
                    </a>
                  ) : (
                    <RsButton
                      className="w-full"
                      disabled={pending !== null}
                      onClick={() => void startCheckout(p.id)}
                    >
                      {pending === p.id ? 'Redirecting…' : `Upgrade to ${p.name}`}
                    </RsButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-rs-border-subtle px-6 py-4 text-xs text-rs-text-tertiary">
          <span>Secure checkout via Paystack</span>
          <span>Cancel anytime</span>
          <span>Questions? support@reliastra.com</span>
        </div>
      </div>
    </div>
  );
}

export function EvidenceGateModal() {
  const open = useAppStore((s) => s.evidenceGateOpen);
  const setOpen = useAppStore((s) => s.setEvidenceGateOpen);
  const openUpgrade = useAppStore((s) => s.openUpgrade);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="rs-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-[rgb(11_15_25_/_0.5)] p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
      <div
        className="rs-modal-panel rs-modal-in w-full max-w-md rounded-xl border border-rs-border-subtle bg-rs-elevated p-8 shadow-rs-modal"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <h2 className="text-lg font-semibold text-rs-text">Evidence reports are a Pro feature</h2>
        <p className="mt-2 text-sm leading-relaxed text-rs-text-secondary">
          Generate verifiable SLA evidence backed by multi-region checks — the artifact you attach
          to a refund request or executive postmortem.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <RsButton
            onClick={() => {
              setOpen(false);
              openUpgrade('evidence');
            }}
          >
            View plans
          </RsButton>
          <RsButton variant="ghost" onClick={() => setOpen(false)}>
            Maybe later
          </RsButton>
        </div>
      </div>
    </div>
  );
}
