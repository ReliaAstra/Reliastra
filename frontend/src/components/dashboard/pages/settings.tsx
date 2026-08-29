'use client';

import { useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { getPlan, hasSlackAlerts } from '@/lib/dashboard/plans';
import { useAlertConfigs } from '@/lib/dashboard/queries';
import { RsButton } from '../ui/button';
import { toast } from 'sonner';

const field =
  'flex h-9 w-full rounded-[10px] border border-rs-border-subtle bg-rs-input px-3 text-sm text-rs-text placeholder:text-rs-text-tertiary outline-none transition-[border-color,box-shadow] duration-150 focus:border-rs-brand focus:ring-[3px] focus:ring-[rgb(37_99_235_/_0.20)] dark:focus:ring-[rgb(59_130_246_/_0.20)]';

export function SettingsPage() {
  const user = useAppStore((s) => s.user);
  const org = useAppStore((s) => s.org);
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const { data: alerts } = useAlertConfigs();
  const current = getPlan(plan?.plan);
  const [name, setName] = useState(user?.full_name ?? '');
  const [orgName, setOrgName] = useState(org?.name ?? '');

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="rs-page-title text-2xl font-semibold tracking-[-0.02em]">Settings</h1>
        <p className="mt-1.5 text-sm text-rs-text-tertiary">Profile, organization, and notification channels.</p>
      </div>

      <section className="mb-8 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="rs-section-title mb-4 text-base font-semibold">Profile</h2>
        <label className="mb-4 block">
          <span className="rs-label mb-1.5 block text-[11px]">Full name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="mb-4 block">
          <span className="rs-label mb-1.5 block text-[11px]">Email</span>
          <input className={field} value={user?.email ?? ''} readOnly />
        </label>
        <RsButton
          onClick={() => toast.success('Profile saved')}
        >
          Save profile
        </RsButton>
      </section>

      <section className="mb-8 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="rs-section-title mb-4 text-base font-semibold">Organization</h2>
        <label className="mb-4 block">
          <span className="rs-label mb-1.5 block text-[11px]">Name</span>
          <input className={field} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        </label>
        <label className="mb-4 block">
          <span className="rs-label mb-1.5 block text-[11px]">Slug</span>
          <input className={`${field} font-mono`} value={org?.slug ?? ''} readOnly />
        </label>
        <p className="text-sm text-rs-text-tertiary">Current plan: {current.name}</p>
        <RsButton className="mt-4" variant="secondary" onClick={() => toast.success('Organization saved')}>
          Save organization
        </RsButton>
      </section>

      <section className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="rs-section-title mb-4 text-base font-semibold">Notifications</h2>
        <div className="divide-y divide-rs-border-subtle">
          {['email', 'slack', 'pagerduty'].map((ch) => {
            const locked = (ch === 'slack' || ch === 'pagerduty') && !hasSlackAlerts(plan?.plan);
            const enabled = alerts?.some((a) => a.channel_type === ch);
            return (
              <div key={ch} className="flex h-12 items-center justify-between">
                <span className="text-sm capitalize text-rs-text">{ch === 'pagerduty' ? 'PagerDuty' : ch}</span>
                {locked ? (
                  <button
                    type="button"
                    onClick={() => openUpgrade('alerts')}
                    className="text-sm text-rs-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
                  >
                    {ch === 'slack' ? 'Slack' : 'PagerDuty'} alerts are available on Standard. Start trial →
                  </button>
                ) : (
                  <span className="text-sm text-rs-text-secondary">{enabled ? 'Configured' : 'Not configured'}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
