'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { useDependencies, useAlertConfigs, useSummary } from '@/lib/dashboard/queries';
import { analytics } from '@/lib/analytics';
import { useOnboardingStore, type OnboardingStepId } from '@/stores/onboarding-store';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { ContextStep } from '@/components/onboarding/ContextStep';
import { DependencySetupStep } from '@/components/onboarding/DependencySetupStep';
import { ValidationStep } from '@/components/onboarding/ValidationStep';
import { FirstValueStep } from '@/components/onboarding/FirstValueStep';
import { EvidenceIntroStep } from '@/components/onboarding/EvidenceIntroStep';
import { AlertSetupStep } from '@/components/onboarding/AlertSetupStep';
import { ExpandStep } from '@/components/onboarding/ExpandStep';
import { CompletionStep } from '@/components/onboarding/CompletionStep';

export default function OnboardingPage() {
  const router = useRouter();
  const { current, setCurrent, markComplete, firstDependencyId, hydrate, _hydrated } = useOnboardingStore();
  const { data: deps } = useDependencies();
  const { data: configs } = useAlertConfigs();
  const { data: summary } = useSummary();
  const plan = useAppStore((s) => s.plan);
  const [localDepId, setLocalDepId] = useState<string | null>(null);

  // hydrate from localStorage once
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // start analytics once
  useEffect(() => {
    analytics.onboardingStarted({ step: current });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // derive effective current: if data already satisfies a step, auto-advance (but respect manual current if user is mid-flow)
  const effectiveCurrent: OnboardingStepId = useMemo(() => {
    if (!_hydrated) return current;
    const hasDeps = (deps?.length ?? 0) > 0;
    const hasSecond = (deps?.length ?? 0) >= 2;
    const hasTeam = false; // team expansion not yet tracked — keep simple
    const hasAlerts = Boolean(configs?.some((c) => c.channel_type === 'email'));

    // allow resume: if user is on context and has deps, jump to first-value
    if (current === 'context' && hasDeps && !hasSecond) return 'first-value';
    if (current === 'dependency' && hasDeps) return 'validation';
    // otherwise respect stored current
    return current;
  }, [_hydrated, current, deps, configs]);

  const depId = localDepId ?? firstDependencyId ?? deps?.[0]?.id ?? null;

  function goNext(next: OnboardingStepId) {
    setCurrent(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function exitToDashboard() {
    analytics.onboardingAbandoned({ step: effectiveCurrent });
    router.push('/dashboard');
  }

  function finish() {
    markComplete('complete');
    useOnboardingStore.getState().dismiss();
    router.push('/dashboard');
  }

  return (
    <OnboardingShell current={effectiveCurrent} onExit={exitToDashboard}>
      {effectiveCurrent === 'context' && (
        <ContextStep
          onNext={() => {
            const next: OnboardingStepId = (deps?.length ?? 0) > 0 ? 'first-value' : 'dependency';
            goNext(next);
          }}
        />
      )}

      {effectiveCurrent === 'dependency' && (
        <DependencySetupStep
          onCreated={(id) => {
            setLocalDepId(id);
            goNext('validation');
          }}
        />
      )}

      {effectiveCurrent === 'validation' && depId && (
        <ValidationStep
          dependencyId={depId}
          onValidated={() => goNext('first-value')}
          onRetry={() => goNext('dependency')}
        />
      )}

      {effectiveCurrent === 'validation' && !depId && (
        <DependencySetupStep onCreated={(id) => { setLocalDepId(id); goNext('validation'); }} />
      )}

      {effectiveCurrent === 'first-value' && depId && (
        <FirstValueStep dependencyId={depId} onNext={() => goNext('evidence')} />
      )}

      {effectiveCurrent === 'first-value' && !depId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/30 dark:bg-amber-950/20">
          <p className="text-sm font-medium text-rs-text">No dependency yet</p>
          <p className="mt-1 text-sm text-rs-text-secondary">Create one to see live observation. This is server-time, not a demo.</p>
          <button onClick={() => goNext('dependency')} className="mt-3 text-sm font-medium text-rs-brand hover:underline">
            Go to dependency setup
          </button>
        </div>
      )}

      {effectiveCurrent === 'evidence' && <EvidenceIntroStep onNext={() => goNext('alerts')} />}

      {effectiveCurrent === 'alerts' && <AlertSetupStep onNext={() => goNext('expand')} />}

      {effectiveCurrent === 'expand' && (
        <ExpandStep
          onAddSecond={() => {
            // open add dependency drawer then stay; user will return
            useAppStore.getState().setAddDependencyOpen(true);
          }}
          onInvite={() => router.push('/settings')}
          onNext={() => goNext('complete')}
        />
      )}

      {effectiveCurrent === 'complete' && <CompletionStep onFinish={finish} />}
    </OnboardingShell>
  );
}
