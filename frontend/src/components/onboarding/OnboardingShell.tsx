'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { BrandMark } from '@/components/auth/brand-mark';
import { cn } from '@/lib/utils';
import { STEP_ORDER, useOnboardingStore, type OnboardingStepId } from '@/stores/onboarding-store';

const LABELS: Record<OnboardingStepId, string> = {
  context: 'Context',
  dependency: 'Connect',
  validation: 'Validate',
  'first-value': 'Observe',
  evidence: 'Evidence',
  alerts: 'Alerts',
  expand: 'Expand',
  complete: 'Ready',
};

export function OnboardingProgress({ current }: { current: OnboardingStepId }) {
  const idx = STEP_ORDER.indexOf(current);
  return (
    <div className="flex items-center gap-2" aria-label="Onboarding progress">
      <span className="rs-mono text-[11px] font-medium text-rs-text-tertiary">
        {String(idx + 1).padStart(2, '0')} / {String(STEP_ORDER.length).padStart(2, '0')}
      </span>
      <div className="flex gap-1">
        {STEP_ORDER.map((id, i) => (
          <span
            key={id}
            aria-hidden
            className={cn(
              'h-1 rounded-full transition-all duration-300',
              i === idx ? 'w-8 bg-rs-brand' : i < idx ? 'w-5 bg-rs-up' : 'w-5 bg-rs-border-subtle'
            )}
          />
        ))}
      </div>
      <span className="hidden text-xs font-medium text-rs-text-secondary sm:inline">
        {LABELS[current]}
      </span>
    </div>
  );
}

export function OnboardingShell({
  current,
  children,
  onExit,
}: {
  current: OnboardingStepId;
  children: React.ReactNode;
  onExit?: () => void;
}) {
  const { markComplete } = useOnboardingStore();

  // ensure we record abandonment if unmounted mid-flow
  useEffect(() => {
    return () => {
      // no-op, analytics handled by steps
    };
  }, []);

  return (
    <div className="rs-app min-h-screen bg-rs-base">
      {/* Top bar — minimal, enterprise, not marketing */}
      <header className="sticky top-0 z-30 border-b border-rs-border-subtle bg-rs-base/90 backdrop-blur supports-[backdrop-filter]:bg-rs-base/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="inline-flex items-center gap-2.5">
            <BrandMark size={22} />
            <span className="hidden text-sm font-semibold tracking-[-0.01em] text-rs-text sm:inline">
              Reliastra
            </span>
            <span className="hidden rounded-full border border-rs-border-subtle bg-rs-elevated px-2 py-0.5 text-[11px] font-medium text-rs-text-tertiary sm:inline">
              Onboarding
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <OnboardingProgress current={current} />
            {onExit && (
              <button
                onClick={onExit}
                className="hidden text-xs font-medium text-rs-text-tertiary hover:text-rs-text sm:inline-flex"
              >
                Exit to dashboard
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="min-w-0">{children}</div>
          {/* Context panel — explains why, not just what */}
          <aside className="hidden lg:block">
            <div className="sticky top-[88px] space-y-4">
              <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
                <p className="rs-eyebrow">How this works</p>
                <h3 className="mt-2 text-sm font-semibold text-rs-text">
                  Independent observation, not polling
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-rs-text-secondary">
                  Reliastra checks your dependencies from <span className="font-medium text-rs-text">multiple regions</span> with quorum confirmation.
                  When regions agree a vendor is degraded, we create an incident with deterministic attribution and checksummed evidence — independent of your application logs.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  {[
                    ['Observations', 'Multi-region'],
                    ['Incidents', 'Quorum'],
                    ['Evidence', 'Checksummed'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-rs-base px-2 py-3">
                      <div className="rs-mono text-xs font-semibold text-rs-text">{v}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.05em] text-rs-text-tertiary">{k}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
                <p className="rs-eyebrow">What you keep</p>
                <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-rs-text-secondary">
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rs-brand" />
                    <span><span className="font-medium text-rs-text">Every check is independent</span> — not your APM, not the vendor’s status page.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rs-brand" />
                    <span>Evidence is <span className="font-medium text-rs-text">timestamped and verifiable</span> for vendor and SLA conversations.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rs-brand" />
                    <span>Your data is <span className="font-medium text-rs-text">preserved on downgrade</span> — paused, never deleted.</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-950/20">
                <p className="text-xs font-semibold text-rs-text">14-day full-access evaluation</p>
                <p className="mt-1 text-xs leading-relaxed text-rs-text-secondary">
                  Professional limits (100 deps, 90d retention, evidence, API) — no card. Your evaluation is server-time authoritative.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="flex items-center justify-between border-t border-rs-border-subtle pt-4 text-xs text-rs-text-tertiary">
          <span className="rs-mono">reliastra.com/onboarding</span>
          <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-rs-text">
            Skip to dashboard <ChevronRight size={12} />
          </Link>
        </div>
      </footer>
    </div>
  );
}

export function StepHeader({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="mb-6">
      <p className="rs-eyebrow">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.02em] text-rs-text sm:text-[28px]">
        {title}
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-rs-text-secondary">{desc}</p>
    </div>
  );
}
