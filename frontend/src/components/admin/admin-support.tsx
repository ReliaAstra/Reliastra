'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  CircleAlert,
  CornerDownLeft,
  Filter,
  Mail,
  MailCheck,
  MessageSquarePlus,
  Search,
  Send,
  StickyNote,
  UserRound,
  UserRoundX,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/admin-api';
import { formatAdminDate, formatCompactNumber, formatRelativeTime, humanize } from '@/lib/admin-utils';
import { cn } from '@/lib/utils';
import type {
  FeedbackMessage,
  FeedbackTicket,
  SupportTicketWorkspaceResponse,
} from '@/types/admin';
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  ImpactDialog,
  MetricCard,
  Pagination,
  SectionFailure,
  SectionHeading,
  SectionSkeleton,
  StatusPill,
} from '@/components/admin/admin-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { SupportNotificationControl } from '@/components/admin/support-notification-control';

const PAGE_SIZE = 20;

/**
 * The support inbox.
 *
 * Support is email. There is no conversation surface here any more: a
 * customer's message arrives as mail, an operator reads it and answers, and
 * the answer goes back out as mail. Nothing polls a thread, nothing waits for
 * the other side to have the page open, and the reply box is the fastest path
 * from "read it" to "answered".
 *
 * Live behaviour that remains is deliberate and one-directional: the shell
 * watches `GET /v1/admin/support/alerts` (see `SupportAlertWatcher`) and raises
 * a Chrome notification so a new email finds an operator wherever they are in
 * the console. Reading a ticket does not subscribe to anything.
 */
export function SupportPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const [selected, setSelected] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const page = Math.max(1, Number(params.get('page') || 1));
  const status = params.get('status') || 'all';
  const priority = params.get('priority') || 'all';

  useEffect(() => setSearch(params.get('search') || ''), [params]);
  useEffect(() => setSelected([]), [page, status, priority, params]);

  const updateUrl = (changes: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
    });
    router.replace(`/admin/support${next.size ? `?${next.toString()}` : ''}`, { scroll: false });
  };

  const ticketParams = useMemo(() => ({
    status: status === 'all' ? undefined : status,
    priority: priority === 'all' ? undefined : priority,
    search: params.get('search') || undefined,
    page,
    page_size: PAGE_SIZE,
  }), [page, params, priority, status]);

  // Fetched on demand, not on a timer: the alert watcher in the shell is what
  // tells this page that something new exists.
  const overviewQuery = useQuery({ queryKey: ['admin', 'support', 'overview'], queryFn: adminApi.supportOverview, staleTime: 30_000 });
  const ticketsQuery = useQuery({ queryKey: ['admin', 'support', 'tickets', ticketParams], queryFn: () => adminApi.tickets(ticketParams), staleTime: 15_000 });
  const queryClient = useQueryClient();
  const bulkMutation = useMutation({
    mutationFn: () => adminApi.bulkUpdateTickets({ ticket_ids: selected, status: 'resolved' }),
    onSuccess: async (result) => {
      toast.success(result.message);
      setSelected([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'support'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update tickets'),
  });

  const refresh = () => {
    overviewQuery.refetch();
    ticketsQuery.refetch();
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    updateUrl({ search: search.trim() || null, page: null });
  };

  const toggleSelected = (ticketId: string) => setSelected((current) => current.includes(ticketId) ? current.filter((id) => id !== ticketId) : [...current, ticketId]);
  const visibleIds = ticketsQuery.data?.items.map((ticket) => ticket.id) || [];
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Support"
        title="Support inbox"
        description="Every customer email, newest first. Answer from here - the reply is emailed to the requester immediately and recorded on the ticket."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SupportNotificationControl />
            <Button size="sm" variant="outline" onClick={refresh} disabled={ticketsQuery.isFetching}>
              {ticketsQuery.isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="gap-1.5"><MessageSquarePlus className="size-3.5" /> New ticket</Button>
          </div>
        }
      />
      <SupportMetrics query={overviewQuery} onFilter={(changes) => updateUrl(changes)} />
      <AdminCard>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-white/10 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2 lg:max-w-lg"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ticket, customer, or subject" className="h-10 pl-9" /></div><Button type="submit" variant="outline" className="h-10">Search</Button></form>
          <div className="flex flex-wrap items-center gap-2"><QueueSelect value={status} onValueChange={(value) => updateUrl({ status: value, page: null })} label="Status" options={[['all', 'All status'], ['open', 'Open'], ['in_progress', 'In progress'], ['pending', 'Pending'], ['waiting_on_customer', 'Waiting on customer'], ['waiting_on_agent', 'Waiting on agent'], ['resolved', 'Resolved']]} /><QueueSelect value={priority} onValueChange={(value) => updateUrl({ priority: value, page: null })} label="Priority" options={[['all', 'All priority'], ['urgent', 'Urgent'], ['critical', 'Critical'], ['high', 'High'], ['normal', 'Normal'], ['low', 'Low']]} /></div>
        </div>
        {selected.length > 0 && <div className="flex flex-col gap-3 border-b border-blue-100 bg-blue-50/60 px-4 py-3 dark:border-blue-500/15 dark:bg-blue-500/[0.05] sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-sm text-blue-900 dark:text-blue-100"><strong>{selected.length}</strong> ticket{selected.length === 1 ? '' : 's'} selected</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setSelected([])}>Clear</Button><Button size="sm" onClick={() => setBulkConfirmOpen(true)} className="gap-1.5"><CheckCheck className="size-3.5" /> Mark resolved</Button></div></div>}
        {ticketsQuery.isLoading && <SectionSkeleton lines={8} />}
        {ticketsQuery.isError && <SectionFailure title="Support inbox unavailable." description="Tickets could not be loaded. Try again without leaving the rest of admin." onRetry={() => ticketsQuery.refetch()} />}
        {ticketsQuery.data && ticketsQuery.data.items.length === 0 && <AdminEmptyState title={params.get('search') || status !== 'all' || priority !== 'all' ? 'No tickets match these filters.' : 'Inbox is clear.'} description={params.get('search') || status !== 'all' || priority !== 'all' ? 'Try broadening the filters to see more of the queue.' : 'New customer emails will appear here the moment they arrive.'} icon={Mail} />}
        {ticketsQuery.data && ticketsQuery.data.items.length > 0 && <SupportTable items={ticketsQuery.data.items} selected={selected} allSelected={allSelected} onToggle={toggleSelected} onToggleAll={() => setSelected(allSelected ? selected.filter((id) => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])])} />}
        {ticketsQuery.data && <Pagination page={ticketsQuery.data.page} pageSize={ticketsQuery.data.page_size} total={ticketsQuery.data.total} onPageChange={(nextPage) => updateUrl({ page: String(nextPage) })} />}
      </AdminCard>
      <CreateTicketSheet open={createOpen} onOpenChange={setCreateOpen} />
      <ImpactDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen} title="Resolve selected support tickets?" description="This bulk action waits for backend confirmation and will be recorded in the audit trail." what={`${selected.length} selected ticket${selected.length === 1 ? '' : 's'}`} why="Close tickets that have been resolved or no longer need an active response." impact="Their server status changes to resolved. Queue and support overview counts refresh from RELIASTRA after the action." confirmLabel="Resolve selected tickets" onConfirm={() => bulkMutation.mutateAsync()} />
    </div>
  );
}

function SupportMetrics({ query, onFilter }: { query: { isLoading: boolean; isError: boolean; data?: Awaited<ReturnType<typeof adminApi.supportOverview>>; refetch: () => unknown }; onFilter: (changes: Record<string, string | null>) => void }) {
  if (query.isLoading) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" />)}</div>;
  if (query.isError) return <AdminCard><SectionFailure title="Support triage overview unavailable." description="The inbox below can still be retried independently." onRetry={() => query.refetch()} /></AdminCard>;
  const data = query.data;
  if (!data) return null;
  const cards: Array<{
    label: string;
    value: number;
    onClick: () => void;
    icon: typeof CircleAlert;
    context: string;
  }> = [
    { label: 'Urgent', value: data.urgent, onClick: () => onFilter({ priority: 'urgent', page: null }), icon: CircleAlert, context: 'high priority or above' },
    { label: 'Open', value: data.open, onClick: () => onFilter({ status: 'open', page: null }), icon: Mail, context: 'current queue' },
    { label: 'Unassigned', value: data.unassigned, onClick: () => onFilter({ status: 'open', page: null }), icon: UserRoundX, context: 'open without assignee' },
    { label: 'Waiting on us', value: data.waiting_on_agent, onClick: () => onFilter({ status: 'waiting_on_agent', page: null }), icon: MailCheck, context: 'answered next' },
  ];
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, onClick, icon: Icon, context }) => <button key={label} type="button" onClick={onClick} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><MetricCard label={label} value={formatCompactNumber(value)} context={context} icon={Icon} tone={value > 0 && label === 'Urgent' ? 'attention' : 'default'} /></button>)}</section>;
}

function QueueSelect({ value, onValueChange, label, options }: { value: string; onValueChange: (value: string) => void; label: string; options: Array<[string, string]> }) {
  return <Select value={value} onValueChange={onValueChange}><SelectTrigger size="sm" className="gap-1.5 text-xs"><Filter className="size-3" /><SelectValue placeholder={label} /></SelectTrigger><SelectContent>{options.map(([option, labelText]) => <SelectItem key={option} value={option}>{labelText}</SelectItem>)}</SelectContent></Select>;
}

function SupportTable({ items, selected, allSelected, onToggle, onToggleAll }: { items: FeedbackTicket[]; selected: string[]; allSelected: boolean; onToggle: (id: string) => void; onToggleAll: () => void }) {
  return <><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left"><thead><tr className="border-b border-slate-100 bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.02]"><th className="w-10 px-4 py-2.5"><Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="Select all visible tickets" /></th>{['Email', 'From', 'Priority', 'Status', 'Received', ''].map((heading) => <th key={heading || 'action'} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{heading}</th>)}</tr></thead><tbody>{items.map((ticket) => <tr key={ticket.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-white/10 dark:hover:bg-white/[0.03]"><td className="px-4 py-4"><Checkbox checked={selected.includes(ticket.id)} onCheckedChange={() => onToggle(ticket.id)} aria-label={`Select ${ticket.ticket_number}`} /></td><td className="px-4 py-4"><Link href={`/admin/support/${ticket.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><span className="block max-w-sm truncate text-sm font-medium text-slate-800 dark:text-slate-100">{ticket.subject}</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{ticket.ticket_number} · {humanize(ticket.category)}{ticket.source ? ` · ${humanize(ticket.source)}` : ''}</span></Link></td><td className="px-4 py-4"><span className="block text-sm text-slate-700 dark:text-slate-200">{ticket.full_name || ticket.email}</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{ticket.email}</span></td><td className="px-4 py-4"><StatusPill status={ticket.priority} /></td><td className="px-4 py-4"><StatusPill status={ticket.status} /></td><td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">{formatRelativeTime(ticket.created_at)}</td><td className="px-4 py-4"><Link href={`/admin/support/${ticket.id}`} className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:hover:bg-white/10 dark:hover:text-white" aria-label={`Open ${ticket.ticket_number}`}><ArrowRight className="size-3.5" /></Link></td></tr>)}</tbody></table></div><div className="divide-y divide-slate-100 md:hidden dark:divide-white/10">{items.map((ticket) => <div key={ticket.id} className="flex gap-3 px-4 py-4"><Checkbox checked={selected.includes(ticket.id)} onCheckedChange={() => onToggle(ticket.id)} aria-label={`Select ${ticket.ticket_number}`} className="mt-1" /><Link href={`/admin/support/${ticket.id}`} className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{ticket.subject}</p><StatusPill status={ticket.priority} /></div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{ticket.ticket_number} · {ticket.full_name || ticket.email}</p><div className="mt-3 flex items-center justify-between"><StatusPill status={ticket.status} /><span className="text-xs text-slate-400">{formatRelativeTime(ticket.created_at)}</span></div></Link></div>)}</div></>;
}

export function SupportTicketPage({ ticketId }: { ticketId: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const [lastSent, setLastSent] = useState<{ to: string; at: Date } | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Fetched on demand. An open ticket does not subscribe to anything: the
  // answer is sent, not published, and the inbox refresh (driven by the alert
  // watcher) is what surfaces a follow-up email.
  const workspaceQuery = useQuery({ queryKey: ['admin', 'support', 'ticket', ticketId], queryFn: () => adminApi.ticket(ticketId), staleTime: 10_000, refetchOnWindowFocus: true });
  const invalidate = async () => Promise.all([queryClient.invalidateQueries({ queryKey: ['admin', 'support', 'ticket', ticketId] }), queryClient.invalidateQueries({ queryKey: ['admin', 'support', 'tickets'] }), queryClient.invalidateQueries({ queryKey: ['admin', 'support', 'overview'] }), queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }), queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] })]);
  const updateMutation = useMutation({ mutationFn: (data: { status?: string; priority?: string }) => adminApi.updateTicket(ticketId, data), onSuccess: async () => { toast.success('Ticket updated'); await invalidate(); }, onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update ticket') });
  const replyMutation = useMutation({
    mutationFn: () => adminApi.replyToTicket(ticketId, { body: message.trim(), is_internal_note: internalNote }),
    onSuccess: async (result) => {
      setMessage('');
      if (result.is_internal_note) {
        toast.success('Internal note saved', { description: 'Not emailed - only admins can see it.' });
      } else if (result.emailed) {
        setLastSent({ to: result.emailed_to || 'the requester', at: new Date() });
        toast.success(`Reply emailed to ${result.emailed_to}`, { description: 'The answer is on its way to their inbox.' });
      } else {
        toast.warning('Reply saved, but not emailed', { description: 'The mail provider did not accept it. Copy the text and send it another way.' });
      }
      await invalidate();
      composerRef.current?.focus();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not send the reply'),
  });

  if (workspaceQuery.isLoading) return <SupportWorkspaceSkeleton />;
  if (workspaceQuery.isError || !workspaceQuery.data) return <div className="space-y-5"><Link href="/admin/support" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"><ArrowLeft className="size-3.5" /> Support inbox</Link><AdminCard><SectionFailure title="Support workspace unavailable." description="This ticket could not be loaded." onRetry={() => workspaceQuery.refetch()} /></AdminCard></div>;
  const data = workspaceQuery.data;
  const ticket = data.ticket;
  const canSend = message.trim().length > 0 && !replyMutation.isPending;

  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><Link href="/admin/support" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-slate-400 dark:hover:text-white"><ArrowLeft className="size-3.5" /> Support inbox</Link><div className="flex items-center gap-2"><TicketSelect label="Status" value={ticket.status} options={['open', 'in_progress', 'pending', 'waiting_on_customer', 'waiting_on_agent', 'resolved']} onValueChange={(status) => updateMutation.mutate({ status })} /><TicketSelect label="Priority" value={ticket.priority} options={['urgent', 'critical', 'high', 'normal', 'low']} onValueChange={(priority) => updateMutation.mutate({ priority })} /></div></div><AdminCard><div className="p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">{ticket.ticket_number} · {humanize(ticket.category)} · arrived {formatRelativeTime(ticket.created_at)}</p><div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><h1 className="max-w-3xl text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white sm:text-3xl">{ticket.subject}</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">From {ticket.full_name || ticket.email} &lt;{ticket.email}&gt;</p></div><div className="flex gap-2"><StatusPill status={ticket.priority} /><StatusPill status={ticket.status} /></div></div></div></AdminCard><div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_360px]"><div className="space-y-5"><EmailThread data={data} /><ReplyComposer ticket={ticket} data={data} message={message} onMessageChange={setMessage} internalNote={internalNote} onInternalNoteChange={setInternalNote} onSubmit={() => replyMutation.mutate()} submitting={replyMutation.isPending} canSend={canSend} composerRef={composerRef} lastSent={lastSent} /></div><CustomerContext data={data} /></div></div>;
}

function TicketSelect({ label, value, options, onValueChange }: { label: string; value: string; options: string[]; onValueChange: (value: string) => void }) {
  return <Select value={value} onValueChange={onValueChange}><SelectTrigger size="sm" className="min-w-[110px] text-xs"><SelectValue placeholder={label} /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{humanize(option)}</SelectItem>)}</SelectContent></Select>;
}

type EmailEntry = {
  id: string;
  direction: 'received' | 'sent';
  from: string;
  to: string;
  subject: string;
  body: string;
  at: string;
  internal?: boolean;
};

/**
 * The ticket's email history, in the order the mail went back and forth.
 *
 * Rendered as mail, not as chat: each entry names its sender and recipient and
 * prints the message as written. A legacy message written from the console
 * thread (before support became email-only) still reads correctly here - it
 * shows as what it was, a message received from the customer.
 */
function EmailThread({ data }: { data: SupportTicketWorkspaceResponse }) {
  const { ticket, messages } = data;
  const original: EmailEntry = {
    id: 'original',
    direction: 'received',
    from: ticket.full_name ? `${ticket.full_name} <${ticket.email}>` : ticket.email,
    to: 'support@reliastra.com',
    subject: ticket.subject,
    body: ticket.body,
    at: ticket.created_at,
  };
  const entries: EmailEntry[] = [
    original,
    ...messages.map((entry: FeedbackMessage): EmailEntry => {
      const sent = entry.sender_type === 'admin';
      return {
        id: entry.id,
        direction: sent ? 'sent' : 'received',
        from: sent ? entry.sender_name : `${entry.sender_name} <${ticket.email}>`,
        to: sent ? ticket.email : 'support@reliastra.com',
        subject: sent ? `Re: ${ticket.subject}` : ticket.subject,
        body: entry.body,
        at: entry.created_at,
        internal: entry.is_internal_note,
      };
    }),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <AdminCard>
      <SectionHeading title="Email history" subtitle="Everything received and everything sent" />
      <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/10 dark:border-white/10">
        {entries.map((entry) => <EmailEntryCard key={entry.id} entry={entry} />)}
      </div>
    </AdminCard>
  );
}

function EmailEntryCard({ entry }: { entry: EmailEntry }) {
  const sent = entry.direction === 'sent';
  return (
    <article className={cn('px-5 py-5 sm:px-6', entry.internal && 'bg-amber-50/50 dark:bg-amber-500/[0.06]')}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]', sent ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300')}>
            {sent ? <Send className="size-3" /> : <Mail className="size-3" />}
            {entry.internal ? 'Internal note' : sent ? 'Sent' : 'Received'}
          </span>
          {sent && !entry.internal && <span className="text-xs text-slate-400">emailed to {entry.to}</span>}
          {entry.internal && <span className="text-xs text-amber-700 dark:text-amber-300">never emailed</span>}
        </div>
        <span className="text-[11px] text-slate-400">{formatAdminDate(entry.at)}</span>
      </header>
      <p className="mt-3 truncate text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium text-slate-600 dark:text-slate-300">{entry.from}</span>
        {entry.internal ? '' : ` → ${entry.to}`} · {entry.subject}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{entry.body}</p>
    </article>
  );
}

const QUICK_REPLIES: Array<{ label: string; body: string }> = [
  { label: 'Acknowledged', body: 'Thanks for the detail - I have it and I am looking into this now. I will follow up by email as soon as I have an answer.' },
  { label: 'Need the window', body: 'To pin this down I need the UTC window you saw the failure in and which dependency it concerns. Send those and I will check the record and reply with what the measurements show.' },
  { label: 'Resolved', body: 'This is fixed on our side. Please re-check and reply to this email if anything still looks wrong.' },
];

function ReplyComposer({ ticket, data, message, onMessageChange, internalNote, onInternalNoteChange, onSubmit, submitting, canSend, composerRef, lastSent }: {
  ticket: FeedbackTicket;
  data: SupportTicketWorkspaceResponse;
  message: string;
  onMessageChange: (value: string) => void;
  internalNote: boolean;
  onInternalNoteChange: (value: boolean) => void;
  onSubmit: () => void;
  submitting: boolean;
  canSend: boolean;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  lastSent: { to: string; at: Date } | null;
}) {
  const alreadyAnswered = data.messages.some((entry) => entry.sender_type === 'admin' && !entry.is_internal_note);

  // Land ready to type. The notification and the toast both deep-link straight
  // here, so an unanswered ticket must not open with the caret nowhere: the
  // whole point of the alert is that the answer can be written immediately.
  useEffect(() => {
    if (!alreadyAnswered) composerRef.current?.focus();
  }, [alreadyAnswered, composerRef]);

  return (
    <AdminCard>
      <SectionHeading
        title={internalNote ? 'Internal note' : 'Reply by email'}
        subtitle={internalNote ? 'Visible to admins only - never emailed' : `Sends to ${ticket.email} the moment you submit`}
        action={
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => onInternalNoteChange(false)} className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600', !internalNote ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5')}>
              <Zap className="mr-1 inline size-3" />Reply
            </button>
            <button type="button" onClick={() => onInternalNoteChange(true)} className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600', internalNote ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5')}>
              <StickyNote className="mr-1 inline size-3" />Internal note
            </button>
          </div>
        }
      />
      <div className="border-t border-slate-100 p-4 dark:border-white/10 sm:p-5">
        {!internalNote && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {QUICK_REPLIES.map((reply) => (
              <button key={reply.label} type="button" onClick={() => onMessageChange(reply.body)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5">
                {reply.label}
              </button>
            ))}
            <span className="text-[11px] text-slate-400">Starting points - edit before sending.</span>
          </div>
        )}
        <Textarea
          ref={composerRef}
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && canSend) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={internalNote ? 'Leave an internal note for the team…' : `Write the answer to ${ticket.full_name || ticket.email}…`}
          className={cn('min-h-40 resize-y', internalNote && 'bg-amber-50/50 dark:bg-amber-500/[0.06]')}
          aria-label={internalNote ? 'Internal note' : 'Email reply'}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {lastSent && !internalNote ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <MailCheck className="size-3.5" /> Last reply emailed to {lastSent.to} · {formatRelativeTime(lastSent.at.toISOString())}
              </span>
            ) : alreadyAnswered ? (
              'This ticket already has an answer on record. Sending another adds to the email history.'
            ) : (
              'The requester receives this as email. Nothing needs to be open on their side.'
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 text-[11px] text-slate-400 sm:inline-flex">
              <CornerDownLeft className="size-3" /> {navigatorShortcut()} + Enter
            </span>
            <Button size="sm" disabled={!canSend} onClick={onSubmit} className="gap-1.5">
              {submitting ? 'Sending…' : internalNote ? 'Save note' : 'Send email reply'} <Send className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </AdminCard>
  );
}

/** The insert-shortcut label, resolved on the client without hydration drift. */
function navigatorShortcut() {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
}

function CustomerContext({ data }: { data: SupportTicketWorkspaceResponse }) {
  const customer = data.customer;
  const organization = data.organization;
  const customerId = typeof customer?.customer_id === 'string' ? customer.customer_id : null;
  return <div className="space-y-5"><AdminCard><SectionHeading title="Customer context" subtitle="Who you’re helping" />{!customer && <div className="border-t border-slate-100 dark:border-white/10"><AdminEmptyState title="No customer matched." description="This ticket is not linked to a customer account in the current backend snapshot." icon={UserRound} /></div>}{customer && <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/10 dark:border-white/10"><div className="px-5 py-4"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{String(customer.full_name || customer.email || 'Customer')}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{String(customer.email || '-')}</p>{customerId && <Link href={`/admin/customers/${customerId}`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300">Open customer workspace <ArrowRight className="size-3" /></Link>}</div><ContextRow label="Plan" value={humanize(String(customer.plan || 'unknown'))} /><ContextRow label="MRR" value={typeof customer.mrr === 'number' ? `$${customer.mrr.toFixed(0)}` : '-'} /><ContextRow label="Health" value={<StatusPill status={String(customer.health || 'unknown')} />} /><ContextRow label="Billing" value={<StatusPill status={String(customer.billing_status || 'unknown')} />} /></div>}</AdminCard><AdminCard><SectionHeading title="Organization" subtitle="Operational context" />{organization ? <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/10 dark:border-white/10"><ContextRow label="Name" value={String(organization.org_name || '-')} /><ContextRow label="Plan" value={humanize(String(organization.plan || 'unknown'))} /><ContextRow label="Dependencies" value={formatCompactNumber(Number(organization.dependency_count || 0))} /><ContextRow label="Open incidents" value={formatCompactNumber(Number(organization.open_incidents || 0))} /></div> : <div className="border-t border-slate-100 dark:border-white/10"><AdminEmptyState title="No organization context." description="No primary organization is linked to this ticket." icon={UserRound} /></div>}</AdminCard><AdminCard><SectionHeading title="Recent activity" subtitle="Account events" /> <div className="border-t border-slate-100 p-5 dark:border-white/10">{data.recent_customer_activity.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">No recent activity available.</p> : <div className="space-y-4">{data.recent_customer_activity.slice(0, 5).map((activity, index) => <div key={activity.id || `${activity.action}-${index}`}><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{humanize(activity.action)}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatRelativeTime(activity.created_at)}</p></div>)}</div>}</div></AdminCard></div>;
}

function ContextRow({ label, value }: { label: string; value: React.ReactNode }) { return <div className="flex items-center justify-between gap-4 px-5 py-3.5"><span className="text-sm text-slate-500 dark:text-slate-400">{label}</span><span className="max-w-[58%] truncate text-right text-sm font-medium text-slate-800 dark:text-slate-100">{value}</span></div>; }

function CreateTicketSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [subject, setSubject] = useState(''); const [body, setBody] = useState(''); const [priority, setPriority] = useState('normal');
  useEffect(() => { if (!open) { setEmail(''); setName(''); setSubject(''); setBody(''); setPriority('normal'); } }, [open]);
  const mutation = useMutation({ mutationFn: () => adminApi.createTicket({ email: email.trim(), full_name: name.trim() || undefined, category: 'general', subject: subject.trim(), body: body.trim(), priority, source: 'admin' }), onSuccess: async () => { toast.success('Support ticket created', { description: 'Nothing was emailed. Answer from the ticket to send a reply.' }); onOpenChange(false); await Promise.all([queryClient.invalidateQueries({ queryKey: ['admin', 'support'] }), queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] })]); }, onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not create ticket') });
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>Record a request</SheetTitle><SheetDescription>For a request that arrived another way (a call, a forwarded email). It is stored on the queue and nothing is emailed until you answer.</SheetDescription></SheetHeader><div className="flex-1 space-y-4 px-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Customer email"><Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="customer@company.com" /></Field><Field label="Customer name"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional" /></Field></div><Field label="Subject"><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What needs help?" /></Field><Field label="Priority"><Select value={priority} onValueChange={setPriority}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{['urgent', 'critical', 'high', 'normal', 'low'].map((option) => <SelectItem key={option} value={option}>{humanize(option)}</SelectItem>)}</SelectContent></Select></Field><Field label="Message"><Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Record what the customer reported…" className="min-h-44" /></Field></div><SheetFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!email.trim() || !subject.trim() || !body.trim() || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Creating…' : 'Create ticket'}</Button></SheetFooter></SheetContent></Sheet>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><label className="text-xs font-medium text-slate-700 dark:text-slate-200">{label}</label>{children}</div>; }

function SupportWorkspaceSkeleton() { return <div className="space-y-5" aria-busy="true"><div className="h-5 w-28 animate-pulse rounded bg-slate-200 dark:bg-white/10" /><div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" /><div className="grid gap-5 xl:grid-cols-[1.35fr_360px]"><div className="h-[580px] animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" /><div className="h-[500px] animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" /></div></div>; }
