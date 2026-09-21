'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { getPlan, intervalLabel, retentionLabel } from '@/lib/dashboard/plans';
import { api } from '@/lib/dashboard/api';
import { useAlertConfigs, useDependencies } from '@/lib/dashboard/queries';
import { PageHead, Row, Section } from '@/components/console/primitives';
import Link from 'next/link';

export function SettingsPage() {
  const user = useAppStore((s) => s.user);
  const org = useAppStore((s) => s.org);
  const setSession = useAppStore((s) => s.setSession);
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const alerts = useAlertConfigs();
  const deps = useDependencies();
  const current = getPlan(plan?.effective_plan ?? plan?.plan);
  const [orgName, setOrgName] = useState(org?.name ?? '');

  const saveOrg = useMutation({
    mutationFn: () => api.updateOrg({ name: orgName.trim() }),
    onSuccess: (updated) => {
      if (user) setSession(user, updated, plan);
      toast.success('Organization saved');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save organization'),
  });

  const slackEntitled = ['pro', 'enterprise'].includes(current.id) || plan?.is_trial_active === true;
  const dirty = orgName.trim() !== (org?.name ?? '') && orgName.trim().length > 0;

  return (
    <>
      <PageHead title="Settings" description={`Organization: ${org?.name ?? '—'} · Plan: ${current.name} · Dependencies: ${deps.data?.length ?? 0}${current.dependencies != null ? ` / ${current.dependencies}` : ''}`} />

      <div className="flex flex-wrap gap-4 border-b border-rs-border-subtle py-4">
        <Link className="text-rs-brand hover:underline text-[13px]" href="/settings/developer">Developer →</Link>
        <Link className="text-rs-brand hover:underline text-[13px]" href="/settings/notifications">Notifications →</Link>
        <Link className="text-rs-brand hover:underline text-[13px]" href="/settings/billing">Billing →</Link>
      </div>

      <Section title="Organization" hint="Displayed on evidence records and shared reports.">
        <form
          className="max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) saveOrg.mutate();
          }}
        >
          <div className="mb-4">
            <label className="rs-label mb-1.5 block" htmlFor="org-name">
              Name
            </label>
            <input id="org-name" className="rs-input" value={orgName} onChange={(e) => setOrgName(e.target.value)} autoComplete="organization" />
          </div>
          <div className="mb-5">
            <label className="rs-label mb-1.5 block" htmlFor="org-slug">
              Workspace slug
            </label>
            <input id="org-slug" className="rs-input rs-mono" value={org?.slug ?? ''} readOnly aria-describedby="org-slug-note" />
            <p id="org-slug-note" className="mt-1.5 text-[11.5px] text-rs-text-tertiary">
              The slug is fixed once a workspace is created. It appears in verification links already issued to third parties.
            </p>
          </div>
          <button type="submit" className="rs-button rs-button-primary rs-button-sm" disabled={!dirty || saveOrg.isPending}>
            {saveOrg.isPending ? 'Saving…' : 'Save organization'}
          </button>
        </form>
      </Section>

      <Section title="Account" hint="Managed by your RELIASTRA login.">
        <div className="max-w-xl bg-rs-elevated px-4 py-2">
          <dl>
            <Row label="Name">{user?.full_name || <span className="text-rs-text-tertiary">—</span>}</Row>
            <Row label="Email">{user?.email ?? '—'}</Row>
            <Row label="Account created">{user?.created_at ? user.created_at.slice(0, 10) : '—'}</Row>
          </dl>
        </div>
        <p className="mt-2 text-[11.5px] text-rs-text-tertiary">
          Changing the email on an account alters who can retrieve evidence for this workspace.{' '}
          <Link href="/support" className="text-rs-brand hover:underline">
            Raise a support request
          </Link>{' '}
          to make that change.
        </p>
      </Section>

      <Section title="Alert channels" hint="Where incident notifications are delivered. Channels reflect what your plan entitles, not a wish list.">
        <ul className="max-w-xl">
          {[
            { id: 'email', label: 'Email', note: 'Included on every plan.', entitled: true },
            { id: 'slack', label: 'Slack', note: slackEntitled ? 'Included on your plan.' : 'Included in the Developer plan.', entitled: slackEntitled },
          ].map((ch) => {
            const configured = alerts.data?.some((a) => a.channel_type === ch.id && a.is_active);
            return (
              <li key={ch.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-rs-border-subtle px-4 py-3 last:border-b-0">
                <span className="min-w-0">
                  <span className="text-[13px] text-rs-text">{ch.label}</span>
                  <span className="ml-3 text-[11.5px] text-rs-text-tertiary">{ch.note}</span>
                </span>
                {!ch.entitled ? (
                  <button type="button" className="rs-button rs-button-secondary rs-button-sm" onClick={() => openUpgrade('alerts')}>
                    Compare plans
                  </button>
                ) : alerts.isError ? (
                  <span className="rs-mono text-rs-text-tertiary">status unavailable</span>
                ) : (
                  <span className="rs-mono text-rs-text-tertiary">{configured ? 'configured' : 'not configured'}</span>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title="Plan entitlements"
        hint="What the current plan grants. Billing is managed separately."
        action={
          <Link href="/settings/billing" className="rs-button rs-button-secondary rs-button-sm">
            Billing
          </Link>
        }
      >
        <div className="max-w-xl bg-rs-elevated px-4 py-2">
          <dl>
            <Row label="Plan">{current.name}</Row>
            <Row label="Monitored dependencies">
              {plan?.max_dependencies != null
                ? `up to ${plan.max_dependencies}`
                : current.dependencies != null
                  ? `up to ${current.dependencies}`
                  : plan
                    ? 'unlimited'
                    : '—'}
            </Row>
            <Row label="Minimum check interval">{intervalLabel(plan?.min_check_interval_seconds ?? null)}</Row>
            <Row label="Observation retention">{retentionLabel(plan?.data_retention_days ?? null)}</Row>
            <Row label="Evidence records">{['pro', 'enterprise'].includes(current.id) || plan?.is_trial_active ? 'included' : 'not included'}</Row>
          </dl>
        </div>
      </Section>
    </>
  );
}
