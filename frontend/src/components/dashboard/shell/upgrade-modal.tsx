'use client';

import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { PLANS, annualSavings, getPlan } from '@/lib/dashboard/plans';
import { cn } from '@/lib/utils';
import { RsButton } from '../ui/button';
import { toast } from 'sonner';

function Feature({ ok, children }: { ok: boolean | string; children: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13px]">
      <span className="text-rs-text-secondary">{children}</span>
      <span className={cn('font-mono text-xs', ok ? 'text-rs-text' : 'text-rs-text-tertiary')}>
        {typeof ok === 'string' ? ok : ok ? 'Yes' : '-'}
      </span>
    </div>
  );
}

export function UpgradeModal() {
  const open = useAppStore((s) => s.upgradeOpen);
  const close = useAppStore((s) => s.closeUpgrade);
  const plan = useAppStore((s) => s.plan);
  const setDemoPlan = useAppStore((s) => s.setDemoPlan);
  const current = getPlan(plan?.plan);
  const [annual, setAnnual] = useState(false);

  const maxSave = useMemo(
    () => Math.max(...PLANS.map(annualSavings)),
    []
  );

  // Close on Esc + focus trap basics per spec
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

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
        <div className="relative px-8 pb-4 pt-8">
          <button
            type="button"
            onClick={close}
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-lg text-rs-text-tertiary transition-colors hover:bg-rs-hover hover:text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <h2 id="pricing-title" className="rs-page-title text-xl">
            Choose your plan
          </h2>
          <p className="mt-1 text-sm text-rs-text-tertiary">
            Monitor more dependencies. Generate evidence. Protect your SLAs.
          </p>
          <div className="mt-5 inline-flex rounded-lg border border-rs-border p-0.5">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
                !annual ? 'bg-rs-hover text-rs-text' : 'text-rs-text-secondary'
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
                annual ? 'bg-rs-hover text-rs-text' : 'text-rs-text-secondary'
              )}
            >
              Annual
              <span className="rounded-full bg-rs-brand-subtle px-2 py-0.5 text-2xs font-medium text-rs-brand">
                Save ${maxSave}
              </span>
            </button>
          </div>
        </div>

        <div className="flex gap-3 overflow-x-auto px-6 pb-6 rs-scrollbar">
          {PLANS.map((p) => {
            const isCurrent = p.id === current.id;
            const isStandard = p.id === 'standard';
            const isAgency = p.id === 'agency';
            const price = annual ? Math.round(p.priceAnnual / 12) : p.priceMonthly;
            return (
              <div
                key={p.id}
                className={cn(
                  'relative flex min-w-[168px] flex-1 flex-col rounded-xl border p-4',
                  isStandard
                    ? 'border-2 border-rs-brand bg-[rgba(37,99,235,0.03)]'
                    : 'border-rs-border-subtle bg-rs-elevated'
                )}
              >
                {isStandard && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-rs-brand px-2.5 py-1 text-[11px] font-semibold text-white">
                    Most popular
                  </span>
                )}
                {isAgency && (
                  <span className="mb-2 inline-flex self-start rounded bg-rs-active px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rs-text">
                    Built for agencies
                  </span>
                )}
                <div className="text-sm font-medium text-rs-text">{p.name}</div>
                <div className="mt-1 text-xs text-rs-text-tertiary">{p.tagline}</div>
                <div className="mt-3 font-mono text-2xl font-bold tracking-[-0.02em] text-rs-text">
                  ${price}
                  <span className="text-xs font-normal text-rs-text-tertiary">/mo</span>
                </div>
                {annual && p.priceMonthly > 0 && (
                  <div className="mt-1 text-2xs text-rs-text-tertiary">
                    Billed ${p.priceAnnual}/yr
                  </div>
                )}
                <div className="mt-4 border-t border-rs-border-subtle pt-2">
                  <Feature ok={String(p.dependencies)}>Dependencies</Feature>
                  <Feature ok={p.retention}>Retention</Feature>
                  <Feature ok={p.alerts}>Alerts</Feature>
                  <Feature ok={p.evidence}>Evidence</Feature>
                  <Feature ok={p.seats}>Team seats</Feature>
                  <Feature ok={p.clientGroups}>Client groups</Feature>
                  <Feature ok={p.whiteLabel}>White-label</Feature>
                </div>
                <div className="mt-4">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full rounded-lg py-2 text-sm text-rs-text-tertiary"
                    >
                      Current plan
                    </button>
                  ) : isAgency ? (
                    <RsButton
                      variant="secondary"
                      className="w-full"
                      onClick={() => {
                        toast.message('Talk to us about Agency', {
                          description: 'We will follow up about client groups and white-label reports.',
                        });
                        close();
                      }}
                    >
                      Learn more
                    </RsButton>
                  ) : (
                    <RsButton
                      className="w-full"
                      onClick={() => {
                        setDemoPlan(p.id);
                        toast.success(`${p.name} trial started`, {
                          description: 'No credit card required for trial.',
                        });
                        close();
                      }}
                    >
                      Start trial
                    </RsButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 border-t border-rs-border-subtle px-6 py-4 text-xs text-rs-text-tertiary">
          <span>No credit card required for trial</span>
          <span>Cancel anytime</span>
          <span>SOC 2 Type II in progress</span>
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
        <h2 className="text-lg font-semibold text-rs-text">Evidence reports are a Standard feature</h2>
        <p className="mt-2 text-sm text-rs-text-secondary">
          Generate court-ready reports with multi-region verification. Start your free trial, no credit card required.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <RsButton
            onClick={() => {
              setOpen(false);
              openUpgrade('evidence');
            }}
          >
            Start Standard trial
          </RsButton>
          <RsButton variant="ghost" onClick={() => setOpen(false)}>
            Maybe later
          </RsButton>
        </div>
      </div>
    </div>
  );
}
