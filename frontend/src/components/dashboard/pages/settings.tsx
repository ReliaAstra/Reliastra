'use client';

import { useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { getPlan, hasApiAccess, hasSlackAlerts } from '@/lib/dashboard/plans';
import { useAlertConfigs } from '@/lib/dashboard/queries';
import { RsButton } from '../ui/button';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';

const field =
  'w-full rounded-lg border border-rs-border bg-rs-input px-3.5 py-2.5 text-sm text-rs-text outline-none focus:border-rs-brand focus:shadow-[0_0_0_2px_rgba(37,99,235,0.2)]';

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
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">Settings</h1>
        <p className="mt-1.5 text-sm text-rs-text-tertiary">Profile, organization, and notification channels.</p>
      </div>

      <section className="mb-8 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="mb-4 text-lg font-semibold text-rs-text">Profile</h2>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm text-rs-text-secondary">Full name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm text-rs-text-secondary">Email</span>
          <input className={field} value={user?.email ?? ''} readOnly />
        </label>
        <RsButton
          onClick={() => toast.success('Profile saved')}
        >
          Save profile
        </RsButton>
      </section>

      <section className="mb-8 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="mb-4 text-lg font-semibold text-rs-text">Organization</h2>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm text-rs-text-secondary">Name</span>
          <input className={field} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        </label>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm text-rs-text-secondary">Slug</span>
          <input className={`${field} font-mono`} value={org?.slug ?? ''} readOnly />
        </label>
        <p className="text-sm text-rs-text-tertiary">Current plan: {current.name}</p>
        <RsButton className="mt-4" variant="secondary" onClick={() => toast.success('Organization saved')}>
          Save organization
        </RsButton>
      </section>

      <section className="mb-8 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="mb-4 text-lg font-semibold text-rs-text">Notifications</h2>
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
                    className="text-sm text-rs-text-accent"
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

      <section className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="mb-4 text-lg font-semibold text-rs-text">API access</h2>
        {!hasApiAccess(plan?.plan) ? (
          <div className="rounded-xl border border-dashed border-rs-border px-6 py-10 text-center">
            <Lock size={32} className="mx-auto text-rs-text-tertiary" />
            <p className="mt-3 text-sm text-rs-text">API access is a Standard feature</p>
            <p className="mt-1 text-sm text-rs-text-secondary">
              Query dependency health and incidents programmatically.
            </p>
            <RsButton className="mt-4" onClick={() => openUpgrade('api')}>
              Start Standard trial
            </RsButton>
          </div>
        ) : (
          <div>
            <p className="mb-3 font-mono text-sm text-rs-text-secondary">rl_live_••••••••••••4f2a</p>
            <RsButton
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText('rl_live_demo_key');
                toast.success('API key copied');
              }}
            >
              Copy API key
            </RsButton>
          </div>
        )}
      </section>
    </div>
  );
}
