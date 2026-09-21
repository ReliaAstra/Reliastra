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
    <div className="group flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-rs-hover/50">
      <code className="min-w-0 flex-1 break-all font-[family-name:var(--ob-font-mono)] text-[13px] leading-[1.5] text-rs-text">
        <span aria-hidden className="mr-2 select-none text-rs-text-tertiary">
          $
        </span>
        {children}
      </code>
      <button
        type="button"
        className="rs-button rs-button-secondary rs-button-sm shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
        onClick={copy}
        aria-label={copied ? 'Copied to clipboard' : `Copy ${children.slice(0, 32)}`}
      >
        {copied ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>✓</span> Copied
          </span>
        ) : (
          'Copy'
        )}
      </button>
    </div>
  );
}

/** A generated signing secret, shown once with a copy control. */
function RevealedSecret({ value }: { value: string }) {
  return (
    <div className="mx-5 mb-5 rounded-[10px] border border-rs-brand/20 bg-rs-brand-subtle/50 p-4">
      <p className="rs-label text-rs-brand">Signing secret — shown once</p>
      <p className="mt-2 max-w-[70ch] text-[12.5px] leading-[1.6] text-rs-text-secondary">
        The backend stores only a hash of this value, so it cannot be shown again. Put it in the
        consumer now; it is what verifies{' '}
        <code className="rounded bg-rs-elevated px-1.5 py-0.5 font-[family-name:var(--ob-font-mono)] text-[11px] text-rs-text">
          X-Reliastra-Signature
        </code>
        .
      </p>
      <div className="mt-3 overflow-hidden rounded-[10px] border border-rs-border-subtle bg-rs-elevated">
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
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="rs-label">Name</span>
            <input
              className="rs-input"
              value={name}
              placeholder="ci-deploy"
              onChange={(e) => setName(e.target.value)}
              aria-label="API key name"
            />
            <span className="text-[11px] text-rs-text-tertiary">
              A label for your records — not sent to the API.
            </span>
          </label>
          <button
            type="button"
            className="rs-button rs-button-primary rs-button-md shrink-0 sm:self-start sm:mt-[22px]"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Issuing…' : 'Issue key'}
          </button>
        </div>

        <fieldset className="mt-6">
          <legend className="rs-label">Scopes</legend>
          <p className="mt-1 text-[12px] text-rs-text-tertiary">
            Least privilege by default — select only what this key needs.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {SCOPES.map(([scope, description]) => {
              const checked = scopes.includes(scope);
              return (
                <label
                  key={scope}
                  className={`flex cursor-pointer items-start gap-3 rounded-[10px] border p-3 transition-colors ${
                    checked
                      ? 'border-rs-brand/25 bg-rs-brand-subtle'
                      : 'border-rs-border-subtle bg-rs-elevated hover:bg-rs-hover'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--rs-brand)]"
                    checked={checked}
                    onChange={(e) =>
                      setScopes((current) =>
                        e.target.checked
                          ? [...current, scope]
                          : current.filter((s) => s !== scope)
                      )
                    }
                  />
                  <span className="min-w-0">
                    <code className="block font-[family-name:var(--ob-font-mono)] text-[12px] font-medium text-rs-text">
                      {scope}
                    </code>
                    <span className="mt-0.5 block text-[12px] leading-[1.5] text-rs-text-tertiary">
                      {description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {created && (
          <div className="mt-6 overflow-hidden rounded-[10px] border border-rs-brand/20 bg-rs-brand-subtle/50">
            <div className="p-4">
              <p className="rs-label text-rs-brand">Key — shown once</p>
              <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-[1.6] text-rs-text-secondary">
                Only a hash is stored. Put it in a secret store and expose it as{' '}
                <code className="rounded bg-rs-elevated px-1.5 py-0.5 font-[family-name:var(--ob-font-mono)] text-[11px] text-rs-text">
                  RELIASTRA_TOKEN
                </code>
                .
              </p>
            </div>
            <div className="border-t border-rs-brand/10 bg-rs-elevated">
              <Command>{created}</Command>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-rs-border-subtle">
        {keys.isPending && ready ? (
          <div className="p-4">
            <RowsSkeleton rows={3} cols={4} />
          </div>
        ) : keys.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-rs-border-subtle bg-rs-hover/30">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                    Prefix
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                    Scopes
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                    Last used
                  </th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rs-border-subtle">
                {keys.data.map((key) => (
                  <tr key={key.id} className="transition-colors hover:bg-rs-hover/50">
                    <td className="px-5 py-3.5 text-[13px] font-medium text-rs-text">{key.name}</td>
                    <td className="px-4 py-3.5 font-[family-name:var(--ob-font-mono)] text-[12px] text-rs-text-secondary">
                      {key.prefix}…
                    </td>
                    <td className="max-w-[260px] truncate px-4 py-3.5 text-[12px] text-rs-text-tertiary">
                      {key.scopes.join(', ')}
                    </td>
                    <td className="px-4 py-3.5 text-[12px] text-rs-text-tertiary">
                      {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'never'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        className="rs-button rs-button-secondary rs-button-sm"
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
          </div>
        ) : (
          !keys.isPending && (
            <div className="px-6 py-10">
              <Empty
                title="No API keys"
                body="Issue one above and the CLI, a script or another service can read this account without your session."
              />
            </div>
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
      <div className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="rs-label">Name</span>
            <input
              className="rs-input"
              value={name}
              placeholder="ops-pager"
              onChange={(e) => setName(e.target.value)}
              aria-label="Webhook name"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="rs-label">Endpoint URL</span>
            <input
              className="rs-input"
              value={url}
              placeholder="https://ops.example.com/hooks/reliastra"
              onChange={(e) => setUrl(e.target.value)}
              aria-label="Endpoint URL"
            />
          </label>
          <button
            type="button"
            className="rs-button rs-button-primary rs-button-md shrink-0"
            disabled={!name.trim() || !url.trim() || !events.length || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Adding…' : 'Add subscription'}
          </button>
        </div>

        <fieldset className="mt-6">
          <legend className="rs-label">Events</legend>
          <p className="mt-1 text-[12px] text-rs-text-tertiary">
            Choose which state changes to deliver.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {WEBHOOK_EVENTS.map((event) => {
              const checked = events.includes(event);
              return (
                <label
                  key={event}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] transition-colors ${
                    checked
                      ? 'border-rs-brand bg-rs-brand text-white'
                      : 'border-rs-border-subtle bg-rs-elevated text-rs-text-secondary hover:bg-rs-hover hover:text-rs-text'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={(e) =>
                      setEvents((current) =>
                        e.target.checked ? [...current, event] : current.filter((x) => x !== event)
                      )
                    }
                  />
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${checked ? 'bg-white' : 'bg-rs-border'}`}
                  />
                  <code className="font-[family-name:var(--ob-font-mono)] text-[12px]">{event}</code>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      {secret && <RevealedSecret value={secret} />}

      <div className="border-t border-rs-border-subtle">
        {hooks.isPending && ready ? (
          <div className="p-4">
            <RowsSkeleton rows={3} cols={4} />
          </div>
        ) : hooks.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-rs-border-subtle bg-rs-hover/30">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                    Endpoint
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                    Events
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                    Last delivery
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                    Failures
                  </th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rs-border-subtle">
                {hooks.data.map((hook) => (
                  <tr key={hook.id} className="transition-colors hover:bg-rs-hover/50">
                    <td className="px-5 py-3.5 text-[13px] font-medium text-rs-text">{hook.name}</td>
                    <td className="max-w-[220px] truncate px-4 py-3.5 font-[family-name:var(--ob-font-mono)] text-[12px] text-rs-text-secondary">
                      {hook.url_masked}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3.5 text-[12px] text-rs-text-tertiary">
                      {hook.events.join(', ')}
                    </td>
                    <td className="px-4 py-3.5 text-[12px] text-rs-text-tertiary">
                      {hook.last_delivery_at
                        ? new Date(hook.last_delivery_at).toLocaleString()
                        : 'none yet'}
                    </td>
                    <td className="px-4 py-3.5 text-[12px]">
                      <span
                        className={`inline-flex min-w-[22px] justify-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          hook.failure_count > 0
                            ? 'bg-rs-down-bg text-rs-down'
                            : 'bg-rs-tertiary-bg text-rs-text-tertiary'
                        }`}
                      >
                        {hook.failure_count}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rs-button rs-button-secondary rs-button-sm"
                          disabled={test.isPending}
                          onClick={() => test.mutate(hook.id)}
                        >
                          Send test
                        </button>
                        <button
                          type="button"
                          className="rs-button rs-button-sm border border-rs-border-subtle bg-transparent text-rs-text-tertiary hover:bg-rs-down-bg hover:text-rs-down"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(hook.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !hooks.isPending && (
            <div className="px-6 py-10">
              <Empty
                title="No subscriptions"
                body="Add an endpoint above and incidents, resolutions and evidence artifacts are delivered to it as they happen."
              />
            </div>
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
      <PageHead
        title="Developer"
        description="Build on RELIASTRA — CLI, API keys, and webhooks for your pipelines."
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
          <Link className="rs-button rs-button-secondary rs-button-sm" href={DOCS_ROUTES.quickstart}>
            Quickstart
          </Link>
        }
      >
        <div className="divide-y divide-rs-border-subtle">
          <Command>go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest</Command>
          <Command>reliastra login --email you@example.com</Command>
          <Command>reliastra deps list</Command>
          <Command>reliastra incidents list --status open --web</Command>
          <Command>reliastra incidents show &lt;incident-id&gt; --evidence</Command>
          <Command>reliastra evidence get &lt;report-id&gt; --out incident.pdf</Command>
          <Command>reliastra verify &lt;verification-id&gt; --file incident.pdf</Command>
        </div>
        <div className="border-t border-rs-border-subtle bg-rs-hover/30 px-5 py-4 sm:px-6">
          <p className="max-w-[72ch] text-[13px] leading-[1.6] text-rs-text-secondary">
            The CLI is a Go module in the repository under{' '}
            <code className="rounded bg-rs-elevated px-1.5 py-0.5 font-[family-name:var(--ob-font-mono)] text-[12px] text-rs-text">
              cli/
            </code>{' '}
            — the Go module proxy serves it straight from there, so the install above needs no
            registry account. Verification exits <span className="rs-mono text-rs-text">4</span> when a
            document does not match its record, so it works as a pipeline gate with no wrapper.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-[12.5px]">
            <Link
              className="inline-flex items-center gap-1.5 font-medium text-rs-brand hover:text-rs-brand-hover hover:underline"
              href={DOCS_ROUTES.cli}
            >
              CLI reference <span aria-hidden>→</span>
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 font-medium text-rs-brand hover:text-rs-brand-hover hover:underline"
              href={DOCS_ROUTES.api}
            >
              REST API <span aria-hidden>→</span>
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 font-medium text-rs-brand hover:text-rs-brand-hover hover:underline"
              href={DOCS_ROUTES.webhooks}
            >
              Webhooks <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </Section>

      <ApiKeys />
      <Webhooks />

      <Section id="reach" title="What each credential reaches">
        <div className="p-5 sm:p-6">
          <dl className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: 'Session',
                value: 'Console, keys, webhooks, account',
                desc: 'Your browser — full access, expires on sign out.',
              },
              {
                label: 'API key',
                value: 'Dependencies, observations, incidents, evidence — by scope',
                desc: 'Scoped least-privilege tokens for CI and services.',
              },
              {
                label: 'Public',
                value: 'Verification records and the observatory — no credential',
                desc: 'Anyone can verify evidence without an account.',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[10px] border border-rs-border-subtle bg-rs-elevated p-4"
              >
                <dt className="rs-label">{item.label}</dt>
                <dd className="mt-2 text-[13px] font-medium leading-[1.5] text-rs-text">{item.value}</dd>
                <dd className="mt-1 text-[12px] leading-[1.5] text-rs-text-tertiary">{item.desc}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 max-w-[80ch] rounded-[10px] border border-rs-border-subtle bg-rs-hover/30 px-4 py-3 text-[12.5px] leading-[1.6] text-rs-text-secondary">
            Keys are denied by default — they cannot read accounts, manage keys, or configure
            webhooks, so a leaked key cannot redirect your events or mint a new credential.
          </p>
        </div>
      </Section>
    </>
  );
}
