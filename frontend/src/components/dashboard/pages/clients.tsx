'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Filter,
  Layers,
  Link2,
  Lock,
  Plus,
  Search,
  ShieldCheck,
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
      {/* Capability architectural diagram behind the paywall */}
      <div className="select-none p-6 opacity-60 sm:p-8" aria-hidden>
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Client Isolation', desc: 'Separate infrastructure per client' },
            { label: 'Application Mapping', desc: 'Services grouped by application' },
            { label: 'SLA Evidence', desc: 'Verifiable outage attribution' },
            { label: 'White-Label Portal', desc: 'Live signed reporting for customers' },
          ].map((c, i) => (
            <div key={i} className="rounded-xl border border-rs-border-subtle bg-rs-base p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-rs-brand">
                {c.label}
              </div>
              <div className="mt-2 text-xs text-rs-text-secondary">{c.desc}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-dashed border-rs-border-subtle bg-rs-base/40 p-6 text-center text-xs text-rs-text-tertiary">
          Multi-Client Operations Architecture: Agency → Clients → Applications → Dependencies → SLA Evidence
        </div>
      </div>

      {/* Paywall overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-rs-elevated via-rs-elevated/95 to-transparent p-6">
        <div className="max-w-lg text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rs-brand-subtle">
            <Lock size={24} className="text-rs-brand" />
          </div>
          <span className="rounded-full bg-rs-brand/10 px-3 py-1 font-mono text-xs font-semibold text-rs-brand">
            ENTERPRISE AGENCY TIER
          </span>
          <h2 className="mt-3 text-xl font-bold tracking-[-0.02em] text-rs-text sm:text-2xl">
            Multi-Client Reliability & SLA Portals
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-rs-text-secondary">
            Manage infrastructure reliability across every client from one workspace.
            Provide each customer with live, tamper-evident SLA evidence under your agency&apos;s identity.
          </p>
          <div className="mx-auto mt-6 grid max-w-md gap-2.5 text-left text-xs sm:grid-cols-2 text-rs-text-secondary">
            {[
              'Dedicated client workspaces',
              'Multi-application organization',
              'Per-client uptime & latency rollups',
              'Shareable white-label SLA portals',
              'Deterministic incident attribution',
              'Continuous multi-region quorum checks',
            ].map((f) => (
              <div key={f} className="flex items-center gap-2">
                <Check size={14} className="shrink-0 text-rs-up" />
                <span>{f}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <RsButton onClick={() => openUpgrade('clients')} className="px-5 py-2.5">
              <Sparkles size={16} />
              Upgrade to Enterprise
            </RsButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create client modal / drawer ──────────────────────────────────────────

function CreateClientModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (clientId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.createClient({
        name: name.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['agency', 'clients'] });
      queryClient.invalidateQueries({ queryKey: ['agency', 'portfolio'] });
      toast.success(`Client "${created.name}" created`, {
        description: 'You can now add applications and connect dependencies.',
      });
      setName('');
      setDescription('');
      onCreated(created.id);
    },
    onError: (err: Error) => toast.error(err.message || 'Could not create client'),
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-rs-border-subtle bg-rs-elevated p-6 shadow-rs-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-rs-border-subtle pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rs-brand-subtle text-rs-brand">
              <Building2 size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-rs-text">New Client Workspace</h3>
              <p className="text-xs text-rs-text-tertiary">
                Isolate applications and SLA rollups for this organization.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-rs-text-tertiary hover:bg-rs-hover hover:text-rs-text"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
          className="mt-5 space-y-4"
        >
          <div>
            <label className="rs-label mb-1.5 block text-xs">
              Client Company Name <span className="text-rs-brand">*</span>
            </label>
            <input
              type="text"
              required
              className="flex h-10 w-full rounded-xl border border-rs-border-subtle bg-rs-input px-3.5 text-sm text-rs-text placeholder:text-rs-text-tertiary outline-none focus:border-rs-brand focus:ring-[3px] focus:ring-[rgb(37_99_235_/_0.20)]"
              placeholder="e.g. Acme Logistics, Pinnacle Retail"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={150}
              autoFocus
            />
          </div>

          <div>
            <label className="rs-label mb-1.5 block text-xs">Description (Optional)</label>
            <textarea
              rows={3}
              className="flex w-full rounded-xl border border-rs-border-subtle bg-rs-input p-3 text-sm text-rs-text placeholder:text-rs-text-tertiary outline-none focus:border-rs-brand focus:ring-[3px] focus:ring-[rgb(37_99_235_/_0.20)]"
              placeholder="e.g. Enterprise e-commerce infrastructure and checkout API"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-rs-border-subtle pt-4">
            <RsButton variant="secondary" type="button" onClick={onClose}>
              Cancel
            </RsButton>
            <RsButton type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create client'}
            </RsButton>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Client visual components ───────────────────────────────────────────────

function UptimeBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 99.9 ? 'bg-rs-up' : pct >= 99 ? 'bg-rs-degraded' : 'bg-rs-down';
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-16 text-right font-mono text-sm text-rs-text">{formatUptime(pct)}</span>
      <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-rs-hover xl:block">
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
      className="px-2.5 py-1 text-xs"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          toast.success(`${name} client portal link copied`, {
            description: 'Live SLA status signed for your client.',
          });
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error('Could not copy link');
        }
      }}
      title={`Copy live client portal link for ${name}`}
    >
      {copied ? <Check size={13} className="text-rs-up" /> : <Copy size={13} />}
      <span>{copied ? 'Copied' : 'Portal link'}</span>
    </RsButton>
  );
}

// ── Main Agency Command Center Page ─────────────────────────────────────────

export function ClientsPage() {
  const plan = useAppStore((s) => s.plan);
  const setSelectedClient = useAppStore((s) => s.setSelectedClient);
  const current = effectivePlan(plan);
  const enabled = current.id === 'enterprise';
  const { data, isLoading, error, refetch } = usePortfolio(enabled);
  const router = useRouter();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'attention' | 'operational'>('all');

  const shareToken = data?.share_token ?? '';
  const totals = data?.totals;

  // Sorted and filtered clients: Degraded/Critical clients float to the top
  const clients = data?.clients;
  const filteredClients = useMemo(() => {
    if (!clients) return [];
    let list = [...clients];

    // Status filter
    if (statusFilter === 'attention') {
      list = list.filter((c) => c.status !== 'operational');
    } else if (statusFilter === 'operational') {
      list = list.filter((c) => c.status === 'operational');
    }

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description && c.description.toLowerCase().includes(q))
      );
    }

    // Sort order: critical -> degraded -> operational, then by name
    return list.sort((a, b) => {
      const order = { critical: 0, degraded: 1, operational: 2 };
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [clients, search, statusFilter]);

  if (!enabled) return <AgencyGate />;

  const handleClientClick = (clientId: string) => {
    setSelectedClient(clientId);
    router.push(`/clients/${clientId}`);
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-rs-brand-subtle px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-rs-brand">
              AGENCY OPERATIONS
            </span>
            <span className="text-xs text-rs-text-tertiary">
              Multi-Client Reliability Control Plane
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-rs-text sm:text-3xl">
            Agency Command Center
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-rs-text-secondary">
            A real-time view of reliability across the infrastructure you manage. Click any client to
            inspect their applications, dependencies, incidents, and SLA evidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <RsButton
            variant="secondary"
            onClick={() => router.push('/clients/onboarding')}
          >
            <Sparkles size={15} />
            Guided Onboarding
          </RsButton>
          <RsButton onClick={() => setCreateModalOpen(true)}>
            <Plus size={16} />
            New Client
          </RsButton>
          {shareToken && (
            <RsButton
              variant="secondary"
              onClick={() => router.push(`/portal/${shareToken}`)}
              title="Open the client-facing SLA portal"
            >
              <ExternalLink size={15} />
              <span className="hidden sm:inline">Client Portal</span>
            </RsButton>
          )}
        </div>
      </div>

      <CreateClientModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(clientId) => {
          setCreateModalOpen(false);
          setSelectedClient(clientId);
          router.push(`/clients/${clientId}`);
        }}
      />

      {error ? (
        <EmptyState
          icon={<Users size={32} />}
          title="Could not load the agency portfolio"
          body="The API returned an error. Retry in a moment — or contact support if this persists."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : isLoading || !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          {/* Executive Overview Cards */}
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              {
                label: 'Clients',
                value: String(totals?.clients ?? 0),
                sub: `${data.clients.reduce((acc, c) => acc + c.application_count, 0)} applications managed`,
                accent: 'text-rs-text',
              },
              {
                label: 'Monitors',
                value: String(totals?.dependencies ?? 0),
                sub:
                  data.unassigned_monitors > 0
                    ? `${data.unassigned_monitors} unassigned to apps`
                    : 'All assigned to apps',
                subClass: data.unassigned_monitors > 0 ? 'text-amber-500' : 'text-rs-up',
                accent: 'text-rs-text',
              },
              {
                label: 'Avg Uptime 24h',
                value: formatUptime(totals?.avg_uptime_24h ?? 100),
                sub: 'Multi-region quorum average',
                accent:
                  (totals?.avg_uptime_24h ?? 100) >= 99.9
                    ? 'text-rs-up'
                    : (totals?.avg_uptime_24h ?? 100) >= 99
                      ? 'text-rs-degraded'
                      : 'text-rs-down',
              },
              {
                label: 'Active Incidents',
                value: String(totals?.open_incidents ?? 0),
                sub:
                  (totals?.clients_needing_attention ?? 0) > 0
                    ? `${totals?.clients_needing_attention} client(s) degraded`
                    : 'All client systems healthy',
                subClass:
                  (totals?.clients_needing_attention ?? 0) > 0
                    ? 'text-rs-degraded font-medium'
                    : 'text-rs-up',
                accent:
                  (totals?.open_incidents ?? 0) > 0 ? 'text-rs-down' : 'text-rs-text',
              },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5 transition-colors hover:border-rs-border"
              >
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                  {c.label}
                </div>
                <div
                  className={cn(
                    'font-mono text-[28px] font-bold leading-none tracking-[-0.02em]',
                    c.accent
                  )}
                >
                  {c.value}
                </div>
                {c.sub && (
                  <div className={cn('mt-2 text-xs text-rs-text-tertiary', c.subClass)}>
                    {c.sub}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Attention Banner if any client is degraded or critical */}
          {(totals?.clients_needing_attention ?? 0) > 0 && (
            <div className="mb-6 flex items-center justify-between rounded-xl border border-rs-down/20 bg-rs-down-bg px-5 py-3.5">
              <div className="flex items-center gap-3">
                <AlertTriangle size={18} className="shrink-0 text-rs-down" />
                <p className="text-sm text-rs-text">
                  <strong className="font-semibold text-rs-down">
                    {totals?.clients_needing_attention} client workspace
                    {totals?.clients_needing_attention === 1 ? '' : 's'} require attention.
                  </strong>{' '}
                  <span className="text-rs-text-secondary">
                    Review active incidents and degraded dependencies below.
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatusFilter('attention')}
                className="text-xs font-medium text-rs-down hover:underline shrink-0"
              >
                Filter degraded →
              </button>
            </div>
          )}

          {/* Empty state when 0 clients exist */}
          {!data.clients.length ? (
            <div className="rounded-2xl border border-dashed border-rs-border-subtle bg-rs-elevated p-8 sm:p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rs-brand/10 text-rs-brand">
                <Building2 size={28} />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-rs-text sm:text-2xl">
                Your agency doesn&apos;t have any client workspaces yet
              </h2>
              <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-rs-text-secondary">
                Create a client to organize their applications, connect external dependencies, and
                start generating timestamped reliability evidence and live SLA portals.
              </p>

              <div className="my-8 mx-auto max-w-xl rounded-xl border border-rs-border-subtle bg-rs-base p-5 text-left">
                <div className="text-xs font-semibold uppercase tracking-wider text-rs-text-tertiary">
                  Recommended Workflow
                </div>
                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-4">
                  <div className="rounded-lg border border-rs-border-subtle bg-rs-elevated p-3">
                    <div className="font-bold text-rs-brand">1. Client</div>
                    <div className="mt-1 text-rs-text-secondary">Organization profile</div>
                  </div>
                  <div className="rounded-lg border border-rs-border-subtle bg-rs-elevated p-3">
                    <div className="font-bold text-blue-500">2. Application</div>
                    <div className="mt-1 text-rs-text-secondary">Services managed</div>
                  </div>
                  <div className="rounded-lg border border-rs-border-subtle bg-rs-elevated p-3">
                    <div className="font-bold text-indigo-500">3. Dependency</div>
                    <div className="mt-1 text-rs-text-secondary">Endpoints & APIs</div>
                  </div>
                  <div className="rounded-lg border border-rs-border-subtle bg-rs-elevated p-3">
                    <div className="font-bold text-rs-up">4. Evidence</div>
                    <div className="mt-1 text-rs-text-secondary">Verifiable proof</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <RsButton onClick={() => router.push('/clients/onboarding')}>
                  <Sparkles size={16} />
                  Start Guided Onboarding
                </RsButton>
                <RsButton variant="secondary" onClick={() => setCreateModalOpen(true)}>
                  <Plus size={16} />
                  Create First Client
                </RsButton>
              </div>
            </div>
          ) : (
            <>
              {/* Controls bar: Search & Filter */}
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative min-w-[240px]">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-rs-text-tertiary"
                    />
                    <input
                      type="text"
                      placeholder="Search clients…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-9 w-full rounded-xl border border-rs-border-subtle bg-rs-input pl-9 pr-3 text-xs text-rs-text outline-none placeholder:text-rs-text-tertiary focus:border-rs-brand"
                    />
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center rounded-lg border border-rs-border-subtle p-0.5 bg-rs-base">
                    {[
                      { id: 'all', label: 'All Clients' },
                      {
                        id: 'attention',
                        label: `Needs Attention (${totals?.clients_needing_attention ?? 0})`,
                      },
                      { id: 'operational', label: 'Operational' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
                        className={cn(
                          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
                          statusFilter === tab.id
                            ? 'bg-rs-elevated text-rs-text font-semibold shadow-xs'
                            : 'text-rs-text-tertiary hover:text-rs-text'
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-rs-text-tertiary">
                  Showing {filteredClients.length} of {data.clients.length} client workspace
                  {data.clients.length === 1 ? '' : 's'}
                </div>
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated lg:block shadow-xs">
                <table className="w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="h-11 border-b border-rs-border-subtle bg-rs-base/40">
                      {[
                        'Client Workspace',
                        'Status',
                        '24h Uptime',
                        'Monitors',
                        'Applications',
                        'Avg Latency',
                        'Open Incidents',
                        'Last Incident',
                        'Actions',
                      ].map((h, i) => (
                        <th
                          key={h}
                          className={cn(
                            'px-4 text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary',
                            i >= 3 && i <= 7 ? 'text-right' : 'text-left',
                            i === 8 && 'text-right'
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((c, i) => (
                      <tr
                        key={c.id}
                        onClick={() => handleClientClick(c.id)}
                        className={cn(
                          'h-16 cursor-pointer transition-colors duration-150 hover:bg-rs-hover',
                          i !== filteredClients.length - 1 && 'border-b border-rs-border-subtle'
                        )}
                      >
                        <td className="px-4">
                          <div className="flex items-center gap-2">
                            <Building2 size={16} className="shrink-0 text-rs-brand" />
                            <div className="font-semibold text-sm text-rs-text hover:text-rs-brand">
                              {c.name}
                            </div>
                          </div>
                          {c.description && (
                            <div className="mt-0.5 truncate max-w-[240px] text-xs text-rs-text-tertiary">
                              {c.description}
                            </div>
                          )}
                        </td>
                        <td className="px-4">{statusBadge(c.status)}</td>
                        <td className="px-4">
                          <UptimeBar value={c.uptime_24h} />
                        </td>
                        <td className="px-4 text-right font-mono text-sm text-rs-text">
                          {c.dependency_count}
                        </td>
                        <td className="px-4 text-right font-mono text-sm text-rs-text">
                          {c.application_count}
                        </td>
                        <td className="px-4 text-right font-mono text-sm text-rs-text">
                          {formatLatency(c.avg_latency_ms)}
                          <span className="ml-0.5 text-xs text-rs-text-tertiary">ms</span>
                        </td>
                        <td className="px-4 text-right font-mono text-sm">
                          {c.open_incidents > 0 ? (
                            <span
                              className={
                                c.critical_incidents > 0 ? 'text-rs-down font-bold' : 'text-rs-degraded font-bold'
                              }
                            >
                              {c.open_incidents}
                              {c.critical_incidents > 0 && ` (${c.critical_incidents} crit)`}
                            </span>
                          ) : (
                            <span className="text-rs-text-tertiary">0</span>
                          )}
                        </td>
                        <td className="px-4 text-right text-xs text-rs-text-tertiary">
                          {c.last_incident_at ? timeAgo(c.last_incident_at) : 'Never'}
                        </td>
                        <td className="px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <ShareButton token={shareToken} name={c.name} />
                            <RsButton
                              variant="secondary"
                              className="px-2.5 py-1 text-xs"
                              onClick={() => handleClientClick(c.id)}
                            >
                              Workspace
                              <ChevronRight size={13} className="ml-1" />
                            </RsButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 lg:hidden">
                {filteredClients.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleClientClick(c.id)}
                    className="cursor-pointer rounded-xl border border-rs-border-subtle bg-rs-elevated p-4 transition-colors hover:border-rs-border"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Building2 size={15} className="text-rs-brand shrink-0" />
                          <span className="truncate text-base font-semibold text-rs-text">
                            {c.name}
                          </span>
                        </div>
                        {c.description && (
                          <p className="mt-0.5 truncate text-xs text-rs-text-tertiary">
                            {c.description}
                          </p>
                        )}
                      </div>
                      {statusBadge(c.status)}
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-rs-border-subtle pt-3">
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wider text-rs-text-tertiary">
                          24h Uptime
                        </div>
                        <div className="mt-1 font-mono text-sm font-semibold text-rs-text">
                          {formatUptime(c.uptime_24h)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wider text-rs-text-tertiary">
                          Apps / Monitors
                        </div>
                        <div className="mt-1 font-mono text-sm text-rs-text">
                          {c.application_count} / {c.dependency_count}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wider text-rs-text-tertiary">
                          Incidents
                        </div>
                        <div
                          className={cn(
                            'mt-1 font-mono text-sm font-semibold',
                            c.open_incidents > 0 ? 'text-rs-down' : 'text-rs-text-tertiary'
                          )}
                        >
                          {c.open_incidents}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-rs-border-subtle pt-3">
                      <span className="text-[11px] text-rs-text-tertiary">
                        Last incident: {c.last_incident_at ? timeAgo(c.last_incident_at) : 'Never'}
                      </span>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <ShareButton token={shareToken} name={c.name} />
                        <span className="text-xs font-medium text-rs-brand inline-flex items-center">
                          View →
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {data.unassigned_monitors > 0 && (
            <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-rs-text-secondary">
              <strong className="text-rs-text font-semibold">
                {data.unassigned_monitors} monitor
                {data.unassigned_monitors === 1 ? ' is' : 's are'} unassigned:
              </strong>{' '}
              Dependencies not assigned to a client&apos;s application do not count toward client SLA
              posture. You can assign them when creating or editing dependencies.
            </div>
          )}
        </>
      )}
    </div>
  );
}
