'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Layers,
  Link2,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { effectivePlan } from '@/lib/dashboard/plans';
import { api } from '@/lib/dashboard/api';
import {
  formatDate,
  formatLatency,
  formatUptime,
  incidentCode,
  reportCode,
  timeAgo,
} from '@/lib/dashboard/format';
import {
  useApplications,
  useClients,
  useDependencies,
  useEvidence,
  useHealth,
  useIncidents,
  usePortfolio,
} from '@/lib/dashboard/queries';
import type { AgencyApplication, Dependency, Incident } from '@/lib/dashboard/types';
import { RsButton } from '@/components/dashboard/ui/button';
import { EmptyState } from '@/components/dashboard/ui/empty-state';
import { SectionHeader } from '@/components/dashboard/ui/section-header';
import { TableSkeleton } from '@/components/dashboard/ui/skeleton';
import { StatusBadge } from '@/components/dashboard/ui/status-badge';
import { cn } from '@/lib/utils';

// ── Create Application Modal ───────────────────────────────────────────────

function CreateAppModal({
  clientId,
  clientName,
  open,
  onClose,
}: {
  clientId: string;
  clientName: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.createApplication(clientId, {
        name: name.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: (app) => {
      queryClient.invalidateQueries({
        queryKey: ['agency', 'clients', clientId, 'applications'],
      });
      queryClient.invalidateQueries({ queryKey: ['agency', 'portfolio'] });
      toast.success(`Application "${app.name}" added to ${clientName}`);
      setName('');
      setDescription('');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || 'Could not create application'),
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
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-rs-text">New Application</h3>
              <p className="text-xs text-rs-text-tertiary">
                For client: <span className="text-rs-text font-medium">{clientName}</span>
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
              Application Name <span className="text-rs-brand">*</span>
            </label>
            <input
              type="text"
              required
              className="flex h-10 w-full rounded-xl border border-rs-border-subtle bg-rs-input px-3.5 text-sm text-rs-text placeholder:text-rs-text-tertiary outline-none focus:border-rs-brand focus:ring-[3px] focus:ring-[rgb(37_99_235_/_0.20)]"
              placeholder="e.g. Customer Web Portal, Checkout API, Mobile Backend"
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
              placeholder="e.g. Public customer experience and authentication layer"
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
              {create.isPending ? 'Adding…' : 'Add application'}
            </RsButton>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Client Workspace Main Component ────────────────────────────────────────

type Tab = 'overview' | 'applications' | 'dependencies' | 'incidents' | 'evidence' | 'portal';

export function ClientWorkspacePage({ clientId }: { clientId: string }) {
  const router = useRouter();
  const plan = useAppStore((s) => s.plan);
  const org = useAppStore((s) => s.org);
  const setAddDependency = useAppStore((s) => s.setAddDependencyOpen);
  const currentPlan = effectivePlan(plan);
  const agencyEnabled = currentPlan.id === 'enterprise';

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [createAppOpen, setCreateAppOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Load clients & portfolio
  const { data: clients, isLoading: clientsLoading } = useClients(agencyEnabled);
  const { data: portfolio } = usePortfolio(agencyEnabled);
  const { data: applications, isLoading: appsLoading } = useApplications(clientId, agencyEnabled);
  const { data: allDependencies, isLoading: depsLoading } = useDependencies();
  const { data: healthData } = useHealth();
  const { data: allIncidents } = useIncidents(undefined, 50);
  const { data: allEvidence } = useEvidence();

  const client = useMemo(
    () => clients?.find((c) => c.id === clientId),
    [clients, clientId]
  );

  const portfolioClient = useMemo(
    () => portfolio?.clients.find((c) => c.id === clientId),
    [portfolio?.clients, clientId]
  );

  const appIds = useMemo(
    () => new Set((applications ?? []).map((a) => a.id)),
    [applications]
  );

  // Filter dependencies belonging to this client's applications
  const clientDependencies = useMemo(() => {
    if (!allDependencies) return [];
    return allDependencies.filter(
      (d) => d.application_id && appIds.has(d.application_id)
    );
  }, [allDependencies, appIds]);

  // Dependency IDs for this client
  const clientDepIds = useMemo(
    () => new Set(clientDependencies.map((d) => d.id)),
    [clientDependencies]
  );

  // Filter incidents affecting this client's dependencies
  const clientIncidents = useMemo(() => {
    if (!allIncidents) return [];
    return allIncidents.filter((inc) => clientDepIds.has(inc.dependency_id));
  }, [allIncidents, clientDepIds]);

  const clientIncidentIds = useMemo(
    () => new Set(clientIncidents.map((i) => i.id)),
    [clientIncidents]
  );

  // Filter evidence reports for this client's incidents
  const clientEvidence = useMemo(() => {
    if (!allEvidence) return [];
    return allEvidence.filter((ev) => clientIncidentIds.has(ev.incident_id));
  }, [allEvidence, clientIncidentIds]);

  const shareToken = portfolio?.share_token ?? '';
  const portalUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/portal/${shareToken}`
      : `/portal/${shareToken}`;

  const copyPortalLink = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopiedLink(true);
      toast.success('Live client portal link copied', {
        description: 'Share this signed link with your client for real-time SLA verification.',
      });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  };

  if (!agencyEnabled) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <Lock size={32} className="mx-auto text-rs-text-tertiary" />
        <h2 className="mt-3 text-xl font-bold text-rs-text">Enterprise Tier Required</h2>
        <p className="mt-2 text-sm text-rs-text-secondary">
          Client workspaces are exclusive to the Enterprise Agency tier.
        </p>
        <RsButton onClick={() => router.push('/settings/billing')} className="mt-5">
          View Plans
        </RsButton>
      </div>
    );
  }

  if (clientsLoading || !client) {
    if (!clientsLoading && !client) {
      return (
        <EmptyState
          icon={<Building2 size={32} />}
          title="Client workspace not found"
          body="This client workspace does not exist or has been removed from your agency account."
          actionLabel="Back to Agency Command Center"
          onAction={() => router.push('/clients')}
        />
      );
    }
    return <TableSkeleton rows={6} />;
  }

  const clientStatus = portfolioClient?.status ?? 'operational';
  const uptime24h = portfolioClient?.uptime_24h ?? 100;
  const avgLatency = portfolioClient?.avg_latency_ms ?? 0;
  const openIncidentsCount = portfolioClient?.open_incidents ?? clientIncidents.filter((i) => i.status === 'open').length;

  return (
    <div>
      {/* Top Header: Unmistakable Context */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => router.push('/clients')}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-rs-text-tertiary transition-colors hover:text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
        >
          <ArrowLeft size={14} />
          <span>Agency Command Center</span>
        </button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rs-brand-subtle text-rs-brand font-bold">
                <Building2 size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-bold tracking-tight text-rs-text sm:text-3xl">
                    {client.name}
                  </h1>
                  {clientStatus === 'critical' ? (
                    <StatusBadge status="down" />
                  ) : clientStatus === 'degraded' ? (
                    <StatusBadge status="degraded" />
                  ) : (
                    <StatusBadge status="operational" />
                  )}
                </div>
                {client.description && (
                  <p className="mt-1 text-sm text-rs-text-secondary">{client.description}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <RsButton variant="secondary" onClick={() => setCreateAppOpen(true)}>
              <Layers size={15} />
              <span>Add Application</span>
            </RsButton>
            <RsButton onClick={() => setAddDependency(true)}>
              <Plus size={16} />
              <span>Add Dependency</span>
            </RsButton>
            {shareToken && (
              <RsButton variant="secondary" onClick={copyPortalLink} title="Copy share link for client">
                {copiedLink ? <Check size={14} className="text-rs-up" /> : <Copy size={14} />}
                <span>{copiedLink ? 'Copied' : 'Share Portal'}</span>
              </RsButton>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-rs-text-tertiary">
            24h Uptime
          </div>
          <div
            className={cn(
              'mt-1 font-mono text-2xl font-bold',
              uptime24h >= 99.9
                ? 'text-rs-up'
                : uptime24h >= 99
                  ? 'text-rs-degraded'
                  : 'text-rs-down'
            )}
          >
            {formatUptime(uptime24h)}
          </div>
          <div className="mt-1 text-[11px] text-rs-text-tertiary">Multi-region quorum</div>
        </div>

        <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-rs-text-tertiary">
            Average Latency
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-rs-text">
            {formatLatency(avgLatency)}
            <span className="ml-1 text-xs font-normal text-rs-text-tertiary">ms</span>
          </div>
          <div className="mt-1 text-[11px] text-rs-text-tertiary">24-hour response average</div>
        </div>

        <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-rs-text-tertiary">
            Applications / Monitors
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-rs-text">
            {applications?.length ?? 0}{' '}
            <span className="text-xs font-normal text-rs-text-tertiary">apps ·</span>{' '}
            {clientDependencies.length}{' '}
            <span className="text-xs font-normal text-rs-text-tertiary">monitors</span>
          </div>
          <div className="mt-1 text-[11px] text-rs-text-tertiary">Assigned to this client</div>
        </div>

        <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-rs-text-tertiary">
            Active Incidents
          </div>
          <div
            className={cn(
              'mt-1 font-mono text-2xl font-bold',
              openIncidentsCount > 0 ? 'text-rs-down' : 'text-rs-text'
            )}
          >
            {openIncidentsCount}
          </div>
          <div className="mt-1 text-[11px] text-rs-text-tertiary">
            {openIncidentsCount > 0 ? 'Requires attention' : 'No active reliability issues'}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6 flex border-b border-rs-border-subtle overflow-x-auto rs-scrollbar">
        {[
          { id: 'overview', label: 'Overview', icon: Building2 },
          {
            id: 'applications',
            label: `Applications (${applications?.length ?? 0})`,
            icon: Layers,
          },
          {
            id: 'dependencies',
            label: `Dependencies (${clientDependencies.length})`,
            icon: Link2,
          },
          {
            id: 'incidents',
            label: `Incidents (${clientIncidents.length})`,
            icon: AlertTriangle,
          },
          {
            id: 'evidence',
            label: `Evidence Reports (${clientEvidence.length})`,
            icon: FileText,
          },
          { id: 'portal', label: 'Client Portal & White-Label', icon: ExternalLink },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as Tab)}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
                isActive
                  ? 'border-rs-brand text-rs-brand'
                  : 'border-transparent text-rs-text-secondary hover:text-rs-text hover:border-rs-border'
              )}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <CreateAppModal
        clientId={client.id}
        clientName={client.name}
        open={createAppOpen}
        onClose={() => setCreateAppOpen(false)}
      />

      {/* ── TAB 1: OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Active incidents alert if any */}
          {openIncidentsCount > 0 && (
            <div className="rounded-xl border border-rs-down/30 bg-rs-down-bg p-4">
              <div className="flex items-center gap-2 font-semibold text-sm text-rs-down">
                <AlertTriangle size={16} />
                <span>Active reliability degradation detected</span>
              </div>
              <p className="mt-1 text-xs text-rs-text-secondary">
                {openIncidentsCount} open incident{openIncidentsCount === 1 ? '' : 's'} currently
                affecting services managed for {client.name}.
              </p>
              <div className="mt-3">
                <RsButton
                  variant="secondary"
                  className="text-xs px-3 py-1 text-rs-down"
                  onClick={() => setActiveTab('incidents')}
                >
                  View Active Incidents →
                </RsButton>
              </div>
            </div>
          )}

          {/* Applications summary */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <SectionHeader
                title="Managed Applications"
                subtitle={`Services and architectures operated for ${client.name}.`}
              />
              <RsButton variant="secondary" onClick={() => setCreateAppOpen(true)}>
                <Plus size={14} />
                New Application
              </RsButton>
            </div>

            {appsLoading ? (
              <TableSkeleton rows={3} />
            ) : (applications?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Layers size={32} />}
                title={`No applications created for ${client.name}`}
                body="Applications organize the specific systems you operate (e.g. Customer Portal, Checkout API) and group their monitored dependencies."
                actionLabel="Create first application"
                onAction={() => setCreateAppOpen(true)}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {applications?.map((app) => {
                  const appDeps = clientDependencies.filter((d) => d.application_id === app.id);
                  return (
                    <div
                      key={app.id}
                      className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5 transition-colors hover:border-rs-border"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-base font-semibold text-rs-text">{app.name}</h4>
                          {app.description && (
                            <p className="mt-0.5 text-xs text-rs-text-tertiary">{app.description}</p>
                          )}
                        </div>
                        <span className="rounded-full bg-rs-base px-2.5 py-0.5 font-mono text-[11px] text-rs-text-tertiary">
                          {appDeps.length} monitor{appDeps.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="mt-4 space-y-2">
                        {appDeps.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-rs-border-subtle p-3 text-center text-xs text-rs-text-tertiary">
                            No dependencies connected yet.
                            <button
                              type="button"
                              onClick={() => setAddDependency(true)}
                              className="ml-2 font-medium text-rs-brand hover:underline"
                            >
                              Add monitor
                            </button>
                          </div>
                        ) : (
                          appDeps.slice(0, 3).map((dep) => {
                            const health = healthData?.find((h) => h.dependency_id === dep.id);
                            return (
                              <div
                                key={dep.id}
                                className="flex items-center justify-between rounded-lg border border-rs-border-subtle bg-rs-base px-3 py-2 text-xs"
                              >
                                <span className="font-medium truncate max-w-[200px] text-rs-text">
                                  {dep.name}
                                </span>
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-rs-text-tertiary">
                                    {formatUptime(health?.uptime_percentage_24h ?? 100)}
                                  </span>
                                  <StatusBadge
                                    status={health?.current_status ?? 'operational'}
                                    disablePulse
                                  />
                                </div>
                              </div>
                            );
                          })
                        )}
                        {appDeps.length > 3 && (
                          <div className="text-right text-[11px] text-rs-text-tertiary">
                            +{appDeps.length - 3} more monitors
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick share portal banner */}
          <div className="rounded-xl border border-rs-brand/20 bg-rs-brand-subtle p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-rs-text">Client SLA Portal</h4>
                <p className="mt-0.5 text-xs text-rs-text-secondary">
                  Share real-time, tamper-evident reliability records with {client.name}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <RsButton variant="secondary" onClick={copyPortalLink} className="text-xs">
                  {copiedLink ? <Check size={13} className="text-rs-up" /> : <Copy size={13} />}
                  <span>{copiedLink ? 'Link Copied' : 'Copy Report Link'}</span>
                </RsButton>
                <RsButton
                  onClick={() => router.push(`/portal/${shareToken}`)}
                  className="text-xs"
                >
                  <Eye size={13} />
                  <span>Preview Portal</span>
                </RsButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: APPLICATIONS ── */}
      {activeTab === 'applications' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <SectionHeader
              title="Applications Architecture"
              subtitle={`Systems and components operated for ${client.name}.`}
            />
            <RsButton onClick={() => setCreateAppOpen(true)}>
              <Plus size={15} />
              Add Application
            </RsButton>
          </div>

          {(applications?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Layers size={32} />}
              title="No applications yet"
              body={`Applications represent the systems or services you manage for ${client.name} (e.g. Customer Portal, Checkout API).`}
              actionLabel="Add first application"
              onAction={() => setCreateAppOpen(true)}
            />
          ) : (
            <div className="space-y-4">
              {applications?.map((app) => {
                const appDeps = clientDependencies.filter((d) => d.application_id === app.id);
                return (
                  <div
                    key={app.id}
                    className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-6 shadow-xs"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-rs-border-subtle pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Layers size={18} className="text-blue-500" />
                          <h4 className="text-base font-bold text-rs-text">{app.name}</h4>
                        </div>
                        {app.description && (
                          <p className="mt-1 text-xs text-rs-text-tertiary">{app.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <RsButton
                          variant="secondary"
                          className="text-xs"
                          onClick={() => setAddDependency(true)}
                        >
                          <Plus size={13} />
                          <span>Add Monitor to {app.name}</span>
                        </RsButton>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-rs-text-tertiary">
                        Connected Dependencies ({appDeps.length})
                      </div>
                      {appDeps.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-rs-border-subtle p-6 text-center text-xs text-rs-text-tertiary">
                          No dependencies currently assigned to this application.
                          <div className="mt-2">
                            <RsButton
                              variant="secondary"
                              className="text-xs"
                              onClick={() => setAddDependency(true)}
                            >
                              Connect First Dependency
                            </RsButton>
                          </div>
                        </div>
                      ) : (
                        <div className="divide-y divide-rs-border-subtle overflow-hidden rounded-lg border border-rs-border-subtle bg-rs-base">
                          {appDeps.map((dep) => {
                            const health = healthData?.find((h) => h.dependency_id === dep.id);
                            return (
                              <div
                                key={dep.id}
                                className="flex items-center justify-between p-3.5 text-xs transition-colors hover:bg-rs-hover"
                              >
                                <div className="min-w-0 flex-1 pr-4">
                                  <div className="font-semibold text-rs-text">{dep.name}</div>
                                  <div className="font-mono text-[11px] text-rs-text-tertiary truncate">
                                    {dep.endpoint_url}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                  <span className="font-mono text-rs-text">
                                    {formatUptime(health?.uptime_percentage_24h ?? 100)}
                                  </span>
                                  <span className="font-mono text-rs-text-tertiary">
                                    {formatLatency(health?.avg_latency_ms_24h ?? 0)} ms
                                  </span>
                                  <StatusBadge
                                    status={health?.current_status ?? 'operational'}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: DEPENDENCIES ── */}
      {activeTab === 'dependencies' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <SectionHeader
              title="Monitored Infrastructure"
              subtitle={`External services and APIs tracked for ${client.name}.`}
            />
            <RsButton onClick={() => setAddDependency(true)}>
              <Plus size={15} />
              Add Dependency
            </RsButton>
          </div>

          {clientDependencies.length === 0 ? (
            <EmptyState
              icon={<Link2 size={32} />}
              title={`No dependencies connected for ${client.name}`}
              body="Add external dependencies to start multi-region checks, quorum verification, and SLA tracking."
              actionLabel="Add first dependency"
              onAction={() => setAddDependency(true)}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr className="h-11 border-b border-rs-border-subtle bg-rs-base/40">
                    {['Name & Endpoint', 'Application', 'Status', '24h Uptime', 'Latency', 'Regions', 'Actions'].map(
                      (h, i) => (
                        <th
                          key={h}
                          className={cn(
                            'px-4 text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary',
                            i >= 3 && i <= 4 ? 'text-right' : 'text-left',
                            i === 6 && 'text-right'
                          )}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {clientDependencies.map((dep, i) => {
                    const health = healthData?.find((h) => h.dependency_id === dep.id);
                    const app = applications?.find((a) => a.id === dep.application_id);
                    return (
                      <tr
                        key={dep.id}
                        onClick={() => router.push(`/dependencies/${dep.id}`)}
                        className={cn(
                          'h-16 cursor-pointer transition-colors duration-150 hover:bg-rs-hover',
                          i !== clientDependencies.length - 1 && 'border-b border-rs-border-subtle'
                        )}
                      >
                        <td className="px-4">
                          <div className="font-semibold text-sm text-rs-text">{dep.name}</div>
                          <div className="font-mono text-xs text-rs-text-tertiary truncate max-w-[240px]">
                            {dep.endpoint_url}
                          </div>
                        </td>
                        <td className="px-4">
                          <span className="rounded-md bg-rs-base border border-rs-border-subtle px-2 py-0.5 text-xs text-rs-text-secondary">
                            {app?.name ?? 'Default'}
                          </span>
                        </td>
                        <td className="px-4">
                          <StatusBadge status={health?.current_status ?? 'operational'} />
                        </td>
                        <td className="px-4 text-right font-mono text-sm text-rs-text">
                          {formatUptime(health?.uptime_percentage_24h ?? 100)}
                        </td>
                        <td className="px-4 text-right font-mono text-sm text-rs-text">
                          {formatLatency(health?.avg_latency_ms_24h ?? 0)} ms
                        </td>
                        <td className="px-4 text-xs text-rs-text-tertiary">
                          {dep.regions?.length ?? 2} regions
                        </td>
                        <td className="px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="text-xs font-medium text-rs-brand hover:underline mr-2"
                            onClick={() => setAddDependency(true, dep.id)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: INCIDENTS ── */}
      {activeTab === 'incidents' && (
        <div className="space-y-6">
          <SectionHeader
            title="Reliability Incidents & SLA Impact"
            subtitle={`Attributed incidents and outages affecting ${client.name}.`}
          />

          {clientIncidents.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck size={32} />}
              title="No incidents recorded for this client"
              body="All monitored services are currently healthy. Incidents will appear here automatically when multi-region quorum is broken."
            />
          ) : (
            <div className="space-y-3">
              {clientIncidents.map((incident) => {
                const dep = clientDependencies.find((d) => d.id === incident.dependency_id);
                const isCritical = incident.severity === 'critical';
                return (
                  <Link
                    key={incident.id}
                    href={`/incidents/${incident.id}`}
                    className="flex flex-col gap-3 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5 transition-colors hover:border-rs-border sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-medium text-rs-brand">
                          {incidentCode(incident.id, incident.display_id)}
                        </span>
                        <h4 className="text-sm font-semibold text-rs-text">
                          {incident.title || incident.root_cause || 'Infrastructure Incident'}
                        </h4>
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                            isCritical ? 'bg-rs-down/20 text-rs-down' : 'bg-amber-500/20 text-amber-500'
                          )}
                        >
                          {incident.severity}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-rs-text-tertiary">
                        Affected Service:{' '}
                        <span className="text-rs-text font-medium">{dep?.name ?? 'Dependency'}</span> ·{' '}
                        Started {timeAgo(incident.started_at)}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-rs-base px-2.5 py-1 text-xs font-mono text-rs-text">
                        {incident.status}
                      </span>
                      <ChevronRight size={16} className="text-rs-border" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 5: EVIDENCE REPORTS ── */}
      {activeTab === 'evidence' && (
        <div className="space-y-6">
          <SectionHeader
            title="SLA Evidence Reports"
            subtitle={`Verifiable, tamper-evident records for SLA reviews with ${client.name}.`}
          />

          <div className="rounded-xl border border-rs-border-subtle bg-rs-base p-4 text-xs leading-relaxed text-rs-text-secondary">
            <strong className="text-rs-text">Why Evidence Matters:</strong> RELIASTRA evidence
            reports contain multi-region check logs, latency graphs, and cryptographic checksums.
            Provide your clients with verifiable proof of third-party vendor failure during SLA
            discussions.
          </div>

          {clientEvidence.length === 0 ? (
            <EmptyState
              icon={<FileText size={32} />}
              title="No evidence reports generated yet"
              body="Evidence reports are generated when incident investigations complete with multi-region verification."
            />
          ) : (
            <div className="space-y-3">
              {clientEvidence.map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between rounded-xl border border-rs-border-subtle bg-rs-elevated p-5"
                >
                  <div className="flex items-center gap-3">
                    <FileText size={20} className="text-rs-brand shrink-0" />
                    <div>
                      <div className="font-mono text-xs font-semibold text-rs-brand">
                        {reportCode(report.id)}
                      </div>
                      <div className="text-sm font-semibold text-rs-text">
                        {report.title || 'SLA Evidence Report'}
                      </div>
                      <div className="text-xs text-rs-text-tertiary">
                        Generated {formatDate(report.generated_at)} · {report.vendor ?? 'Vendor'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <RsButton
                      variant="secondary"
                      className="text-xs"
                      onClick={() => router.push(`/reports/${report.share_token || report.id}`)}
                    >
                      Download PDF
                    </RsButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 6: CLIENT PORTAL & WHITE-LABEL ── */}
      {activeTab === 'portal' && (
        <div className="space-y-6">
          <SectionHeader
            title="Public Client SLA Portal"
            subtitle="What will your client see when they open their live reliability link?"
          />

          <div className="rounded-2xl border border-rs-border-subtle bg-rs-elevated p-6 space-y-6">
            <div>
              <h4 className="text-base font-semibold text-rs-text">
                Live, Signed Client Experience
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-rs-text-secondary">
                Your client receives a dedicated live link that displays 24-hour uptime, average
                latency, and incident history. Sensitive endpoints, API keys, and internal secrets are
                never exposed.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-rs-border-subtle bg-rs-base p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-rs-text-tertiary">
                  Client Portal URL
                </div>
                <div className="mt-1 font-mono text-xs text-rs-brand truncate">{portalUrl}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <RsButton onClick={copyPortalLink}>
                  {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                </RsButton>
                <RsButton
                  variant="secondary"
                  onClick={() => router.push(`/portal/${shareToken}`)}
                >
                  <ExternalLink size={14} />
                  <span>Open Portal</span>
                </RsButton>
              </div>
            </div>

            {/* White-Label explanation */}
            <div className="rounded-xl border border-rs-border-subtle bg-rs-base p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rs-brand">
                <Sparkles size={14} />
                <span>White-Label Branding</span>
              </div>
              <h5 className="mt-2 text-sm font-semibold text-rs-text">
                Present your client&apos;s reliability experience under your agency&apos;s identity
              </h5>
              <p className="mt-1 text-xs text-rs-text-secondary leading-relaxed">
                The portal is branded with your organization name (<span className="text-rs-text font-medium">{org?.name}</span>)
                and formatted cleanly for executive presentations and quarterly business reviews (QBRs).
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
                <div className="rounded-lg border border-rs-border-subtle bg-rs-elevated p-3">
                  <div className="font-semibold text-rs-text">Agency Identity</div>
                  <div className="mt-1 text-rs-text-tertiary">
                    Header displays &ldquo;{org?.name}&rdquo;
                  </div>
                </div>
                <div className="rounded-lg border border-rs-border-subtle bg-rs-elevated p-3">
                  <div className="font-semibold text-rs-text">Security Guarantee</div>
                  <div className="mt-1 text-rs-text-tertiary">
                    No backend endpoints or headers exposed
                  </div>
                </div>
                <div className="rounded-lg border border-rs-border-subtle bg-rs-elevated p-3">
                  <div className="font-semibold text-rs-text">Print & PDF Ready</div>
                  <div className="mt-1 text-rs-text-tertiary">
                    Optimized for client QBR export
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
