'use client';

/**
 * Developer settings.
 *
 * The one place in the console that answers "how do I use this from a terminal
 * or from code". It is deliberately small: three things a developer needs to
 * leave the browser (a CLI that works, a key that works, webhooks that work),
 * and a link to the documentation rather than a second copy of it.
 *
 * Two rules it inherits from the rest of the console:
 *
 * - Nothing is shown that does not exist. There is no SDK, so no SDK section;
 *    webhook secrets are generated here and shown exactly once, because the
 *    backend stores only a hash and a console that "showed" them later would be
 *    lying.
 * - The commands printed are the ones the CLI implements, and the test suite
 *    checks that (`docs-cli-surface.test.ts` reads the CLI's own command table
 *    against the documentation, and these strings are asserted against it too).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '@/lib/dashboard/api';
import { useSessionReady } from '@/lib/dashboard/queries';
import { DOCS_ROUTES } from '@/lib/routes';
import { Empty, Fact, PageHead, Section, RowsSkeleton } from '@/components/console/primitives';

/* ── Small pieces used only here ────────────────────────────────────────── */

/** A command line with a copy control. Copying is the whole interaction. */
function Command({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused (insecure context, denied permission).
      // Selecting the text is the fallback and it needs no message.
      toast.error('Copy was blocked by the browser; select the text instead.');
    }
  };
  return (
    <div className="flex items-start justify-between gap-4 border-b border-rs-border-subtle py-2.5 last:border-b-0">
      <code className="min-w-0 break-all font-[family-name:var(--ob-font-mono)] text-[12.5px] text-rs-text">
        {children}
      </code>
      <button type="button" className="rs-button rs-button-sm shrink-0" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** A generated signing secret, shown once with a copy control. */
function RevealedSecret({ value }: { value: string }) {
  return (
    <div className="mt-3 border border-rs-border-subtle bg-rs-hover p-4">
      <p className="rs-label">Signing secret - shown once</p>
      <p className="rs-body mt-2 max-w-[70ch] text-[12px]">
        The backend stores only a hash of this value, so it cannot be shown again.
        Put it in the consumer now; it is what verifies{' '}
        <code className="font-[family-name:var(--ob-font-mono)]">X-Reliastra-Signature</code>.
      </p>
      <div className="mt-3">
        <Command>{value}</Command>
      </div>
    </div>
  );
}

const WEBHOOK_EVENTS = [
  'incident.opened',
  'incident.updated',
  'incident.resolved',
  'evidence.ready',
];

const SCOPES = [
  ['read:checks', 'Read observations'],
  ['write:dependencies', 'Create, update and delete dependencies'],
  ['read:incidents', 'Read incidents and correlations'],
  ['read:evidence', 'Read evidence records and download artifacts'],
];

/** A random secret the customer holds, base64url so it survives a shell. */
function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/* ── API keys ───────────────────────────────────────────────────────────── */

function ApiKeys() {
  const ready = useSessionReady();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read:checks', 'read:incidents', 'read:evidence']);
  const [created, setCreated] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: ['developer', 'api-keys'],
    queryFn: api.apiKeys,
    enabled: ready,
  });

  const create = useMutation({
    mutationFn: () => api.createApiKey({ name: name.trim(), scopes }),
    onSuccess: (key) => {
      setCreated(key.full_key);
      setName('');
      qc.invalidateQueries({ queryKey: ['developer', 'api-keys'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Could not issue the key'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.deleteApiKey(id),
    onSuccess: () => {
      toast.success('Key revoked');
      qc.invalidateQueries({ queryKey: ['developer', 'api-keys'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Could not revoke the key'),
  });

  return (
    <Section
      id="api-keys"
      title="API keys"
      hint="Scoped, revocable, and independent of your session. Use one for CI and for any service that reads RELIASTRA."
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <span className="rs-label">Name</span>
            <input
              className="rs-input"
              value={name}
              placeholder="ci-deploy"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="rs-button rs-button-primary"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Issuing…' : 'Issue key'}
          </button>
        </div>

        <fieldset className="grid gap-2">
          <legend className="rs-label mb-1">Scopes</legend>
          {SCOPES.map(([scope, description]) => (
            <label key={scope} className="flex items-start gap-3 text-[12.5px] text-rs-text-secondary">
              <input
                type="checkbox"
                className="mt-1"
                checked={scopes.includes(scope)}
                onChange={(e) =>
                  setScopes((current) =>
                    e.target.checked
                      ? [...current, scope]
                      : current.filter((s) => s !== scope)
                  )
                }
              />
              <span>
                <code className="font-[family-name:var(--ob-font-mono)] text-[12px]">{scope}</code>
                <span className="block text-rs-text-tertiary">{description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {created && (
          <div className="border border-rs-border-subtle bg-rs-hover p-4">
            <p className="rs-label">Key - shown once</p>
            <p className="rs-body mt-2 max-w-[70ch] text-[12px]">
              Only a hash is stored. Put it in a secret store and expose it as{' '}
              <code className="font-[family-name:var(--ob-font-mono)]">RELIASTRA_TOKEN</code>.
            </p>
            <div className="mt-3">
              <Command>{created}</Command>
            </div>
          </div>
        )}

        {keys.isPending && ready ? (
          <RowsSkeleton rows={3} cols={4} />
        ) : keys.data?.length ? (
          <table className="rs-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Scopes</th>
                <th>Last used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.data.map((key) => (
                <tr key={key.id}>
                  <td className="text-rs-text">{key.name}</td>
                  <td className="font-[family-name:var(--ob-font-mono)] text-[12px]">
                    {key.prefix}…
                  </td>
                  <td className="text-[12px] text-rs-text-tertiary">{key.scopes.join(', ')}</td>
                  <td className="text-[12px] text-rs-text-tertiary">
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'never'}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="rs-button rs-button-sm"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(key.id)}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !keys.isPending && (
            <Empty
              title="No API keys"
              body="Issue one above and the CLI, a script or another service can read this account without your session."
            />
          )
        )}
      </div>
    </Section>
  );
}

/* ── Webhooks ───────────────────────────────────────────────────────────── */

function Webhooks() {
  const ready = useSessionReady();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['incident.opened', 'incident.resolved']);
  const [secret, setSecret] = useState<string | null>(null);

  const hooks = useQuery({
    queryKey: ['developer', 'webhooks'],
    queryFn: api.webhooks,
    enabled: ready,
  });

  const create = useMutation({
    mutationFn: () => {
      // Generate the secret here so the customer holds it from the first
      // moment. The create response masks it, which is correct - a secret the
      // console can read back later is a secret that leaked.
      const generated = generateSecret();
      return api
        .createWebhook({ name: name.trim(), url: url.trim(), events, secret: generated })
        .then((hook) => ({ hook, generated }));
    },
    onSuccess: ({ generated }) => {
      setSecret(generated);
      setName('');
      setUrl('');
      qc.invalidateQueries({ queryKey: ['developer', 'webhooks'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Could not create the subscription'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteWebhook(id),
    onSuccess: () => {
      toast.success('Subscription removed');
      qc.invalidateQueries({ queryKey: ['developer', 'webhooks'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Could not remove it'),
  });

  const test = useMutation({
    mutationFn: (id: string) => api.testWebhook(id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Consumer answered ${result.status_code} in ${Math.round(result.latency_ms)} ms`);
      } else {
        toast.error(
          result.status_code
            ? `Consumer answered ${result.status_code}`
            : 'Could not reach the consumer'
        );
      }
    },
    onError: (error: Error) => toast.error(error.message || 'Test delivery failed'),
  });

  return (
    <Section
      id="webhooks"
      title="Webhooks"
      hint="Push incidents and evidence into your own systems instead of polling. Signed with HMAC-SHA256 and retried on a fixed backoff."
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[180px] flex-col gap-1.5">
            <span className="rs-label">Name</span>
            <input
              className="rs-input"
              value={name}
              placeholder="ops-pager"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex min-w-[280px] flex-1 flex-col gap-1.5">
            <span className="rs-label">Endpoint URL</span>
            <input
              className="rs-input"
              value={url}
              placeholder="https://ops.example.com/hooks/reliastra"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="rs-button rs-button-primary"
            disabled={!name.trim() || !url.trim() || !events.length || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Adding…' : 'Add subscription'}
          </button>
        </div>

        <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
          <legend className="rs-label mb-1">Events</legend>
          {WEBHOOK_EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-2 text-[12.5px] text-rs-text-secondary">
              <input
                type="checkbox"
                checked={events.includes(event)}
                onChange={(e) =>
                  setEvents((current) =>
                    e.target.checked ? [...current, event] : current.filter((x) => x !== event)
                  )
                }
              />
              <code className="font-[family-name:var(--ob-font-mono)] text-[12px]">{event}</code>
            </label>
          ))}
        </fieldset>

        {secret && <RevealedSecret value={secret} />}

        {hooks.isPending && ready ? (
          <RowsSkeleton rows={3} cols={4} />
        ) : hooks.data?.length ? (
          <table className="rs-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Endpoint</th>
                <th>Events</th>
                <th>Last delivery</th>
                <th>Failures</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hooks.data.map((hook) => (
                <tr key={hook.id}>
                  <td className="text-rs-text">{hook.name}</td>
                  <td className="font-[family-name:var(--ob-font-mono)] text-[12px]">
                    {hook.url_masked}
                  </td>
                  <td className="text-[12px] text-rs-text-tertiary">{hook.events.join(', ')}</td>
                  <td className="text-[12px] text-rs-text-tertiary">
                    {hook.last_delivery_at
                      ? new Date(hook.last_delivery_at).toLocaleString()
                      : 'none yet'}
                  </td>
                  <td className="text-[12px] text-rs-text-tertiary">{hook.failure_count}</td>
                  <td className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rs-button rs-button-sm"
                      disabled={test.isPending}
                      onClick={() => test.mutate(hook.id)}
                    >
                      Send test
                    </button>
                    <button
                      type="button"
                      className="rs-button rs-button-sm"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(hook.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !hooks.isPending && (
            <Empty
              title="No subscriptions"
              body="Add an endpoint above and incidents, resolutions and evidence artifacts are delivered to it as they happen."
            />
          )
        )}
      </div>
    </Section>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export function DeveloperSettingsPage() {
  return (
    <>
      <PageHead title="Developer"
        meta={
          <>
            <Fact label="CLI" value="github.com/ReliaAstra/Reliastra/cli" mono={false} />
            <Fact label="API" value="https://api.reliastra.com/v1" />
            <Fact label="Webhooks" value="HMAC-SHA256" mono={false} />
          </>
        }
      />

      <Section
        id="cli"
        title="From the terminal"
        hint="One binary, no dependencies. Every command answers --help and every record has a page in this console."
        action={
          <Link className="rs-button rs-button-sm" href={DOCS_ROUTES.quickstart}>
            Quickstart
          </Link>
        }
      >
        <Command>go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest</Command>
        <Command>reliastra login --email you@example.com</Command>
        <Command>reliastra deps list</Command>
        <Command>reliastra incidents list --status open --web</Command>
        <Command>reliastra incidents show &lt;incident-id&gt; --evidence</Command>
        <Command>reliastra evidence get &lt;report-id&gt; --out incident.pdf</Command>
        <Command>reliastra verify &lt;verification-id&gt; --file incident.pdf</Command>
        <p className="rs-body mt-4 max-w-[80ch] text-[12px] text-rs-text-tertiary">
          The CLI is a Go module in the repository under <code>cli/</code>; the Go module
          proxy serves it straight from there, so the install above needs no registry account. Verification exits 4 when a document
          does not match its record, so it works as a pipeline gate with no wrapper.{' '}
          <Link className="underline decoration-rs-border" href={DOCS_ROUTES.cli}>
            CLI reference
          </Link>
          {' · '}
          <Link className="underline decoration-rs-border" href={DOCS_ROUTES.api}>
            REST API
          </Link>
          {' · '}
          <Link className="underline decoration-rs-border" href={DOCS_ROUTES.webhooks}>
            Webhooks
          </Link>
        </p>
      </Section>

      <ApiKeys />
      <Webhooks />

      <Section id="reach" title="What each credential reaches">
        <dl>
          <Fact label="Session" value="Console, keys, webhooks, account" mono={false} />
          <Fact label="API key" value="Dependencies, observations, incidents, evidence - by scope" mono={false} />
          <Fact label="Public" value="Verification records and the observatory - no credential" mono={false} />
        </dl>
        <p className="rs-body mt-4 max-w-[80ch] text-[12px] text-rs-text-tertiary">
          Keys are denied by default: they cannot read accounts, manage keys or configure
          webhooks, so a leaked key cannot redirect your events or mint a new credential.
        </p>
      </Section>
    </>
  );
}
