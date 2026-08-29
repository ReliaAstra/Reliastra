'use client';

import { Check, Circle, ListChecks, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { hasEvidence } from '@/lib/dashboard/plans';
import { cn } from '@/lib/utils';

const KEY = 'reliastra_onboarding_dismissed';
const DONE_KEY = 'reliastra_onboarding_done';
const OPEN_KEY = 'reliastra_onboarding_opened_session';

const STEPS = [
  { id: 'dep', label: 'Add your first dependency', href: '/dependencies' },
  { id: 'alert', label: 'Set up alert notifications', href: '/settings' },
  { id: 'inc', label: 'View your first incident', href: '/incidents' },
  { id: 'ev', label: 'Generate an evidence report', href: '/evidence', trial: true },
  { id: 'plan', label: 'Review plan & trial status', href: '/settings/billing' },
];

function EvaluationIntro() {
  const plan = useAppStore((s) => s.plan);
  const left = plan?.evaluation_days_remaining ?? plan?.trial_days_remaining ?? 14;
  const active = (plan?.is_evaluation_active ?? plan?.is_trial_active) === true;
  if (!active) return null;
  return (
    <p className="mb-3 rounded-lg border border-rs-brand/20 bg-rs-brand-subtle px-3 py-2 text-xs leading-relaxed text-rs-text-secondary">
      <strong className="text-rs-text">Full-access evaluation:</strong> you have {left} day{left === 1 ? '' : 's'} of
      Pro capabilities — evidence, Slack alerts, API access and extended retention — to
      discover what you’ll keep when you subscribe. No feature limits, no card required.
    </p>
  );
}

/**
 * Onboarding checklist.
 *
 * Collapsed by default to a quiet launcher pill so it never overlaps page
 * content; it auto-expands once per session for brand-new accounts and stays
 * out of the way after that. Dismissal is permanent (localStorage).
 */
export function OnboardingChecklist() {
  const user = useAppStore((s) => s.user);
  const plan = useAppStore((s) => s.plan);
  const setAdd = useAppStore((s) => s.setAddDependencyOpen);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(KEY)) return;
    const created = user?.created_at ? new Date(user.created_at).getTime() : Date.now();
    if (Date.now() - created > 7 * 86_400_000) return;
    const stored = localStorage.getItem(DONE_KEY);
    if (stored) {
      try { setDone(JSON.parse(stored)); } catch { /* ignore */ }
    }
    setVisible(true);
    // Auto-expand exactly once per browser session; afterwards it stays a pill.
    if (!sessionStorage.getItem(OPEN_KEY)) {
      sessionStorage.setItem(OPEN_KEY, '1');
      setExpanded(true);
    }
  }, [user]);

  if (!visible) return null;

  const progress = Math.round((done.length / STEPS.length) * 100);
  const complete = done.length === STEPS.length;

  function toggle(id: string) {
    setDone((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(DONE_KEY, JSON.stringify(next));
      return next;
    });
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rs-button rs-button-secondary rs-button-sm fixed bottom-5 right-5 z-30 shadow-rs-popover"
        aria-expanded={expanded}
        aria-label={`Get started checklist: ${done.length} of ${STEPS.length} complete`}
      >
        <ListChecks size={14} aria-hidden />
        Get started
        <span className="rs-mono text-[11px] text-rs-text-tertiary">
          {done.length}/{STEPS.length}
        </span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Get started with Reliastra"
      className="fixed bottom-5 right-5 z-30 w-[320px] rounded-xl border border-rs-border-subtle bg-rs-elevated p-5 shadow-rs-popover"
    >
      <EvaluationIntro />
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-rs-text">Get started with Reliastra</h3>
          <p className="rs-mono mt-0.5 text-[11px] text-rs-text-tertiary">
            {complete ? 'All steps complete' : `${done.length} of ${STEPS.length} complete`}
          </p>
        </div>
        <button
          type="button"
          aria-label="Collapse checklist"
          onClick={() => setExpanded(false)}
          className="rounded-md p-1 text-rs-text-tertiary transition-colors hover:bg-rs-hover hover:text-rs-text"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-rs-border-subtle" aria-hidden>
        <div className="h-full bg-rs-brand transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>
      <ul className="space-y-1.5">
        {STEPS.map((step) => {
          const isDone = done.includes(step.id);
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => {
                  if (step.trial && !hasEvidence(plan?.effective_plan ?? plan?.plan)) {
                    openUpgrade('evidence');
                    return;
                  }
                  if (step.id === 'dep') setAdd(true);
                  else router.push(step.href);
                  toggle(step.id);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-rs-hover"
              >
                {isDone ? (
                  <Check size={16} className="shrink-0 text-rs-up" aria-hidden />
                ) : (
                  <Circle size={16} className="shrink-0 text-rs-text-tertiary" aria-hidden />
                )}
                <span
                  className={cn(
                    'text-[13px]',
                    isDone ? 'text-rs-text-tertiary line-through' : 'text-rs-text'
                  )}
                >
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(KEY, '1');
          setVisible(false);
        }}
        className="mt-3 text-xs font-medium text-rs-text-tertiary transition-colors hover:text-rs-text"
      >
        Dismiss permanently
      </button>
    </div>
  );
}
