'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import { getPlan } from '@/lib/dashboard/plans';
import { api } from '@/lib/dashboard/api';
import { useAlertConfigs } from '@/lib/dashboard/queries';
import { RsButton } from '../ui/button';
import { toast } from 'sonner';

const field =
  'flex h-9 w-full rounded-[10px] border border-rs-border-subtle bg-rs-input px-3 text-sm text-rs-text placeholder:text-rs-text-tertiary outline-none transition-[border-color,box-shadow] duration-150 focus:border-rs-brand focus:ring-[3px] focus:ring-[rgb(37_99_235_/_0.20)] dark:focus:ring-[rgb(59_130_246_/_0.20)]';

export function SettingsPage() {
  const user = useAppStore((s) => s.user);
  const org = useAppStore((s) => s.org);
  const setSession = useAppStore((s) => s.setSession);
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const { data: alerts } = useAlertConfigs();
  const current = getPlan(plan?.effective_plan ?? plan?.plan);

  const [orgName, setOrgName] = useState(org?.name ?? '');

  // ── Organization save (real PATCH) ──────────────────────────────────────
  const saveOrg = useMutation({
    mutationFn: () => api.updateOrg({ name: orgName.trim() }),
    onSuccess: (updated) => {
      if (user) setSession(user, updated, plan);
      toast.success('Organization saved');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save organization'),
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="rs-page-title text-2xl font-semibold tracking-[-0.02em]">Settings</h1>
        <p className="mt-1.5 text-sm text-rs-text-tertiary">Organization and notification channels.</p>
      </div>

      <section className="mb-8 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="rs-section-title mb-4 text-base font-semibold">Profile</h2>
        <label className="mb-4 block">
          <span className="rs-label mb-1.5 block text-[11px]">Full name</span>
          <input className={field} value={user?.full_name ?? ''} readOnly />
        </label>
        <label className="mb-4 block">
          <span className="rs-label mb-1.5 block text-[11px]">Email</span>
          <input className={field} value={user?.email ?? ''} readOnly />
        </label>
        <p className="text-xs text-rs-text-tertiary">
          Your profile is managed by your RELIASTRA account. Contact support to change it.
        </p>
      </section>

      <section className="mb-8 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="rs-section-title mb-4 text-base font-semibold">Organization</h2>
        <label className="mb-4 block">
          <span className="rs-label mb-1.5 block text-[11px]">Name</span>
          <input className={field} value={orgName || org?.name || ''} onChange={(e) => setOrgName(e.target.value)} />
        </label>
        <label className="mb-4 block">
          <span className="rs-label mb-1.5 block text-[11px]">Slug</span>
          <input className={`${field} font-mono`} value={org?.slug ?? ''} readOnly />
        </label>
        <div className="flex items-center gap-3">
          <RsButton onClick={() => saveOrg.mutate()} disabled={saveOrg.isPending || !orgName.trim()}>
            {saveOrg.isPending ? 'Saving…' : 'Save organization'}
          </RsButton>
          <span className="text-xs text-rs-text-tertiary">Plan: {current.name}</span>
        </div>
      </section>

      <section className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="rs-section-title mb-4 text-base font-semibold">Notifications</h2>
        <div className="divide-y divide-rs-border-subtle">
          {/* Channels reflect backend PLAN_FEATURES exactly: email everywhere,
              Slack on Pro+. No PagerDuty exists in the entitlement model. */}
          {['email', 'slack'].map((ch) => {
            const locked = ch === 'slack' && !['pro', 'enterprise'].includes(current.id) && !(plan?.is_trial_active === true);
            const enabled = alerts?.some((a) => a.channel_type === ch && a.is_active);
            return (
              <div key={ch} className="flex h-12 items-center justify-between">
                <span className="text-sm capitalize text-rs-text">{ch}</span>
                {locked ? (
                  <button
                    type="button"
                    onClick={() => openUpgrade('alerts')}
                    className="text-sm text-rs-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
                  >
                    Slack alerts are available on Pro →
                  </button>
                ) : (
                  <span className="text-sm text-rs-text-secondary">{enabled ? 'Configured' : 'Not configured'}</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-rs-text-tertiary">
          Alert channels route incident notifications to your team. Configure delivery targets in
          the integrations panel once a channel is enabled on your plan.
        </p>
      </section>
    </div>
  );
}
