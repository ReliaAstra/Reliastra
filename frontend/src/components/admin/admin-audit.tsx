'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileClock, Search, UserRound } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { formatAdminDate, formatRelativeTime, humanize } from '@/lib/admin-utils';
import { cn } from '@/lib/utils';
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  Pagination,
  SectionFailure,
  SectionSkeleton,
} from '@/components/admin/admin-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PAGE_SIZE = 25;

export function AuditPage() {
  const router = useRouter(); const params = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const [action, setAction] = useState(params.get('action') || ''); const [resource, setResource] = useState(params.get('entity_type') || '');
  const page = Math.max(1, Number(params.get('page') || 1));
  useEffect(() => { setSearch(params.get('search') || ''); setAction(params.get('action') || ''); setResource(params.get('entity_type') || ''); }, [params]);
  const updateUrl = (changes: Record<string, string | null | undefined>) => { const next = new URLSearchParams(params.toString()); Object.entries(changes).forEach(([key, value]) => { if (!value) next.delete(key); else next.set(key, value); }); router.replace(`/admin/audit${next.size ? `?${next.toString()}` : ''}`, { scroll: false }); };
  const requestParams = useMemo(() => ({ search: params.get('search') || undefined, action: params.get('action') || undefined, entity_type: params.get('entity_type') || undefined, page, page_size: PAGE_SIZE }), [page, params]);
  const query = useQuery({ queryKey: ['admin', 'audit', requestParams], queryFn: () => adminApi.auditLogs(requestParams), staleTime: 30_000 });
  const submit = (event: React.FormEvent) => { event.preventDefault(); updateUrl({ search: search.trim() || null, action: action.trim() || null, entity_type: resource.trim() || null, page: null }); };
  return <div className="space-y-6"><AdminPageHeader eyebrow="Audit" title="Audit trail" description="A searchable, timeline-first record of high-impact administrative activity." /><AdminCard><form onSubmit={submit} className="grid gap-3 border-b border-slate-100 p-4 dark:border-white/10 sm:grid-cols-[minmax(0,1.5fr)_minmax(130px,.75fr)_minmax(130px,.75fr)_auto] sm:p-5"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search actor, action, or resource ID" className="h-10 pl-9" /></div><Input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Action filter" className="h-10 text-xs" /><Input value={resource} onChange={(event) => setResource(event.target.value)} placeholder="Resource filter" className="h-10 text-xs" /><Button type="submit" className="h-10">Search</Button></form>{query.isLoading && <SectionSkeleton lines={9} />}{query.isError && <SectionFailure title="Audit trail unavailable." description="Try refreshing the audit query." onRetry={() => query.refetch()} />}{query.data && query.data.items.length === 0 && <AdminEmptyState title="No audit entries match this search." description="Administrative mutations are recorded here when they occur." icon={FileClock} />}{query.data && query.data.items.length > 0 && <AuditTimeline items={query.data.items} />}{query.data && <Pagination page={query.data.page} pageSize={query.data.page_size} total={query.data.total} onPageChange={(nextPage) => updateUrl({ page: String(nextPage) })} />}</AdminCard></div>;
}

function AuditTimeline({ items }: { items: Awaited<ReturnType<typeof adminApi.auditLogs>>['items'] }) {
  return <div className="p-5 sm:p-6"><div className="space-y-0">{items.map((item, index) => { const details = item.details && Object.entries(item.details).filter(([, value]) => value !== null && value !== undefined).slice(0, 3); return <div key={item.id} className="relative flex gap-4 pb-7 last:pb-0">{index < items.length - 1 && <span className="absolute left-[9px] top-5 h-[calc(100%-3px)] w-px bg-slate-200 dark:bg-white/10" />}<span className="relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white dark:border-white/10 dark:bg-card"><span className="size-1.5 rounded-full bg-slate-700 dark:bg-slate-300" /></span><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between"><p className="text-sm text-slate-800 dark:text-slate-100"><strong className="font-semibold">{item.admin_email || 'System administrator'}</strong> <span className="text-slate-500 dark:text-slate-400">{humanize(item.action).toLowerCase()}</span>{item.entity_type && <><span className="text-slate-400"> · </span><span>{humanize(item.entity_type)}</span></>}</p><p className="shrink-0 text-[11px] text-slate-400">{formatRelativeTime(item.created_at)}</p></div>{item.entity_id && <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{item.entity_id}</p>}{details && details.length > 0 && <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{details.map(([key, value]) => `${humanize(key)}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`).join(' · ')}</p>}{item.ip_address && <p className="mt-2 text-[10px] text-slate-400">IP {item.ip_address} · {formatAdminDate(item.created_at, true)}</p>}</div></div>; })}</div></div>;
}
