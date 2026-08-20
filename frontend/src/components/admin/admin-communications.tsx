'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, BellRing, CalendarClock, Eye, FilePenLine, Megaphone, Plus, Send, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/admin-api';
import { formatAdminDate, formatCompactNumber, humanize } from '@/lib/admin-utils';
import { cn } from '@/lib/utils';
import type { EmailCampaign } from '@/types/admin';
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  ImpactDialog,
  MetricCard,
  SectionFailure,
  SectionHeading,
  SectionSkeleton,
  StatusPill,
} from '@/components/admin/admin-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export function CommunicationsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<EmailCampaign | null>(null);
  const [status, setStatus] = useState(params.get('status') || 'all');
  const overviewQuery = useQuery({ queryKey: ['admin', 'communications', 'overview'], queryFn: adminApi.communicationsOverview, staleTime: 60_000 });
  const campaignsQuery = useQuery({ queryKey: ['admin', 'communications', 'campaigns', status], queryFn: () => adminApi.campaigns({ status: status === 'all' ? undefined : status, page: 1, page_size: 50 }), staleTime: 60_000 });
  const announcementsQuery = useQuery({ queryKey: ['admin', 'communications', 'announcements'], queryFn: () => adminApi.announcements({ page: 1, page_size: 20 }), staleTime: 60_000 });

  useEffect(() => {
    const compose = params.get('compose');
    if (compose === 'campaign') setComposerOpen(true);
    if (compose === 'announcement') setAnnouncementOpen(true);
  }, [params]);

  useEffect(() => {
    const campaignId = params.get('campaign');
    if (campaignId && campaignsQuery.data) {
      const campaign = campaignsQuery.data.items.find((item) => item.id === campaignId);
      if (campaign) setSelectedCampaign(campaign);
    }
  }, [campaignsQuery.data, params]);

  const setQueryParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
    });
    router.replace(`/admin/communications${next.size ? `?${next.toString()}` : ''}`, { scroll: false });
  };

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'communications'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] }),
    ]);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Communications"
        title="Communications"
        description="Create focused messages with a clear audience, preview, and confirmation — not a sprawling campaign console."
        actions={<div className="flex items-center gap-2"><Button variant="outline" onClick={() => setAnnouncementOpen(true)} className="hidden gap-1.5 sm:inline-flex"><Megaphone className="size-3.5" /> Announcement</Button><Button onClick={() => setComposerOpen(true)} className="gap-1.5"><Plus className="size-3.5" /> Create communication</Button></div>}
      />
      <CommunicationsMetrics query={overviewQuery} />
      <Tabs defaultValue="campaigns">
        <TabsList className="max-w-full overflow-x-auto bg-white dark:bg-card"><TabsTrigger value="campaigns">Campaigns</TabsTrigger><TabsTrigger value="announcements">Announcements</TabsTrigger></TabsList>
        <TabsContent value="campaigns" className="mt-4"><AdminCard><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-white/10 sm:p-5"><div><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Email campaigns</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Drafts, scheduled sends, and delivery results</p></div><Select value={status} onValueChange={(value) => { setStatus(value); setQueryParam({ status: value }); }}><SelectTrigger size="sm" className="text-xs"><SelectValue /></SelectTrigger><SelectContent>{[['all', 'All campaigns'], ['draft', 'Drafts'], ['scheduled', 'Scheduled'], ['sent', 'Sent']].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><CampaignList query={campaignsQuery} onSelect={setSelectedCampaign} /></AdminCard></TabsContent>
        <TabsContent value="announcements" className="mt-4"><AnnouncementList query={announcementsQuery} onCreate={() => setAnnouncementOpen(true)} /></TabsContent>
      </Tabs>
      <CampaignComposer open={composerOpen} onOpenChange={(open) => { setComposerOpen(open); if (!open) setQueryParam({ compose: null }); }} onSaved={refresh} />
      <AnnouncementComposer open={announcementOpen} onOpenChange={(open) => { setAnnouncementOpen(open); if (!open) setQueryParam({ compose: null }); }} onSaved={refresh} />
      <CampaignInspector campaign={selectedCampaign} onOpenChange={(open) => { if (!open) { setSelectedCampaign(null); setQueryParam({ campaign: null }); } }} onSent={refresh} />
    </div>
  );
}

function CommunicationsMetrics({ query }: { query: { isLoading: boolean; isError: boolean; data?: Awaited<ReturnType<typeof adminApi.communicationsOverview>>; refetch: () => unknown } }) {
  if (query.isLoading) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" />)}</div>;
  if (query.isError) return <AdminCard><SectionFailure title="Communications overview unavailable." description="Campaign lists can still be retried independently." onRetry={() => query.refetch()} /></AdminCard>;
  if (!query.data) return null;
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><MetricCard label="Campaigns" value={formatCompactNumber(query.data.campaigns_total)} context="all campaign records" icon={Send} /><MetricCard label="Drafts" value={formatCompactNumber(query.data.drafts)} context="ready to refine" icon={FilePenLine} /><MetricCard label="Scheduled" value={formatCompactNumber(query.data.scheduled)} context="awaiting send time" icon={CalendarClock} /><MetricCard label="Sent today" value={formatCompactNumber(query.data.sent_today)} context="delivery activity" icon={BellRing} /><MetricCard label="Active announcements" value={formatCompactNumber(query.data.announcements_active)} context="in-app surfaces" icon={Megaphone} /></section>;
}

function CampaignList({ query, onSelect }: { query: { isLoading: boolean; isError: boolean; data?: Awaited<ReturnType<typeof adminApi.campaigns>>; refetch: () => unknown }; onSelect: (campaign: EmailCampaign) => void }) {
  if (query.isLoading) return <SectionSkeleton lines={8} />;
  if (query.isError) return <SectionFailure title="Campaign list unavailable." description="Try refreshing this section." onRetry={() => query.refetch()} />;
  const campaigns = query.data?.items || [];
  if (!campaigns.length) return <AdminEmptyState title="No campaigns yet." description="Create a focused communication when you have a clear audience and message." icon={Send} />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-slate-100 bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.02]">{['Campaign', 'Audience', 'Status', 'Recipients', 'Sent', ''].map((heading) => <th key={heading || 'action'} className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{heading}</th>)}</tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-white/10 dark:hover:bg-white/[0.03]"><td className="px-5 py-4"><button type="button" onClick={() => onSelect(campaign)} className="block max-w-xs text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{campaign.campaign_name}</span><span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{campaign.subject}</span></button></td><td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{campaign.segment || 'All active users'}</td><td className="px-5 py-4"><StatusPill status={campaign.status} /></td><td className="px-5 py-4 text-sm tabular-nums text-slate-600 dark:text-slate-300">{formatCompactNumber(campaign.recipient_count)}</td><td className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">{campaign.sent_at ? formatAdminDate(campaign.sent_at) : campaign.scheduled_at ? `Scheduled ${formatAdminDate(campaign.scheduled_at)}` : '—'}</td><td className="px-5 py-4"><button type="button" onClick={() => onSelect(campaign)} className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:hover:bg-white/10 dark:hover:text-white" aria-label={`Inspect ${campaign.campaign_name}`}><ArrowIcon /></button></td></tr>)}</tbody></table></div>;
}

function ArrowIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

function AnnouncementList({ query, onCreate }: { query: { isLoading: boolean; isError: boolean; data?: Awaited<ReturnType<typeof adminApi.announcements>>; refetch: () => unknown }; onCreate: () => void }) {
  return <AdminCard><SectionHeading title="Announcements" subtitle="Lean in-app messages for important product moments" action={<Button size="sm" variant="outline" onClick={onCreate} className="gap-1.5"><Plus className="size-3.5" /> Draft announcement</Button>} /><div className="border-t border-slate-100 dark:border-white/10">{query.isLoading && <SectionSkeleton lines={6} />}{query.isError && <SectionFailure title="Announcements unavailable." description="Try refreshing this section." onRetry={() => query.refetch()} />}{query.data && query.data.items.length === 0 && <AdminEmptyState title="No announcements yet." description="Once you prepare an in-app message, its lifecycle and delivery signals will appear here." icon={Megaphone} />}{query.data && query.data.items.length > 0 && <div className="divide-y divide-slate-100 dark:divide-white/10">{query.data.items.map((announcement) => <div key={announcement.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{announcement.title}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{humanize(announcement.placement)} · {formatCompactNumber(announcement.impression_count)} impressions · created {formatAdminDate(announcement.created_at)}</p></div><StatusPill status={announcement.is_active ? 'active' : 'draft'} /></div>)}</div>}</div></AdminCard>;
}

function CampaignComposer({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(''); const [segment, setSegment] = useState(''); const [subject, setSubject] = useState(''); const [body, setBody] = useState(''); const [schedule, setSchedule] = useState('');
  const mutation = useMutation({ mutationFn: () => adminApi.createCampaign({ campaign_name: name.trim(), subject: subject.trim(), body_html: body.trim(), body_text: stripHtml(body).trim() || undefined, segment: segment.trim() || undefined, scheduled_at: schedule ? new Date(schedule).toISOString() : undefined }), onSuccess: async () => { toast.success('Campaign draft saved'); await onSaved(); onOpenChange(false); }, onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save campaign') });
  useEffect(() => { if (!open) { setStep(1); setName(''); setSegment(''); setSubject(''); setBody(''); setSchedule(''); } }, [open]);
  const valid = step === 1 ? Boolean(name.trim()) : step === 2 ? Boolean(subject.trim() && body.trim()) : true;
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto sm:max-w-2xl"><SheetHeader><SheetTitle>Create communication</SheetTitle><SheetDescription>A focused four-step workflow. Advanced campaign mechanics remain out of the way.</SheetDescription></SheetHeader><div className="px-4"><ol className="mb-7 grid grid-cols-4 gap-2">{['Audience', 'Content', 'Preview', 'Schedule'].map((label, index) => <li key={label} className="min-w-0"><div className={cn('h-1 rounded-full', index + 1 <= step ? 'bg-blue-600' : 'bg-slate-200 dark:bg-white/10')} /><p className={cn('mt-2 truncate text-[10px] font-semibold uppercase tracking-[0.1em]', index + 1 === step ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400')}>{index + 1}. {label}</p></li>)}</ol>{step === 1 && <div className="space-y-5"><Field label="Campaign name"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. August product update" /></Field><Field label="Audience segment"><Input value={segment} onChange={(event) => setSegment(event.target.value)} placeholder="Optional backend segment identifier; leave blank for the default audience" /></Field><div className="rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-600 dark:bg-white/[0.03] dark:text-slate-300">The backend stores the segment on the campaign. Actual recipient count is determined server-side at send time.</div></div>}{step === 2 && <div className="space-y-5"><Field label="Subject"><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="A clear, useful subject line" /></Field><Field label="Content"><Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write the message HTML or text…" className="min-h-64 font-mono text-xs leading-6" /></Field></div>}{step === 3 && <div className="space-y-4"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.02]"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Recipients</p><p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{segment.trim() || 'Default active-user audience (resolved by backend when sent)'}</p><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Subject</p><p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{subject}</p></div><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Preview</p><PreviewFrame html={body} /></div></div>}{step === 4 && <div className="space-y-5"><Field label="Optional schedule"><Input type="datetime-local" value={schedule} onChange={(event) => setSchedule(event.target.value)} /></Field><div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">Save this as a draft now. Sending remains a separate confirmed action after the backend returns a campaign and recipient count.</div></div>}</div><SheetFooter><Button variant="outline" onClick={() => step === 1 ? onOpenChange(false) : setStep(step - 1)}>{step === 1 ? 'Cancel' : 'Back'}</Button>{step < 4 ? <Button disabled={!valid} onClick={() => setStep(step + 1)}>Continue</Button> : <Button disabled={mutation.isPending || !name.trim() || !subject.trim() || !body.trim()} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Saving…' : 'Save campaign draft'}</Button>}</SheetFooter></SheetContent></Sheet>;
}

function CampaignInspector({ campaign, onOpenChange, onSent }: { campaign: EmailCampaign | null; onOpenChange: (open: boolean) => void; onSent: () => Promise<void> }) {
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const mutation = useMutation({ mutationFn: () => campaign ? adminApi.sendCampaign(campaign.id) : Promise.reject(new Error('Campaign not found')), onSuccess: async (result) => { toast.success(result.message); setSendConfirmOpen(false); onOpenChange(false); await onSent(); }, onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not send campaign') });
  return <><Sheet open={Boolean(campaign)} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto sm:max-w-2xl"><SheetHeader><SheetTitle>{campaign?.campaign_name || 'Campaign'}</SheetTitle><SheetDescription>{campaign?.subject}</SheetDescription></SheetHeader>{campaign && <div className="flex-1 space-y-5 px-4"><div className="grid gap-3 sm:grid-cols-3"><Info label="Status" value={<StatusPill status={campaign.status} />} /><Info label="Audience" value={campaign.segment || 'Default active-user audience'} /><Info label="Recorded recipients" value={formatCompactNumber(campaign.recipient_count)} /></div><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Message preview</p><PreviewFrame html={campaign.body_html} /></div><div className="grid gap-3 rounded-lg border border-slate-200 p-4 text-sm dark:border-white/10 sm:grid-cols-3"><Info label="Sent" value={formatCompactNumber(campaign.sent_count)} /><Info label="Opened" value={formatCompactNumber(campaign.opened_count)} /><Info label="Clicked" value={formatCompactNumber(campaign.clicked_count)} /></div></div>}<SheetFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>{campaign?.status !== 'sent' && <Button onClick={() => setSendConfirmOpen(true)} className="gap-1.5"><Send className="size-3.5" /> Send campaign</Button>}</SheetFooter></SheetContent></Sheet>{campaign && <ImpactDialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen} title="Send this campaign?" description="Email delivery is a high-impact communication action and is audited by RELIASTRA." what={<>{campaign.campaign_name}: “{campaign.subject}”</>} why="Send the reviewed communication to its configured audience." impact={`The backend resolves active recipients at send time. Recorded recipient count before send: ${formatCompactNumber(campaign.recipient_count)}. This action cannot be undone through the dashboard.`} confirmLabel="Send campaign" onConfirm={() => mutation.mutateAsync()} />}</>;
}

function AnnouncementComposer({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [placement, setPlacement] = useState('top_banner');
  const mutation = useMutation({ mutationFn: () => adminApi.createAnnouncement({ title: title.trim(), body_html: body.trim(), placement }), onSuccess: async () => { toast.success('Announcement draft created'); await onSaved(); onOpenChange(false); }, onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not create announcement') });
  useEffect(() => { if (!open) { setTitle(''); setBody(''); setPlacement('top_banner'); } }, [open]);
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>Draft announcement</SheetTitle><SheetDescription>Prepare an in-app message. Backend lifecycle controls remain authoritative.</SheetDescription></SheetHeader><div className="flex-1 space-y-4 px-4"><Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What should customers know?" /></Field><Field label="Placement"><Select value={placement} onValueChange={setPlacement}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="top_banner">Top banner</SelectItem><SelectItem value="modal">Modal</SelectItem><SelectItem value="dashboard">Dashboard</SelectItem></SelectContent></Select></Field><Field label="Body"><Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Announcement HTML or text…" className="min-h-48" /></Field></div><SheetFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!title.trim() || !body.trim() || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Creating…' : 'Create draft'}</Button></SheetFooter></SheetContent></Sheet>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><label className="text-xs font-medium text-slate-700 dark:text-slate-200">{label}</label>{children}</div>; }
function Info({ label, value }: { label: string; value: React.ReactNode }) { return <div><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</p><div className="mt-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">{value}</div></div>; }
function PreviewFrame({ html }: { html: string }) { return <iframe title="Communication preview" sandbox="" srcDoc={`<!doctype html><html><head><style>body{margin:0;padding:22px;color:#1e293b;font:14px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}img{max-width:100%;height:auto}a{color:#2563eb}</style></head><body>${html || '<p style="color:#94a3b8">Your message preview will appear here.</p>'}</body></html>`} className="h-56 w-full rounded-lg border border-slate-200 bg-white dark:border-white/10" />; }
function stripHtml(input: string) { return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '); }
