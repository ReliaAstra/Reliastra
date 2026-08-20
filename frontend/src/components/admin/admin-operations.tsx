'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Database, HardDrive, Mail, MonitorCog, RadioTower, Server, Settings2, Workflow, UsersRound, type LucideIcon } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { formatAdminDate, formatCompactNumber, formatRelativeTime, humanize } from '@/lib/admin-utils';
import { cn } from '@/lib/utils';
import type { ComponentHealth, ErrorLogItem } from '@/types/admin';
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  HealthDot,
  MetricCard,
  Pagination,
  SectionFailure,
  SectionHeading,
  SectionSkeleton,
  StatusPill,
} from '@/components/admin/admin-primitives';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const PAGE_SIZE = 20;

export function OperationsPage() {
  const params = useSearchParams(); const router = useRouter();
  const page = Math.max(1, Number(params.get('page') || 1)); const level = params.get('level') || 'all'; const resolved = params.get('resolved') || 'all';
  const [selectedError, setSelectedError] = useState<ErrorLogItem | null>(null);
  const updateUrl = (changes: Record<string, string | null | undefined>) => { const next = new URLSearchParams(params.toString()); Object.entries(changes).forEach(([key, value]) => { if (!value || value === 'all') next.delete(key); else next.set(key, value); }); router.replace(`/admin/operations${next.size ? `?${next.toString()}` : ''}`, { scroll: false }); };
  const healthQuery = useQuery({ queryKey: ['admin', 'operations', 'overview'], queryFn: adminApi.operationsOverview, staleTime: 10_000, refetchInterval: 15_000 });
  const metricsQuery = useQuery({ queryKey: ['admin', 'operations', 'metrics'], queryFn: adminApi.systemMetrics, staleTime: 30_000, refetchInterval: 45_000 });
  const errorsParams = useMemo(() => ({ level: level === 'all' ? undefined : level, is_resolved: resolved === 'all' ? undefined : resolved === 'resolved', page, page_size: PAGE_SIZE }), [level, page, resolved]);
  const errorsQuery = useQuery({ queryKey: ['admin', 'operations', 'errors', errorsParams], queryFn: () => adminApi.errors(errorsParams), staleTime: 30_000 });
  return <div className="space-y-6"><AdminPageHeader eyebrow="Operations" title="Operations" description="A clean system-health console. The detail stays close, but only surfaces when it helps you act." /> <OperationsSummary query={healthQuery} /><SystemMetricsPanel query={metricsQuery} /><AdminCard><div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-white/10 sm:p-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Error logs</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Severity and resolution filters available in the current backend contract</p></div><div className="flex flex-wrap gap-2"><ErrorSelect value={level} onValueChange={(value) => updateUrl({ level: value, page: null })} label="Severity" options={[['all', 'All severity'], ['error', 'Error'], ['warning', 'Warning'], ['critical', 'Critical'], ['info', 'Info']]} /><ErrorSelect value={resolved} onValueChange={(value) => updateUrl({ resolved: value, page: null })} label="Resolution" options={[['all', 'All states'], ['unresolved', 'Unresolved'], ['resolved', 'Resolved']]} /></div></div><ErrorTable query={errorsQuery} onSelect={setSelectedError} onPageChange={(nextPage) => updateUrl({ page: String(nextPage) })} /></AdminCard><ErrorDetailSheet error={selectedError} onOpenChange={(open) => { if (!open) setSelectedError(null); }} /></div>;
}

function OperationsSummary({ query }: { query: { isLoading: boolean; isError: boolean; data?: Awaited<ReturnType<typeof adminApi.operationsOverview>>; refetch: () => unknown } }) {
  if (query.isLoading) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" />)}</div>;
  if (query.isError) return <AdminCard><SectionFailure title="Operations overview unavailable." description="Health checks could not be loaded." onRetry={() => query.refetch()} /></AdminCard>;
  if (!query.data) return null;
  const services: Array<{ label: string; health: ComponentHealth; icon: LucideIcon }> = [
    { label: 'API', health: query.data.api, icon: Server }, { label: 'Database', health: query.data.database, icon: Database }, { label: 'Redis', health: query.data.redis, icon: RadioTower }, { label: 'Workers', health: query.data.workers, icon: Workflow }, { label: 'Scheduler', health: query.data.scheduler, icon: Settings2 }, { label: 'Check engine', health: query.data.check_engine, icon: MonitorCog }, { label: 'Billing', health: query.data.billing, icon: HardDrive }, { label: 'Email', health: query.data.email, icon: Mail }, { label: 'Storage', health: query.data.storage, icon: HardDrive },
  ];
  return <AdminCard><SectionHeading title="Service health" subtitle={`Last checked ${formatRelativeTime(query.data.generated_at)}`} action={<StatusPill status={query.data.overall} label={humanize(query.data.overall)} />} /><div className="grid border-t border-slate-100 dark:border-white/10 sm:grid-cols-2 xl:grid-cols-3">{services.map(({ label, health, icon: Icon }, index) => <div key={label} className={cn('min-h-32 p-5', index < services.length - 1 && 'border-b border-slate-100 sm:border-r dark:border-white/10')}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><span className="flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300"><Icon className="size-3.5" /></span><span className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span></div><HealthDot status={health.status} /></div><div className="mt-5 flex items-end justify-between gap-3"><StatusPill status={health.status} />{health.latency_ms !== null && health.latency_ms !== undefined && <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">{health.latency_ms.toFixed(0)} ms</span>}</div>{(health.message || health.error) && <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{health.message || health.error}</p>}</div>)}</div></AdminCard>;
}

function SystemMetricsPanel({ query }: { query: { isLoading: boolean; isError: boolean; data?: Awaited<ReturnType<typeof adminApi.systemMetrics>>; refetch: () => unknown } }) {
  if (query.isLoading) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" />)}</div>;
  if (query.isError) return <AdminCard><SectionFailure title="System metrics unavailable." description="Try refreshing this isolated section." onRetry={() => query.refetch()} compact /></AdminCard>;
  if (!query.data) return null;
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><MetricCard label="Users" value={formatCompactNumber(query.data.total_users)} context="platform total" icon={Server} /><MetricCard label="Organizations" value={formatCompactNumber(query.data.total_orgs)} context="platform total" icon={Database} /><MetricCard label="Dependencies" value={formatCompactNumber(query.data.total_dependencies)} context="monitored services" icon={RadioTower} /><MetricCard label="Open incidents" value={formatCompactNumber(query.data.total_incidents_open)} context="active platform incidents" icon={AlertTriangle} tone={query.data.total_incidents_open > 0 ? 'attention' : 'default'} /><MetricCard label="Open tickets" value={formatCompactNumber(query.data.total_tickets_open)} context="support workload" icon={UsersRound} /></section>;
}
function ErrorSelect({ value, onValueChange, label, options }: { value: string; onValueChange: (value: string) => void; label: string; options: Array<[string, string]> }) { return <Select value={value} onValueChange={onValueChange}><SelectTrigger size="sm" className="text-xs"><SelectValue placeholder={label} /></SelectTrigger><SelectContent>{options.map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}</SelectContent></Select>; }
function ErrorTable({ query, onSelect, onPageChange }: { query: { isLoading: boolean; isError: boolean; data?: Awaited<ReturnType<typeof adminApi.errors>>; refetch: () => unknown }; onSelect: (error: ErrorLogItem) => void; onPageChange: (page: number) => void }) { if (query.isLoading) return <SectionSkeleton lines={8} />; if (query.isError) return <SectionFailure title="Error logs unavailable." description="Try refreshing the log table." onRetry={() => query.refetch()} />; const logs = query.data?.items || []; if (!logs.length) return <AdminEmptyState title="No error logs match this view." description="When backend error events are recorded, they will appear here with technical context kept one click away." icon={AlertTriangle} />; return <><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[820px] text-left"><thead><tr className="border-b border-slate-100 bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.02]">{['Severity', 'Service', 'Message', 'Request ID', 'Time', ''].map((heading) => <th key={heading || 'action'} className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{heading}</th>)}</tr></thead><tbody>{logs.map((error) => <tr key={error.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-white/10 dark:hover:bg-white/[0.03]"><td className="px-5 py-4"><StatusPill status={error.level} /></td><td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{error.component || '—'}</td><td className="px-5 py-4"><button type="button" onClick={() => onSelect(error)} className="block max-w-lg truncate text-left text-sm font-medium text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-slate-100">{error.message}</button></td><td className="px-5 py-4 font-mono text-xs text-slate-500 dark:text-slate-400">{error.request_id || '—'}</td><td className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">{formatRelativeTime(error.created_at)}</td><td className="px-5 py-4"><button type="button" onClick={() => onSelect(error)} className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:hover:bg-white/10 dark:hover:text-white" aria-label="Open error detail"><ArrowIcon /></button></td></tr>)}</tbody></table></div><div className="divide-y divide-slate-100 md:hidden dark:divide-white/10">{logs.map((error) => <button key={error.id} type="button" onClick={() => onSelect(error)} className="block w-full px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"><div className="flex items-start justify-between gap-3"><p className="line-clamp-2 text-sm font-medium text-slate-800 dark:text-slate-100">{error.message}</p><StatusPill status={error.level} /></div><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{error.component || 'Unknown service'} · {formatRelativeTime(error.created_at)}</p></button>)}</div>{query.data && <Pagination page={query.data.page} pageSize={query.data.page_size} total={query.data.total} onPageChange={onPageChange} />}</>; }
function ArrowIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function ErrorDetailSheet({ error, onOpenChange }: { error: ErrorLogItem | null; onOpenChange: (open: boolean) => void }) { return <Sheet open={Boolean(error)} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto sm:max-w-2xl"><SheetHeader><SheetTitle>Error detail</SheetTitle><SheetDescription>{error?.message}</SheetDescription></SheetHeader>{error && <div className="space-y-5 px-4"><div className="grid gap-3 sm:grid-cols-2"><Detail label="Severity" value={<StatusPill status={error.level} />} /><Detail label="Service" value={error.component || '—'} /><Detail label="Timestamp" value={formatAdminDate(error.created_at, true)} /><Detail label="Request ID" value={error.request_id || '—'} mono /></div><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Message</p><p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">{error.message}</p></div>{error.stack_trace && <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Stack trace</p><pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100">{error.stack_trace}</pre></div>}<div className="grid gap-3 border-t border-slate-100 pt-5 dark:border-white/10 sm:grid-cols-3"><Detail label="User" value={error.user_id || '—'} mono /><Detail label="Organization" value={error.org_id || '—'} mono /><Detail label="Resolved" value={error.is_resolved ? 'Yes' : 'No'} /></div></div>}</SheetContent></Sheet>; }
function Detail({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) { return <div><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</p><div className={cn('mt-1.5 break-all text-sm font-medium text-slate-800 dark:text-slate-100', mono && 'font-mono text-xs')}>{value}</div></div>; }
