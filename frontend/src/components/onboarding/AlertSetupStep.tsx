'use client';

import { useEffect, useState } from 'react';
import { Mail, Slack, ShieldAlert } from 'lucide-react';
import { analytics } from '@/lib/analytics';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/dashboard/api';
import { useAlertConfigs } from '@/lib/dashboard/queries';
import { RsButton } from '@/components/dashboard/ui/button';
import { getPlan } from '@/lib/dashboard/plans';

export function AlertSetupStep({ onNext }: { onNext: () => void }) {
  const plan = useAppStore((s) => s.plan);
  const current = getPlan(plan?.effective_plan ?? plan?.plan);
  const { data: configs, refetch, isLoading } = useAlertConfigs();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasEmail = configs?.some((c) => c.channel_type === 'email');
  const hasSlack = configs?.some((c) => c.channel_type === 'slack');
  const slackAllowed = ['standard', 'professional', 'agency'].includes(current.id) || Boolean(plan?.is_evaluation_active || plan?.is_trial_active);

  useEffect(() => {
    if (!isLoading && hasEmail) analytics.alertsEnabled({ channel: 'email', source: 'onboarding' });
  }, [isLoading, hasEmail]);

  async function enableEmail() {
    setError(null);
    setSaving(true);
    try {
      // Use the signed-in user's email as default if field empty
      const target = email.trim() || useAppStore.getState().user?.email || '';
      if (!target) {
        setError('Enter an email address.');
        return;
      }
      await api.createAlertConfig({ channel_type: 'email', config: { email: target }, is_active: true });
      await refetch();
      analytics.alertsEnabled({ channel: 'email' });
    } catch (e: any) {
      setError(e?.message || 'Could not enable email alerts.');
    } finally {
      setSaving(false);
    }
  }

  async function enableSlack() {
    const url = prompt('Paste your Slack incoming webhook URL (https://hooks.slack.com/...)');
    if (!url) return;
    setSaving(true);
    setError(null);
    try {
      await api.createAlertConfig({ channel_type: 'slack', config: { webhook_url: url }, is_active: true });
      await refetch();
      analytics.alertsEnabled({ channel: 'slack' });
    } catch (e: any) {
      setError(e?.message || 'Slack webhook invalid or not allowed on Free.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-7">
      <div className="mb-6">
        <p className="rs-eyebrow">Step 6 · Alerting</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-rs-text">How should Reliastra reach you?</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-rs-text-secondary">
          When a dependency fails quorum, you’ll get a concise alert with incident link and evidence. Email is on by default — add Slack or PagerDuty if your plan allows.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-[10px] border border-rs-border-subtle bg-rs-base p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rs-elevated border border-rs-border-subtle">
                <Mail size={16} className="text-rs-brand" />
              </span>
              <div>
                <div className="text-sm font-medium text-rs-text">Email alerts</div>
                <div className="text-xs text-rs-text-tertiary">Recommended · works on every plan</div>
                {hasEmail ? (
                  <span className="mt-2 inline-flex rounded-full bg-rs-up-bg px-2 py-0.5 text-xs font-medium text-rs-up">Enabled</span>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <input
                      placeholder={useAppStore.getState().user?.email || 'you@company.com'}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rs-input h-8 w-56 text-sm"
                      aria-label="Email for alerts"
                    />
                    <RsButton onClick={enableEmail} disabled={saving} className="h-8 px-3 text-xs">
                      {saving ? 'Enabling…' : 'Enable'}
                    </RsButton>
                  </div>
                )}
              </div>
            </div>
            <span className="hidden rs-mono text-[11px] text-rs-text-tertiary sm:inline">✓ default</span>
          </div>
        </div>

        <div className="rounded-[10px] border border-rs-border-subtle bg-rs-base p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rs-elevated border border-rs-border-subtle">
                <Slack size={16} className={slackAllowed ? 'text-rs-brand' : 'text-rs-text-tertiary'} />
              </span>
              <div>
                <div className="text-sm font-medium text-rs-text">Slack</div>
                <div className="text-xs text-rs-text-tertiary">
                  {slackAllowed ? 'Incoming webhook — message with incident link and status.' : 'Requires Standard or higher — available during your Professional evaluation.'}
                </div>
              </div>
            </div>
            {slackAllowed ? (
              hasSlack ? (
                <span className="rounded-full bg-rs-up-bg px-2 py-0.5 text-xs font-medium text-rs-up">Enabled</span>
              ) : (
                <RsButton variant="secondary" onClick={enableSlack} disabled={saving} className="h-8 px-3 text-xs">
                  Add Slack
                </RsButton>
              )
            ) : (
              <button onClick={() => useAppStore.getState().openUpgrade()} className="text-xs font-medium text-rs-brand hover:underline">
                Unlock Slack
              </button>
            )}
          </div>
        </div>

        <div className="rounded-[10px] border border-rs-border-subtle bg-rs-base p-4 opacity-75">
          <div className="flex gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rs-elevated border border-rs-border-subtle">
              <ShieldAlert size={16} className="text-rs-text-tertiary" />
            </span>
            <div>
              <div className="text-sm font-medium text-rs-text">PagerDuty</div>
              <div className="text-xs text-rs-text-tertiary">Trigger incidents in PagerDuty — Standard and above. Add in Settings.</div>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-[10px] border border-rs-down/25 bg-rs-down-bg px-4 py-3 text-[13px] text-rs-down">
            {error}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-rs-border-subtle pt-5">
        <p className="text-xs text-rs-text-tertiary">
          Alerts are per-dependency and deduped (60s). In-dashboard alerts always appear — external channels are additive.
        </p>
        <RsButton onClick={onNext}>Continue</RsButton>
      </div>
    </div>
  );
}
