'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/dashboard/api';
import { keys, useAlertConfigs } from '@/lib/dashboard/queries';
import type { AlertConfig } from '@/lib/dashboard/types';
import { PageHead, Section, Failure, RowsSkeleton } from '@/components/console/primitives';

const EVENTS = [
  ['incident.detected', 'Incident detected'],
  ['incident.resolved', 'Incident resolved'],
] as const;

export function NotificationsPage() {
  const channels = useAlertConfigs();
  return (
    <>
      <PageHead title="Notifications" description="Choose where RELIASTRA sends incident alerts." />
      {channels.isLoading ? (
        <RowsSkeleton rows={3} cols={2} />
      ) : channels.isError ? (
        <Failure title="Channels unavailable" body="Unable to load notification settings." onRetry={() => void channels.refetch()} />
      ) : (
        <>
          <Section title="Email">
            <ChannelGroup type="email" channels={channels.data?.filter((c) => c.channel_type === 'email') ?? []} />
          </Section>
          <Section title="Slack">
            <ChannelGroup type="slack" channels={channels.data?.filter((c) => c.channel_type === 'slack') ?? []} />
          </Section>
        </>
      )}
    </>
  );
}

function ChannelGroup({ type, channels }: { type: 'email' | 'slack'; channels: AlertConfig[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3">
      {channels.map((channel) => (
        <Channel key={channel.id} channel={channel} />
      ))}
      {!channels.length && !adding && (
        <p className="text-[13px] text-rs-text-tertiary">{type === 'email' ? 'No email destinations' : 'Slack not configured'}</p>
      )}
      {adding ? (
        <ChannelForm type={type} onClose={() => setAdding(false)} />
      ) : (
        <button className="rs-button rs-button-secondary rs-button-sm" onClick={() => setAdding(true)}>
          {type === 'email' ? 'Add email' : 'Connect Slack'}
        </button>
      )}
    </div>
  );
}

function ChannelForm({ type, channel, onClose }: { type: 'email' | 'slack'; channel?: AlertConfig; onClose: () => void }) {
  const client = useQueryClient();
  const [destination, setDestination] = useState(type === 'email' ? channel?.destination ?? '' : '');
  const [label, setLabel] = useState(type === 'slack' ? channel?.destination ?? '' : '');
  const save = useMutation({
    mutationFn: async () => {
      const config =
        type === 'email' ? { email: destination.trim() } : { label: label.trim(), ...(destination.trim() ? { webhook_url: destination.trim() } : {}) };
      return channel ? api.updateAlertConfig(channel.id, { config }) : api.createAlertConfig({ channel_type: type, config, is_active: true });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.alerts });
      onClose();
    },
  });
  const id = channel?.id ?? `new-${type}`;
  return (
    <form className="rs-card max-w-2xl space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      {type === 'slack' && (
        <div>
          <label htmlFor={`${id}-label`} className="rs-label mb-1.5 block">
            Destination label
          </label>
          <input id={`${id}-label`} className="rs-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="#incidents" maxLength={100} required />
        </div>
      )}
      <div>
        <label className="rs-label mb-1.5 block" htmlFor={`${id}-destination`}>
          {type === 'email' ? 'Email address' : 'Slack incoming webhook'}
        </label>
        <input
          id={`${id}-destination`}
          className="rs-input"
          type={type === 'email' ? 'email' : 'password'}
          autoComplete={type === 'email' ? 'email' : 'new-password'}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          required={type === 'email' || !channel}
          placeholder={type === 'slack' && channel ? 'Leave empty to keep the existing connection' : undefined}
        />
        {type === 'slack' && (
          <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[12px] text-rs-brand hover:underline">
            Create an incoming webhook ↗
          </a>
        )}
      </div>
      {save.error && (
        <p role="alert" className="text-[13px] text-rs-down">
          {save.error.message}
        </p>
      )}
      <div className="flex gap-3">
        <button className="rs-button rs-button-primary rs-button-sm" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save channel'}
        </button>
        <button type="button" className="rs-button rs-button-secondary rs-button-sm" onClick={onClose} disabled={save.isPending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Channel({ channel }: { channel: AlertConfig }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pendingValues, setPendingValues] = useState<{ active?: boolean; events?: Record<string, boolean> } | null>(null);
  const action = useMutation({
    mutationFn: async (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.alerts });
      setPendingValues(null);
    },
    onError: () => setPendingValues(null),
  });
  const perform = (operation: () => Promise<unknown>) => {
    setMessage(null);
    action.mutate(operation);
  };
  const status = !channel.is_active
    ? 'Disabled'
    : channel.verification_required
      ? 'Verification required'
      : channel.connection_status === 'verified'
        ? 'Verified'
        : channel.connection_status === 'connected'
          ? 'Connected'
          : channel.last_test_success === false
            ? 'Delivery failed'
            : 'Configured · not tested';
  if (editing) return <ChannelForm type={channel.channel_type as 'email' | 'slack'} channel={channel} onClose={() => setEditing(false)} />;
  return (
    <article className="rs-card p-5" aria-label={`${channel.channel_type} ${channel.destination ?? 'channel'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="break-all text-[15px] font-medium text-rs-text">{channel.destination ?? 'Slack webhook'}</h3>
          <p className="rs-label mt-2">{status}</p>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-[12px] text-rs-text-secondary">
          <input
            type="checkbox"
            checked={pendingValues?.active ?? channel.is_active}
            disabled={action.isPending}
            onChange={(e) => {
              const active = e.target.checked;
              setPendingValues({ active });
              perform(() => api.updateAlertConfig(channel.id, { is_active: active }));
            }}
            className="h-4 w-4 accent-[var(--rs-brand)]"
          />
          Enabled
        </label>
      </div>
      {channel.verification_required && (
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); perform(() => api.verifyAlertConfig(channel.id, code)); }}>
          <div>
            <label className="rs-label mb-1.5 block" htmlFor={`${channel.id}-code`}>
              Email verification code
            </label>
            <input className="rs-input max-w-48" id={`${channel.id}-code`} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
          </div>
          <button className="rs-button rs-button-secondary rs-button-sm" disabled={action.isPending}>
            Verify
          </button>
          <button type="button" className="rs-button rs-button-secondary rs-button-sm" disabled={action.isPending} onClick={() => perform(() => api.resendAlertVerification(channel.id))}>
            Resend code
          </button>
        </form>
      )}
      <fieldset className="mt-5 grid gap-3 border-t border-rs-border-subtle pt-4 sm:grid-cols-2" disabled={action.isPending}>
        <legend className="sr-only">Notification events</legend>
        {EVENTS.map(([key, label]) => (
          <label key={key} className="flex min-h-10 items-center justify-between gap-4 text-[13px] text-rs-text sm:pr-5">
            <span>{label}</span>
            <input
              type="checkbox"
              checked={(pendingValues?.events ?? channel.events)[key] ?? true}
              onChange={(e) => {
                const events = { ...channel.events, [key]: e.target.checked };
                setPendingValues({ events });
                perform(() => api.updateAlertConfig(channel.id, { config: { events } }));
              }}
              className="h-4 w-4 accent-[var(--rs-brand)]"
            />
          </label>
        ))}
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="rs-button rs-button-secondary rs-button-sm" disabled={action.isPending} onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          className="rs-button rs-button-secondary rs-button-sm"
          disabled={action.isPending || channel.verification_required}
          onClick={() =>
            perform(async () => {
              const result = await api.testAlertConfig(channel.id);
              if (!result.success) throw new Error('Test notification failed. Check the destination and retry.');
              setMessage('Test notification sent');
            })
          }
        >
          Send test
        </button>
        <button className="rs-button rs-button-secondary rs-button-sm" disabled={action.isPending} onClick={() => setRemoving(true)}>
          {channel.channel_type === 'slack' ? 'Disconnect' : 'Remove'}
        </button>
      </div>
      {removing && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rs-border-subtle pt-4">
          <p className="text-[13px] text-rs-text">Remove this channel?</p>
          <button className="rs-button rs-button-secondary rs-button-sm" disabled={action.isPending} onClick={() => perform(() => api.deleteAlertConfig(channel.id))}>
            Confirm removal
          </button>
          <button className="rs-button rs-button-secondary rs-button-sm" disabled={action.isPending} onClick={() => setRemoving(false)}>
            Keep channel
          </button>
        </div>
      )}
      {action.error && (
        <p role="alert" className="mt-3 text-[13px] text-rs-down">
          {action.error.message}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-[13px] text-rs-text">
          {message}
        </p>
      )}
    </article>
  );
}
