'use client';

import { useState } from 'react';
import { analytics } from '@/lib/analytics';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { RsButton } from '@/components/dashboard/ui/button';
import { cn } from '@/lib/utils';

const ORG_TYPES = [
  ['saas', 'SaaS / Software'],
  ['fintech', 'Fintech'],
  ['ecommerce', 'E-commerce'],
  ['agency', 'Agency'],
  ['platform', 'Infrastructure / Platform'],
  ['other', 'Other'],
] as const;

const CONCERNS = [
  ['availability', 'Availability'],
  ['visibility', 'Third-party visibility'],
  ['evidence', 'Incident evidence'],
  ['accountability', 'Vendor accountability'],
  ['sla', 'SLA evidence'],
  ['api', 'API reliability'],
] as const;

const SCALES = [
  ['1-5', '1–5'],
  ['6-20', '6–20'],
  ['21-50', '21–50'],
  ['50+', '50+'],
] as const;

export function ContextStep({ onNext }: { onNext: () => void }) {
  const { context, setContext, markComplete } = useOnboardingStore();
  const [local, setLocal] = useState(context);

  const canContinue = Boolean(local.orgType && local.concern && local.scale);

  function handleContinue() {
    setContext(local);
    markComplete('context');
    analytics.contextCompleted({
      org_type: local.orgType,
      concern: local.concern,
      scale: local.scale,
    });
    onNext();
  }

  return (
    <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-7">
      <div className="mb-6">
        <p className="rs-eyebrow">Step 1 · Context</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-rs-text">
          Let&apos;s build your external reliability picture.
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-rs-text-secondary">
          Tell us just enough to tailor your first checks. This takes 20 seconds and you can change it later in Settings. We don&apos;t sell or share this.
        </p>
      </div>

      <div className="space-y-6">
        <Field
          label="Organization type"
          help="So we can suggest the right dependency presets and evidence templates."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ORG_TYPES.map(([v, label]) => (
              <Choice
                key={v}
                active={local.orgType === v}
                onClick={() => setLocal((s) => ({ ...s, orgType: v }))}
                label={label}
              />
            ))}
          </div>
        </Field>

        <Field label="Primary reliability concern" help="What you most want independent evidence for.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CONCERNS.map(([v, label]) => (
              <Choice
                key={v}
                active={local.concern === v}
                onClick={() => setLocal((s) => ({ ...s, concern: v }))}
                label={label}
              />
            ))}
          </div>
        </Field>

        <Field label="Approximate critical dependency count" help="How many external services would page you at night?">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SCALES.map(([v, label]) => (
              <Choice key={v} active={local.scale === v} onClick={() => setLocal((s) => ({ ...s, scale: v }))} label={label} />
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-rs-border-subtle pt-5">
        <p className="text-xs text-rs-text-tertiary">
          Pro trial active — all capabilities unlocked.
        </p>
        <RsButton onClick={handleContinue} disabled={!canContinue} aria-disabled={!canContinue}>
          Continue
        </RsButton>
      </div>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2">
        <div className="text-sm font-medium text-rs-text">{label}</div>
        <div className="text-xs leading-relaxed text-rs-text-tertiary">{help}</div>
      </div>
      {children}
    </div>
  );
}

function Choice({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-[10px] border px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
        active
          ? 'border-rs-brand bg-rs-brand-subtle text-rs-brand'
          : 'border-rs-border-subtle bg-rs-base text-rs-text-secondary hover:border-rs-border hover:text-rs-text'
      )}
    >
      {label}
    </button>
  );
}
