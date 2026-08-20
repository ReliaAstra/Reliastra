'use client';

import { Check, Circle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { hasEvidence } from '@/lib/dashboard/plans';
import { cn } from '@/lib/utils';

const KEY = 'reliastra_onboarding_dismissed';
const DONE_KEY = 'reliastra_onboarding_done';

const STEPS = [
  { id: 'dep', label: 'Add your first dependency', href: '/dependencies' },
  { id: 'alert', label: 'Set up alert notifications', href: '/settings' },
  { id: 'inc', label: 'View your first incident', href: '/incidents' },
  { id: 'ev', label: 'Generate an evidence report', href: '/evidence', trial: true },
  { id: 'team', label: 'Invite a team member', href: '/settings' },
];

export function OnboardingChecklist() {
  const user = useAppStore((s) => s.user);
  const plan = useAppStore((s) => s.plan);
  const setAdd = useAppStore((s) => s.setAddDependencyOpen);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState<string[]>(['dep']);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(KEY)) return;
    const created = user?.created_at ? new Date(user.created_at).getTime() : Date.now();
    const age = Date.now() - created;
    if (age <= 7 * 86_400_000) {
      const stored = localStorage.getItem(DONE_KEY);
      if (stored) {
        try { setDone(JSON.parse(stored)); } catch { /* ignore */ }
      }
      setVisible(true);
    }
  }, [user]);

  if (!visible) return null;

  const progress = Math.round((done.length / STEPS.length) * 100);

  function toggle(id: string) {
    setDone((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(DONE_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="fixed right-6 top-[72px] z-30 hidden w-[320px] rounded-xl border border-rs-border-subtle bg-rs-elevated p-5 xl:block">
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-rs-border-subtle">
        <div className="h-full bg-rs-brand" style={{ width: `${progress}%` }} />
      </div>
      <div className="mb-3 flex items-start justify-between">
        <h3 className="text-base font-semibold text-rs-text">Get started with Reliastra</h3>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            localStorage.setItem(KEY, '1');
            setVisible(false);
          }}
          className="text-rs-text-tertiary hover:text-rs-text"
        >
          <X size={14} />
        </button>
      </div>
      <ul className="space-y-2">
        {STEPS.map((step) => {
          const complete = done.includes(step.id);
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => {
                  if (step.trial && !hasEvidence(plan?.plan)) {
                    openUpgrade('evidence');
                    return;
                  }
                  if (step.id === 'dep') setAdd(true);
                  else router.push(step.href);
                  toggle(step.id);
                }}
                className="flex w-full items-center gap-2 text-left"
              >
                {complete ? (
                  <Check size={16} className="text-rs-up" />
                ) : (
                  <Circle size={16} className="text-rs-text-tertiary" />
                )}
                <span
                  className={cn(
                    'text-sm',
                    complete ? 'text-rs-text-tertiary line-through' : 'text-rs-text'
                  )}
                >
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
