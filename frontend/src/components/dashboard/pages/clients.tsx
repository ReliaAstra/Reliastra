'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  Lock,
  Plus,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { effectivePlan } from '@/lib/dashboard/plans';
import { api } from '@/lib/dashboard/api';
import { formatLatency, formatUptime, timeAgo } from '@/lib/dashboard/format';
import { usePortfolio } from '@/lib/dashboard/queries';
import type { PortfolioClient } from '@/lib/dashboard/types';
import { RsButton } from '@/components/dashboard/ui/button';
import { EmptyState } from '@/components/dashboard/ui/empty-state';
import { SectionHeader } from '@/components/dashboard/ui/section-header';
import { TableSkeleton } from '@/components/dashboard/ui/skeleton';
import { StatusBadge } from '@/components/dashboard/ui/status-badge';
import { cn } from '@/lib/utils';

// ── Plan gate — Client workspaces are exclusive to Enterprise ──────────────

function AgencyGate() {
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-rs-border-subtle bg-rs-elevated">
      {/* Blurred live-looking preview behind the paywall */}
      <div className="pointer-events-none select-none p-6 opacity-60 blur-[6px] sm:p-8" aria-hidden>
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[12, 84, 99.97, 2].map((v, i) => (
            <div key={i} className="rounded-xl border border-rs-border-subtle bg-rs-base p-5">
              <div className="mb-3 text-xs uppercase tracking-wide text-rs-text-tertiary">Client SLA</div>
              <div className="font-mono text-3xl font-bold">{v}</div>
            </div>
          ))}
        </div>
        {['Northwind Retail', 'Acme Logistics', 'Helios Health'].map((n) => (
          <div
            key={n}
            className="mb-2 flex items-center justify-between rounded-lg border border-rs-border-subtle bg-rs-base px-4 py-3"
          >
            <span className="text-sm font-medium">{n}</span>
            <span className="font-mono text-sm">99.9{Math.floor(Math.random() * 9)}%</span>
          </div>
        ))}
      </div>

      {/* Paywall overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-rs-elevated via-rs-elevated/85 to-transparent p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rs-brand-subtle">
            <Lock size={24} className="text-rs-brand" />
          </div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-rs-text sm:text-2xl">
            The Client SLA Portal
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-rs-text-secondary">
            One link, every client: a white-label report your customers can open any time —
            uptime, latency and incident posture for their services, signed and generated
            fresh on every visit.
          </p>
          <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm text-rs-text-secondary">
            {[
              'Unlimited client workspaces',
              'Per-client uptime & incident rollups',
              'Shareable white-label report link',
              'Print-ready for QBRs and reviews',
            ].map((f) => (
              <li key={f} className="flex items-center gap-2.5">
                <Check size={15} className="shrink-0 text-rs-up" />
                {f}
              </li>
            ))}
          </ul>
          <RsButton onClick={() => openUpgrade('clients')} className="mt-6 px-5 py-2.5">
            <Sparkles size={16} />
            Contact Sales
          </RsButton>
        </div>
      </div>
    </div>
  );
}

// ── Create client workspace ────────────────────────────────────────────────

function CreateClientPanel({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () => api.createClient({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['agency', 'clients'] });
      queryClient.invalidateQueries({ queryKey: ['agency', 'portfolio'] });
      toast.success(`Client "${created.name}" created`, {
        description: 'Assign dependencies to this client from each dependency\'s settings.',
      });
      onDone();
    },
    onError: (err: Error) => toast.error(err.message || 'Could not create client'),
  });

  const field =
    'flex h-9 w-full rounded-[10px] border border-rs-border-subtle bg-rs-input px-3 text-sm text-rs-text placeholder:text-rs-text-tertiary outline-none transition-[border-color] duration-150 focus:border-rs-brand focus:ring-[3px] focus:ring-[rgb(37_99_235_/_0.20)]';

  return (
    <div className="mb-6 rounded-xl border border-rs-brand/30 bg-rs-brand-subtle p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-rs-text">New client workspace</h3>
        <button type="button" aria-label="Cancel" onClick={onCancel} className="rounded-md p-1.5 text-rs-text-tertiary hover:bg-rs-hover hover:text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus">
          <X size={16} />
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-rs-text-secondary">
        Each client is an isolated workspace: dependencies assigned to it roll up into its own SLA
        posture here and on the public portal.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          className={field}
          placeholder="Client name (e.g. Acme Logistics)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={150}
        />
        <input
          className={field}
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
        />
      </div>
      <RsButton
        className="mt-4"
        disabled={!name.trim() || create.isPending}
        onClick={() => create.mutate()}
      >
        {create.isPending ? 'Creating…' : 'Create client'}
      </RsButton>
    </div>
  );
}

// ── Client row pieces ────────────────────────────────────────────────────────

function UptimeBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 99.9 ? 'bg-rs-up' : pct >= 99 ? 'bg-rs-degraded' : 'bg-rs-down';
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-16 text-right font-mono text-sm text-rs-text">{formatUptime(pct)}</span>
      <div className="hidden h-1 w-20 overflow-hidden rounded-full bg-rs-hover xl:block">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function statusBadge(status: PortfolioClient['status']) {
  if (status === 'critical') return <StatusBadge status="down" />;
  if (status === 'degraded') return <StatusBadge status="degraded" />;
  return <StatusBadge status="operational" />;
}

function ShareButton({ token, name }: { token: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/portal/${token}`
      : `/portal/${token}`;
  return (
    <RsButton
      variant="ghost"
      className="px-2 py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          toast.success(`${name} report link copied`);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error('Could not copy link');
        }
      }}
      title={`Copy client-facing report link for ${name}`}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Report link'}
    </RsButton>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function ClientsPage() {
  const plan = useAppStore((s) => s.plan);
  const current = effectivePlan(plan);
  const enabled = current.id === 'enterprise';
  const { data, isLoading, error, refetch } = usePortfolio(enabled);
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const shareToken = data?.share_token ?? '';
  const totals = data?.totals;

  if (!enabled) return <AgencyGate />;

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">Clients</h1>
          <p className="mt-1.5 max-w-xl text-sm text-rs-text-tertiary">
            Every customer's SLA posture in one place. Share the portal link with each
            client — it always shows live, signed data.
          </p>
        </div>
        {shareToken && (
          <RsButton
            variant="secondary"
            onClick={() => router.push(`/portal/${shareToken}`)}
            className="shrink-0"
          >
            <ExternalLink size={16} />
            Open client portal
          </RsButton>
        )}
      </div>

      {error ? (
        <EmptyState
          icon={<Users size={32} />}
          title="Could not load the portfolio"
          body="The API returned an error. Retry in a moment — or contact support if this persists."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : isLoading || !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          {creating && <CreateClientPanel onDone={() => setCreating(false)} onCancel={() => setCreating(false)} />}

          {/* Totals strip */}
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Clients', value: String(totals?.clients ?? 0), accent: 'text-rs-text' },
              {
                label: 'Monitors',
                value: String(totals?.dependencies ?? 0),
                sub: data.unassigned_monitors > 0 ? `${data.unassigned_monitors} unassigned` : undefined,
                accent: 'text-rs-text',
              },
              {
                label: 'Avg uptime 24h',
                value: formatUptime(totals?.avg_uptime_24h ?? 100),
                accent:
                  (totals?.avg_uptime_24h ?? 100) >= 99.9
                    ? 'text-rs-up'
                    : (totals?.avg_uptime_24h ?? 100) >= 99
                      ? 'text-rs-degraded'
                      : 'text-rs-down',
              },
              {
                label: 'Needs attention',
                value: String(totals?.clients_needing_attention ?? 0),
                accent:
                  (totals?.clients_needing_attention ?? 0) > 0
                    ? 'text-rs-degraded'
                    : 'text-rs-text',
              },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5"
              >
                <div className="mb-2 text-xs font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
                  {c.label}
                </div>
                <div className={cn('font-mono text-[28px] font-bold leading-none tracking-[-0.02em]', c.accent)}>
                  {c.value}
                </div>
                {c.sub && <div className="mt-1.5 text-xs text-rs-degraded">{c.sub}</div>}
              </div>
            ))}
          </div>

          {/* Portfolio table / mobile cards */}
          {!data.clients.length ? (
            <EmptyState
              icon={<Building2 size={32} />}
              title="No clients yet"
              body="Create your first client workspace, then assign dependencies to it. Each client gets its own rollup on this page and on the public portal."
              actionLabel={creating ? undefined : 'Add a client'}
              onAction={creating ? undefined : () => setCreating(true)}
              helpLabel="How do client workspaces work?"
              onHelp={() => window.open('https://docs.reliastra.com/clients', '_blank')}
            />
          ) : (
            <>
              {!creating && (
                <div className="mb-4 flex justify-end">
                  <RsButton variant="secondary" onClick={() => setCreating(true)}>
                    <Plus size={15} />
                    New client
                  </RsButton>
                </div>
              )}
              <SectionHeader
                title="Client SLA posture"
                subtitle="24-hour rollups across every monitor assigned to each client."
              />

              {/* Desktop table */}
              <div className="mt-4 hidden overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated lg:block">
                <table className="w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="h-11 border-b border-rs-border-subtle">
                      {['Client', 'Status', 'Uptime 24h', 'Monitors', 'Latency', 'Open incidents', 'Last incident', ''].map(
                        (h, i) => (
                          <th
                            key={h + i}
                            className={cn(
                              'px-4 text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary',
                              i > 1 && 'text-right'
                            )}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.clients.map((c) => (
                      <tr key={c.id} className="h-16 transition-colors duration-150 hover:bg-rs-hover">
                        <td className="px-4">
                          <div className="text-sm font-medium text-rs-text">{c.name}</div>
                          <div className="mt-0.5 text-xs text-rs-text-tertiary">
                            {c.application_count} application{c.application_count === 1 ? '' : 's'}
                            {c.description ? ` · ${c.description}` : ''}
                          </div>
                        </td>
                        <td className="px-4">{statusBadge(c.status)}</td>
                        <td className="px-4"><UptimeBar value={c.uptime_24h} /></td>
                        <td className="px-4 text-right font-mono text-sm text-rs-text">
                          {c.dependency_count}
                        </td>
                        <td className="px-4 text-right font-mono text-sm text-rs-text">
                          {formatLatency(c.avg_latency_ms)}
                          <span className="ml-0.5 text-xs text-rs-text-tertiary">ms</span>
                        </td>
                        <td className="px-4 text-right font-mono text-sm">
                          {c.open_incidents > 0 ? (
                            <span className={c.critical_incidents > 0 ? 'text-rs-down' : 'text-rs-degraded'}>
                              {c.open_incidents}
                              {c.critical_incidents > 0 && ` (${c.critical_incidents} critical)`}
                            </span>
                          ) : (
                            <span className="text-rs-text-tertiary">0</span>
                          )}
                        </td>
                        <td className="px-4 text-right text-xs text-rs-text-tertiary">
                          {c.last_incident_at ? timeAgo(c.last_incident_at) : 'Never'}
                        </td>
                        <td className="px-4 text-right">
                          <ShareButton token={shareToken} name={c.name} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="mt-4 space-y-3 lg:hidden">
                {data.clients.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-rs-text">{c.name}</div>
                        <div className="mt-0.5 text-xs text-rs-text-tertiary">
                          {c.dependency_count} monitors · {c.application_count} apps
                        </div>
                      </div>
                      {statusBadge(c.status)}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-rs-text-tertiary">Uptime</div>
                        <UptimeBar value={c.uptime_24h} />
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-rs-text-tertiary">Latency</div>
                        <div className="font-mono text-sm text-rs-text">
                          {formatLatency(c.avg_latency_ms)} ms
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-rs-text-tertiary">Open</div>
                        <div
                          className={cn(
                            'font-mono text-sm',
                            c.open_incidents > 0 ? 'text-rs-degraded' : 'text-rs-text'
                          )}
                        >
                          {c.open_incidents}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-rs-border-subtle pt-3">
                      <span className="text-xs text-rs-text-tertiary">
                        Last incident: {c.last_incident_at ? timeAgo(c.last_incident_at) : 'never'}
                      </span>
                      <ShareButton token={shareToken} name={c.name} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {data.unassigned_monitors > 0 && (
            <p className="mt-4 text-xs text-rs-text-tertiary">
              {data.unassigned_monitors} monitor
              {data.unassigned_monitors === 1 ? ' is' : 's are'} not assigned to any client yet —
              assign them from each dependency's settings so they count toward client SLAs.
            </p>
          )}
        </>
      )}
    </div>
  );
}
