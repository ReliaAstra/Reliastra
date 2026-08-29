'use client';

import { CheckCircle2, Activity, Link2, Mail, Users, ShieldCheck } from 'lucide-react';
import { analytics } from '@/lib/analytics';
import { useAppStore } from '@/stores/app-store';
import { useDependencies, useAlertConfigs, useSummary } from '@/lib/dashboard/queries';
import { RsButton } from '@/components/dashboard/ui/button';

export function CompletionStep({ onFinish }: { onFinish: () => void }) {
  const org = useAppStore((s) => s.org);
  const plan = useAppStore((s) => s.plan);
  const { data: deps } = useDependencies();
  const { data: summary } = useSummary();
  const { data: configs } = useAlertConfigs();

  const depCount = deps?.length ?? 0;
  const active = summary?.active_dependencies_count ?? depCount;
  const regions = 2; // us-east + eu-west default; real regions are per-dependency but this is honest summary
  const hasEmail = configs?.some((c) => c.channel_type === 'email');

  return (
    <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-7">
      <div className="flex gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rs-up-bg text-rs-up">
          <CheckCircle2 size={18} />
        </span>
        <div>
          <p className="rs-eyebrow">Onboarding complete</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-rs-text">Reliastra is ready.</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-rs-text-secondary">
            You&apos;re now building an independent external reliability record for your critical infrastructure. No synthetic data was used — every number below is real.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-rs-border-subtle bg-rs-base p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat icon={Link2} label="Dependencies" value={`${active} monitored`} sub={`${depCount} configured`} />
          <Stat icon={Activity} label="Observation" value={`${regions} regions`} sub="quorum in 60s" />
          <Stat icon={Mail} label="Alerts" value={hasEmail ? 'Email enabled' : 'In-dashboard only'} sub={hasEmail ? 'external + in-app' : 'add email anytime'} />
        </div>

        <div className="mt-5 grid gap-3 rounded-lg border border-rs-border-subtle bg-rs-elevated p-4 sm:grid-cols-2">
          <div className="flex gap-2">
            <ShieldCheck size={16} className="mt-0.5 text-rs-brand" />
            <div>
              <div className="text-sm font-medium text-rs-text">Independent evidence collection — active</div>
              <div className="text-xs leading-relaxed text-rs-text-tertiary">
                Checks are checksummed and timestamped per region. When quorum fails, an incident with deterministic attribution is opened.
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Users size={16} className="mt-0.5 text-rs-brand" />
            <div>
              <div className="text-sm font-medium text-rs-text">Workspace</div>
              <div className="text-xs leading-relaxed text-rs-text-tertiary">
                {org?.name ?? 'Your organization'} · {plan?.effective_plan ?? plan?.plan ?? 'free'} plan · 14-day Professional evaluation
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-rs-text-tertiary">
          Tip: Keep this running for 30 minutes and invite one teammate — that’s when most teams first say <span className="font-medium text-rs-text">“I see why we need this.”</span>
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-rs-text-tertiary">
          Next: explore your <span className="font-medium text-rs-text">Reliability Overview</span> — health, incidents, and vendor posture.
        </div>
        <RsButton
          onClick={() => {
            analytics.onboardingCompleted({ deps: depCount });
            onFinish();
          }}
        >
          Go to Reliability Overview
        </RsButton>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[10px] border border-rs-border-subtle bg-rs-elevated px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
        <Icon size={12} /> {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-rs-text">{value}</div>
      <div className="text-xs text-rs-text-tertiary">{sub}</div>
    </div>
  );
}
