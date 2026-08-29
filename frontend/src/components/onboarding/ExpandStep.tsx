'use client';

import { useState } from 'react';
import { Users, Link2, Plus } from 'lucide-react';
import { analytics } from '@/lib/analytics';
import { RsButton } from '@/components/dashboard/ui/button';
import { cn } from '@/lib/utils';

export function ExpandStep({
  onAddSecond,
  onInvite,
  onNext,
}: {
  onAddSecond: () => void;
  onInvite: () => void;
  onNext: () => void;
}) {
  const [chosen, setChosen] = useState<'dep' | 'team' | null>(null);

  return (
    <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-7">
      <div className="mb-6">
        <p className="rs-eyebrow">Step 7 · Scale</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-rs-text">Expand your reliability picture.</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-rs-text-secondary">
          One dependency proves the loop. A second makes the incident correlation meaningful. Add them in priority order — Reliastra stays quiet until there’s something worth your attention.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setChosen('dep');
            analytics.secondDependencyAdded({ source: 'onboarding_expand' });
            onAddSecond();
          }}
          className={cn(
            'rounded-xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
            chosen === 'dep' ? 'border-rs-brand bg-rs-brand-subtle' : 'border-rs-border-subtle bg-rs-base hover:border-rs-border'
          )}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rs-elevated border border-rs-border-subtle">
            <Link2 size={16} className="text-rs-brand" />
          </span>
          <div className="mt-3 text-sm font-semibold text-rs-text">Add your second critical dependency</div>
          <div className="mt-1 text-xs leading-relaxed text-rs-text-secondary">
            Most teams add their payment, auth, or primary API next.
          </div>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-rs-brand">
            <Plus size={12} /> Add dependency
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setChosen('team');
            analytics.teamInviteStarted({ source: 'onboarding_expand' });
            onInvite();
          }}
          className={cn(
            'rounded-xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
            chosen === 'team' ? 'border-rs-brand bg-rs-brand-subtle' : 'border-rs-border-subtle bg-rs-base hover:border-rs-border'
          )}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rs-elevated border border-rs-border-subtle">
            <Users size={16} className="text-rs-brand" />
          </span>
          <div className="mt-3 text-sm font-semibold text-rs-text">Invite a teammate</div>
          <div className="mt-1 text-xs leading-relaxed text-rs-text-secondary">
            On-call or platform — they’ll see the same independent evidence and alerts.
          </div>
          <span className="mt-3 inline-flex text-xs font-medium text-rs-text-tertiary">Settings → Members</span>
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-rs-border-subtle pt-5">
        <p className="text-xs text-rs-text-tertiary">You can do both later — pick one now or skip.</p>
        <RsButton onClick={onNext} variant="secondary">
          Skip for now
        </RsButton>
      </div>
    </div>
  );
}
