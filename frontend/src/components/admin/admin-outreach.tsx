'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, FilePenLine, Inbox, Play, Search, Send, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/admin-api';
import { renderEmailVariables } from '@/lib/email-sanitize';
import { formatAdminDate, formatCompactNumber } from '@/lib/admin-utils';
import { cn } from '@/lib/utils';
import type { OutreachDraft } from '@/types/admin';
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  MetricCard,
  SectionFailure,
  SectionSkeleton,
  StatusPill,
} from '@/components/admin/admin-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export function OutreachPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('queued');
  const [selected, setSelected] = useState<OutreachDraft | null>(null);
  const overviewQuery = useQuery({
    queryKey: ['admin', 'outreach', 'overview'],
    queryFn: adminApi.outreachOverview,
    staleTime: 30_000,
  });
  const draftsQuery = useQuery({
    queryKey: ['admin', 'outreach', 'drafts', status],
    queryFn: () => adminApi.outreachDrafts({ status, page: 1, page_size: 50 }),
    staleTime: 30_000,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'outreach'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
    ]);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Outreach"
        title="Outreach hunter"
        description="Review-queue only. Nothing sends without you approving that draft."
        actions={
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/admin/email">
              <FilePenLine className="size-3.5" /> Template studio <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        }
      />
      <OutreachMetrics query={overviewQuery} />
      <Tabs defaultValue="queue">
        <TabsList className="max-w-full overflow-x-auto bg-white dark:bg-card">
          <TabsTrigger value="queue">Review queue</TabsTrigger>
          <TabsTrigger value="hunt">Hunt</TabsTrigger>
          <TabsTrigger value="qa">Ask</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-4">
          <AdminCard>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4 dark:border-white/10 sm:p-5">
              {['queued', 'approved', 'sent', 'draft', 'killed'].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium',
                    status === value
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300'
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <DraftList query={draftsQuery} onSelect={setSelected} />
          </AdminCard>
        </TabsContent>
        <TabsContent value="hunt" className="mt-4">
          <HuntPanel onDone={refresh} />
        </TabsContent>
        <TabsContent value="qa" className="mt-4">
          <QaPanel />
        </TabsContent>
      </Tabs>
      <DraftInspector draft={selected} onClose={() => setSelected(null)} onChanged={refresh} />
    </div>
  );
}

function OutreachMetrics({ query }: {
  query: { isLoading: boolean; isError: boolean; data?: Awaited<ReturnType<typeof adminApi.outreachOverview>>; refetch: () => unknown };
}) {
  if (query.isLoading)
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" />
        ))}
      </div>
    );
  if (query.isError)
    return (
      <AdminCard>
        <SectionFailure title="Outreach overview unavailable." description="Draft lists can still be retried independently." onRetry={() => query.refetch()} />
      </AdminCard>
    );
  if (!query.data) return null;
  const data = query.data;
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="In queue" value={formatCompactNumber(data.queued_today)} context="awaiting review" icon={Inbox} />
      <MetricCard label="Sent today" value={`${data.sent_today}/${data.daily_cap}`} context={`warmup ceiling ${data.warmup_ceiling}`} icon={Send} />
      {data.paused ? (
        <MetricCard label="Paused" value="Yes" context={data.pause_reason || 'deliverability gate'} icon={ShieldAlert} />
      ) : (
        <MetricCard label="Gates" value="Holding" context="bounce <3%, complaints <0.1%" icon={ShieldAlert} />
      )}
      <MetricCard label="Killed" value={formatCompactNumber(data.totals.killed || 0)} context="filtered by kill rules" icon={Search} />
    </section>
  );
}

function DraftList({ query, onSelect }: {
  query: { isLoading: boolean; isError: boolean; data?: Awaited<ReturnType<typeof adminApi.outreachDrafts>>; refetch: () => unknown };
  onSelect: (draft: OutreachDraft) => void;
}) {
  if (query.isLoading) return <SectionSkeleton lines={8} />;
  if (query.isError)
    return <SectionFailure title="Draft list unavailable." description="Try refreshing this section." onRetry={() => query.refetch()} />;
  const drafts = query.data || [];
  if (!drafts.length)
    return <AdminEmptyState title="Queue empty." description="Trigger a hunt to fill the review queue." icon={Inbox} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.02]">
            {['Agency', 'Contact', 'Subject', 'Status', ''].map((h) => (
              <th key={h || 'action'} className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drafts.map((draft) => (
            <tr key={draft.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-white/10 dark:hover:bg-white/[0.03]">
              <td className="px-5 py-4">
                <button type="button" onClick={() => onSelect(draft)} className="block max-w-xs text-left">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{draft.agency_name || draft.domain}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{draft.domain}{draft.angle ? ` · ${draft.angle}` : ''}</span>
                </button>
              </td>
              <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{draft.contact_email || 'no public email'}</td>
              <td className="max-w-xs truncate px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{draft.subject}</td>
              <td className="px-5 py-4"><StatusPill status={draft.status} /></td>
              <td className="px-5 py-4 text-xs text-slate-500">{draft.sent_at ? formatAdminDate(draft.sent_at) : draft.send_error || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DraftInspector({ draft, onClose, onChanged }: {
  draft: OutreachDraft | null;
  onClose: () => void;
  onChanged: () => unknown;
}) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('');
  const activeSubject = subject ?? draft?.subject ?? '';
  const activeBody = body ?? draft?.body_text ?? '';
  const templatesQuery = useQuery({
    queryKey: ['admin', 'email-center', 'templates'],
    queryFn: adminApi.emailTemplates,
    enabled: Boolean(draft),
    staleTime: 60_000,
  });
  const outreachTemplates = (templatesQuery.data ?? []).filter((template) =>
    template.html_body.includes('rs-outreach-studio-v1')
  );

  useEffect(() => {
    setSubject(null);
    setBody(null);
    setTemplateId('');
  }, [draft?.id]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = outreachTemplates.find((item) => item.id === id);
    if (!template || !draft) return;
    const values = {
      company: draft.agency_name || draft.domain || '',
      organization: draft.agency_name || draft.domain || '',
      agency_name: draft.agency_name || draft.domain || '',
      domain: draft.domain || '',
      website: draft.domain || '',
      contact_email: draft.contact_email || '',
    };
    setSubject(renderEmailVariables(template.subject, values));
    setBody(renderEmailVariables(template.text_body || '', values));
    toast.success('Outreach template applied', { description: 'Available lead details were merged. Review any remaining tokens before saving.' });
  };

  const save = useMutation({
    mutationFn: (data: { subject?: string; body_text?: string; status?: string }) =>
      adminApi.outreachReviewDraft(draft!.id, data),
    onSuccess: async (_updatedDraft, data) => {
      toast.success('Draft updated.');
      if (data.subject !== undefined) setSubject(data.subject);
      if (data.body_text !== undefined) setBody(data.body_text);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'outreach'] });
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message || 'Update failed.'),
  });
  const send = useMutation({
    mutationFn: () => adminApi.outreachSendDraft(draft!.id),
    onSuccess: async () => {
      toast.success('Sent.');
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['admin', 'outreach'] });
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message || 'Send blocked - see queue for reason.'),
  });

  return (
    <Sheet open={!!draft} onOpenChange={(open) => { if (!open) { onClose(); setSubject(null); setBody(null); } }}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{draft?.agency_name || draft?.domain}</SheetTitle>
          <SheetDescription>{draft?.domain} · {draft?.contact_email || 'no public email - send disabled'}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3 px-4 sm:px-6">
          {outreachTemplates.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <label htmlFor="outreach-draft-template" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
                Start from outreach template
              </label>
              <select
                id="outreach-draft-template"
                value={templateId}
                onChange={(event) => applyTemplate(event.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-white/10 dark:bg-card dark:text-slate-100"
              >
                <option value="">Choose a saved template…</option>
                {outreachTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
              <p className="mt-1.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                Known lead details are merged in. Review any remaining tokens before saving.
              </p>
            </div>
          )}
          <Input value={activeSubject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
          <Textarea value={activeBody} onChange={(e) => setBody(e.target.value)} rows={14} aria-label="Body" />
          {draft?.send_error && <p className="text-xs text-red-600">Last send blocked: {draft.send_error}</p>}
        </div>
        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => draft && save.mutate({ subject: activeSubject, body_text: activeBody })} disabled={save.isPending}>Save edit</Button>
          <Button variant="outline" onClick={() => draft && save.mutate({ status: 'killed' })} disabled={save.isPending}>Kill</Button>
          <Button variant="outline" onClick={() => draft && save.mutate({ status: 'approved' })} disabled={save.isPending}>Approve</Button>
          <Button onClick={() => send.mutate()} disabled={send.isPending || !draft?.contact_email} className="gap-1.5">
            <Send className="size-3.5" /> Review &amp; send
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function HuntPanel({ onDone }: { onDone: () => unknown }) {
  const [urls, setUrls] = useState('');
  const hunt = useMutation({
    mutationFn: () =>
      adminApi.outreachHunt({
        urls: urls.split('\n').map((u) => u.trim()).filter(Boolean),
        seed_source: 'admin-manual',
      }),
    onSuccess: (data) => {
      toast.success(`Hunt accepted: ${data.accepted} URLs.`);
      setUrls('');
      onDone();
    },
    onError: (error: Error) => toast.error(error.message || 'Hunt failed.'),
  });
  return (
    <AdminCard>
      <div className="space-y-3 p-4 sm:p-5">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Seed URLs (one per line, max 300)</p>
        <p className="text-xs text-slate-500">Care-plan pages, geo-TLD results, partner directory profiles. Fetch → kill-first → queue. Never sends.</p>
        <Textarea value={urls} onChange={(e) => setUrls(e.target.value)} rows={6} placeholder="https://example-agency.co.uk/website-care-plans/" aria-label="Seed URLs" />
        <Button onClick={() => hunt.mutate()} disabled={hunt.isPending || !urls.trim()} className="gap-1.5">
          <Play className="size-3.5" /> Start hunt
        </Button>
      </div>
    </AdminCard>
  );
}

function QaPanel() {
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const qaQuery = useQuery({
    queryKey: ['admin', 'outreach', 'qa', asked],
    queryFn: () => adminApi.outreachQa(asked!),
    enabled: !!asked,
    staleTime: 30_000,
  });
  return (
    <AdminCard>
      <div className="space-y-3 p-4 sm:p-5">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Ask the queue in plain English</p>
        <p className="text-xs text-slate-500">Try “why were leads killed?”, “sent today?”, “show queued”.</p>
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about the queue…" aria-label="Ask about the queue" />
          <Button onClick={() => setAsked(q.trim())} disabled={!q.trim()} className="gap-1.5"><Search className="size-3.5" /> Ask</Button>
        </div>
        {qaQuery.isLoading && <SectionSkeleton lines={3} />}
        {qaQuery.data && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-white/5 dark:text-slate-200">
            <p>{qaQuery.data.answer}</p>
          </div>
        )}
      </div>
    </AdminCard>
  );
}
