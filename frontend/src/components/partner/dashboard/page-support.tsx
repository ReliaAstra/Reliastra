'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { partnerApi } from '@/lib/partner-api';
import { usePartnerStore } from '@/stores/partner-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/partner/shared/status-badge';
import { cn } from '@/lib/utils';
import type {
  PartnerTicketDetailResponse,
  PartnerTicketItem,
  PartnerTicketListResponse,
} from '@/types/partner';

/** How often an open conversation re-reads the thread (live-chat feel). */
const THREAD_POLL_MS = 5_000;
const LIST_POLL_MS = 20_000;

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// --- New conversation form ---
function NewConversation({
  onCancel,
  onCreated,
  showCancel,
}: {
  onCancel: () => void;
  onCreated: (ticketId: string) => void;
  showCancel: boolean;
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      partnerApi.createSupportTicket({
        subject: subject.trim(),
        message: message.trim(),
      }),
    onSuccess: (data: PartnerTicketDetailResponse) => {
      toast.success(`Conversation ${data.ticket.ticket_number} opened`);
      onCreated(data.ticket.id);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Could not start the conversation'),
  });

  const disabled = subject.trim().length === 0 || message.trim().length < 10;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border/60 bg-background p-5 md:p-6"
    >
      <h2 className="text-sm font-semibold">Start a conversation</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Your message goes straight to the RELIASTRA support desk. Replies appear
        right here — and you&apos;ll get a notification when one arrives.
      </p>

      <div className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="support-subject" className="text-xs font-mono uppercase tracking-wide">
            Subject
          </Label>
          <Input
            id="support-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Payout issue, commission question…"
            maxLength={200}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="support-message" className="text-xs font-mono uppercase tracking-wide">
            Message
          </Label>
          <Textarea
            id="support-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell us what's happening (at least 10 characters)…"
            rows={5}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => mutation.mutate()} disabled={disabled || mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Sending
              </>
            ) : (
              'Send message'
            )}
          </Button>
          {showCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={mutation.isPending}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// --- Live thread ---
function Thread({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, isError } = useQuery<PartnerTicketDetailResponse>({
    queryKey: ['partner-support-thread', ticketId],
    queryFn: () => partnerApi.getSupportThread(ticketId),
    // Polling is what makes the conversation live in both directions: the
    // admin replies from /admin/support and it lands here within seconds.
    refetchInterval: THREAD_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const messages = data?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: (body: string) => partnerApi.sendSupportMessage(ticketId, body),
    onSuccess: async () => {
      setDraft('');
      await queryClient.invalidateQueries({ queryKey: ['partner-support-thread', ticketId] });
      await queryClient.invalidateQueries({ queryKey: ['partner-support-tickets'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Message not sent'),
  });

  const send = useCallback(() => {
    const body = draft.trim();
    if (!body || sendMutation.isPending) return;
    sendMutation.mutate(body);
  }, [draft, sendMutation]);

  return (
    <div className="max-w-3xl space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All conversations
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">
            {data?.ticket.subject || 'Conversation'}
          </h1>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {data?.ticket.ticket_number}
          </p>
        </div>
        {data && <StatusBadge status={data.ticket.status} />}
      </div>

      <div className="flex h-[52vh] min-h-[320px] flex-col overflow-y-auto rounded-lg border border-border/60 bg-background p-4 md:p-5">
        {isLoading && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        )}
        {isError && (
          <p className="m-auto text-sm text-muted-foreground">
            Unable to load this conversation.
          </p>
        )}
        <div className="space-y-3">
          {messages.map((message) => {
            const mine = message.sender_type === 'user';
            return (
              <div
                key={message.id}
                className={cn('flex', mine ? 'justify-end' : 'justify-start')}
              >
                <div className={cn('max-w-[85%] space-y-1', mine ? 'items-end' : 'items-start')}>
                  <div
                    className={cn(
                      'flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide text-muted-foreground',
                      mine && 'justify-end'
                    )}
                  >
                    {!mine && <ShieldCheck className="size-3" />}
                    <span>{mine ? 'You' : message.sender_name || 'RELIASTRA Support'}</span>
                    <span>· {timeLabel(message.created_at)}</span>
                  </div>
                  <div
                    className={cn(
                      'whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
                      mine
                        ? 'bg-foreground text-background'
                        : 'border border-border/60 bg-muted/40'
                    )}
                  >
                    {message.body}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Write a reply… (Enter to send, Shift+Enter for a new line)"
          rows={2}
          className="resize-none"
        />
        <Button onClick={send} disabled={!draft.trim() || sendMutation.isPending}>
          {sendMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

// --- Conversation list ---
function ConversationList({
  items,
  onOpen,
  onNew,
}: {
  items: PartnerTicketItem[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Support</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Talk to the RELIASTRA team. Replies arrive live in this dashboard.
          </p>
        </div>
        <Button onClick={onNew} size="sm">
          <Plus className="mr-1.5 size-3.5" />
          New conversation
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
        {items.map((ticket) => (
          <button
            key={ticket.id}
            onClick={() => onOpen(ticket.id)}
            className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/30 md:px-5"
          >
            <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{ticket.subject}</p>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {ticket.ticket_number}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {ticket.last_sender_type === 'admin' ? 'RELIASTRA: ' : 'You: '}
                {ticket.last_message_preview}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <StatusBadge status={ticket.status} />
              <span className="font-mono text-[10px] text-muted-foreground">
                {timeLabel(ticket.last_message_at)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PageSupportDesk() {
  const user = usePartnerStore((s) => s.user);
  const [activeTicket, setActiveTicket] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PartnerTicketListResponse>({
    queryKey: ['partner-support-tickets'],
    queryFn: () => partnerApi.getSupportTickets(1, 50),
    refetchInterval: LIST_POLL_MS,
    staleTime: 10_000,
  });

  const items = data?.items ?? [];

  const handleCreated = async (ticketId: string) => {
    setComposing(false);
    setActiveTicket(ticketId);
    await queryClient.invalidateQueries({ queryKey: ['partner-support-tickets'] });
  };

  if (activeTicket) {
    return <Thread ticketId={activeTicket} onBack={() => setActiveTicket(null)} />;
  }

  if (isLoading) {
    return (
      <div className="flex max-w-3xl items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (composing || items.length === 0) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Support</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {user?.email || 'your partner account'} — we&apos;ll reply
            in this dashboard and by email.
          </p>
        </div>
        <NewConversation
          onCancel={() => setComposing(false)}
          onCreated={handleCreated}
          showCancel={items.length > 0}
        />
      </div>
    );
  }

  return (
    <ConversationList
      items={items}
      onOpen={setActiveTicket}
      onNew={() => setComposing(true)}
    />
  );
}
