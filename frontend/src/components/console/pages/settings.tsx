'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { getPlan, intervalLabel, retentionLabel } from '@/lib/dashboard/plans';
import { api } from '@/lib/dashboard/api';
import { useAlertConfigs, useDependencies } from '@/lib/dashboard/queries';
import { Fact, PageHead, Row, Section } from '@/components/console/primitives';
import Link from 'next/link';

/**
 * Settings.
 *
 * Two rules govern this page. Fields the backend will not let a customer
 * change are rendered as read-only readouts, not as inputs that silently do
 * nothing. And entitlement rows state what the current plan actually grants —
 * they never advertise a channel the entitlement model does not implement
 * (there is no PagerDuty, so there is no PagerDuty row).
 */
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

  const slackEntitled =
    ['pro', 'enterprise'].includes(current.id) || plan?.is_trial_active === true;
  const dirty = orgName.trim() !== (org?.name ?? '') && orgName.trim().length > 0;

  return (
    <>
      <PageHead
        title="Settings"
        meta={
          <>
            <Fact label="Organization" value={org?.name ?? '—'} mono={false} />
            <Fact label="Plan" value={current.name} mono={false} />
            <Fact
              label="Dependencies"
              value={
                current.dependencies != null
                  ? `${deps.data?.length ?? 0}/${current.dependencies}`
                  : `${deps.data?.length ?? 0}`
              }
            />
          </>
        }
      />

      <div className="flex flex-wrap gap-4 border-b border-[var(--obc-line)] py-4"><Link className="obc-link" href="/settings/notifications">Notifications →</Link><Link className="obc-link" href="/settings/billing">Billing →</Link></div>
      <Section title="Organization" hint="Displayed on evidence records and shared reports.">
        <form
          className="max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) saveOrg.mutate();
          }}
        >
          <div className="mb-4">
            <label className="obc-field-label" htmlFor="org-name">
              Name
            </label>
            <input
              id="org-name"
              className="obc-input"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              autoComplete="organization"
            />
          </div>
          <div className="mb-5">
            <label className="obc-field-label" htmlFor="org-slug">
              Workspace slug
            </label>
            <input
              id="org-slug"
              className="obc-input font-[family-name:var(--ob-font-mono)]"
              value={org?.slug ?? ''}
              readOnly
              aria-describedby="org-slug-note"
            />
            <p id="org-slug-note" className="mt-1.5 text-[11.5px] text-[var(--obc-text-4)]">
              The slug is fixed once a workspace is created — it appears in verification links
              already issued to third parties.
            </p>
          </div>
          <button
            type="submit"
            className="obc-btn obc-btn-primary"
            disabled={!dirty || saveOrg.isPending}
          >
            {saveOrg.isPending ? 'Saving…' : 'Save organization'}
          </button>
        </form>
      </Section>

      <Section title="Account" hint="Managed by your RELIASTRA login.">
        <div className="max-w-xl border border-[var(--obc-line)] bg-[var(--obc-base)] px-4 py-2">
          <dl>
            <Row label="Name" mono>
              {user?.full_name || <span className="text-[var(--obc-text-4)]">not set</span>}
            </Row>
            <Row label="Email" mono>
              {user?.email ?? '—'}
            </Row>
            <Row label="Account created" mono>
              {user?.created_at ? user.created_at.slice(0, 10) : '—'}
            </Row>
          </dl>
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--obc-text-4)]">
          Changing the email on an account alters who can retrieve evidence for this workspace.{' '}
          <Link href="/support" className="obc-link">
            Raise a support request
          </Link>{' '}
          to make that change.
        </p>
      </Section>

      <Section
        title="Alert channels"
        hint="Where incident notifications are delivered. Channels reflect what your plan entitles, not a wish list."
      >
        <ul className="max-w-xl border border-[var(--obc-line)]">
          {[
            {
              id: 'email',
              label: 'Email',
              note: 'Included on every plan.',
              entitled: true,
            },
            {
              id: 'slack',
              label: 'Slack',
              note: slackEntitled
                ? 'Included on your plan.'
                : 'Available on Pro and above.',
              entitled: slackEntitled,
            },
          ].map((ch) => {
            const configured = alerts.data?.some((a) => a.channel_type === ch.id && a.is_active);
            return (
              <li
                key={ch.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--obc-line)] px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="text-[13px] text-[var(--obc-text)]">{ch.label}</span>
                  <span className="ml-3 text-[11.5px] text-[var(--obc-text-4)]">{ch.note}</span>
                </span>
                {!ch.entitled ? (
                  <button
                    type="button"
                    className="obc-btn obc-btn-sm"
                    onClick={() => openUpgrade('alerts')}
                  >
                    Compare plans
                  </button>
                ) : alerts.isError ? (
                  <span className="obc-mono text-[var(--obc-text-4)]">status unavailable</span>
                ) : (
                  <span className="obc-mono text-[var(--obc-text-3)]">
                    {configured ? 'configured' : 'not configured'}
                  </span>
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
          <Link href="/settings/billing" className="obc-btn obc-btn-sm">
            Billing
          </Link>
        }
      >
        <div className="max-w-xl border border-[var(--obc-line)] bg-[var(--obc-base)] px-4 py-2">
          <dl>
            <Row label="Plan" mono>
              {current.name}
            </Row>
            <Row label="Monitored dependencies" mono>
              {plan?.max_dependencies != null
                ? `up to ${plan.max_dependencies}`
                : current.dependencies != null
                  ? `up to ${current.dependencies}`
                  : 'unlimited'}
            </Row>
            <Row label="Minimum check interval" mono>
              {intervalLabel(plan?.min_check_interval_seconds ?? null)}
            </Row>
            <Row label="Observation retention" mono>
              {retentionLabel(plan?.data_retention_days ?? null)}
            </Row>
            <Row label="Evidence records" mono>
              {['pro', 'enterprise'].includes(current.id) || plan?.is_trial_active
                ? 'included'
                : 'not included'}
            </Row>
          </dl>
        </div>
      </Section>
    </>
  );
}
