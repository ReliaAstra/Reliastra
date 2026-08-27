'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquarePlus, Send, ShieldCheck } from 'lucide-react';
import {
  useAddSupportMessage,
  useCreateSupportTicket,
  useSupportThread,
  useSupportTickets,
} from '@/lib/dashboard/queries';
import { timeAgo } from '@/lib/dashboard/format';
import { EmptyState } from '../ui/empty-state';
import { RsButton } from '../ui/button';
import { TableSkeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * In-product support desk for the customer console.
 *
 * The console previously offered only a `mailto:` link, even though the
 * backend had a fully working two-way ticket API. This page is the same
 * `feedback_tickets` conversation the admin support workspace answers, polled
 * every few seconds while open so an admin reply appears without a reload.
 */
export function SupportPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">Support</h1>
          <p className="mt-1.5 text-sm text-rs-text-tertiary">
            Talk to the RELIASTRA team. Replies land here and in your notifications.
          </p>
        </div>
        {selectedId && (
          <RsButton variant="secondary" onClick={() => setSelectedId(null)}>
            <ArrowLeft /> All conversations
          </RsButton>
        )}
      </div>

      {selectedId ? (
        <Thread
          ticketId={selectedId}
          onBack={() => setSelectedId(null)}
        />
      ) : composing ? (
        <NewConversation
          onCancel={() => setComposing(false)}
          onCreated={(id) => {
            setComposing(false);
            setSelectedId(id);
          }}
        />
      ) : (
        <TicketList
          onOpen={setSelectedId}
          onCompose={() => setComposing(true)}
        />
      )}
    </div>
  );
}

function TicketList({
  onOpen,
  onCompose,
}: {
  onOpen: (id: string) => void;
  onCompose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useSupportTickets();
  const items = data?.items ?? [];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <RsButton onClick={onCompose}>
          <MessageSquarePlus /> New conversation
        </RsButton>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : isError ? (
        <EmptyState
          icon={<MessageSquarePlus size={32} />}
          title="Could not load your conversations"
          body="Your existing conversations are safe. Try again in a moment."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MessageSquarePlus size={32} />}
          title="No conversations yet"
          body="Ask us anything about your monitors, evidence reports, or billing. A human replies — usually within a few hours."
          actionLabel="Start a conversation"
          onAction={onCompose}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => onOpen(ticket.id)}
              className="rounded-xl border border-rs-border-subtle bg-rs-elevated px-5 py-4 text-left transition-[border-color] duration-150 hover:border-rs-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium text-rs-text-accent">
                      {ticket.ticket_number}
                    </span>
                    <StatusChip status={ticket.status} />
                    {ticket.unread_admin_messages > 0 && (
                      <span className="rounded-full bg-rs-brand px-1.5 py-px text-[10px] font-semibold text-white">
                        {ticket.unread_admin_messages} new
                      </span>
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-rs-text">
                    {ticket.subject}
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs text-rs-text-tertiary">
                    {ticket.last_message_preview}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-rs-text-tertiary">
                  {timeAgo(ticket.last_message_at)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function NewConversation({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const create = useCreateSupportTicket();

  const canSubmit =
    subject.trim().length > 0 && message.trim().length >= 10 && !create.isPending;

  return (
    <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-6">
      <h2 className="text-base font-semibold text-rs-text">Start a conversation</h2>
      <p className="mt-1 text-xs text-rs-text-tertiary">
        The more context you give us — dependency name, timeframe, what you
        expected — the faster we can help.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-rs-text-secondary">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What do you need help with?"
            className="mt-1.5 w-full rounded-lg border border-rs-border-subtle bg-rs-base px-3 py-2 text-sm text-rs-text placeholder:text-rs-text-tertiary focus-visible:border-rs-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgb(37_99_235_/_0.20)]"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-rs-text-secondary">Message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="Describe the issue in at least 10 characters…"
            className="mt-1.5 w-full resize-y rounded-lg border border-rs-border-subtle bg-rs-base px-3 py-2 text-sm text-rs-text placeholder:text-rs-text-tertiary focus-visible:border-rs-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgb(37_99_235_/_0.20)]"
          />
        </label>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <RsButton variant="ghost" onClick={onCancel} disabled={create.isPending}>
          Cancel
        </RsButton>
        <RsButton
          disabled={!canSubmit}
          onClick={() =>
            create.mutate(
              { subject: subject.trim(), message: message.trim() },
              { onSuccess: (data) => onCreated(data.ticket.id) }
            )
          }
        >
          {create.isPending ? 'Opening…' : 'Open conversation'}
        </RsButton>
      </div>
    </div>
  );
}

function Thread({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { data, isLoading, isError, refetch } = useSupportThread(ticketId);
  const sendMessage = useAddSupportMessage();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the admin replies land on the poll.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.length]);

  if (isLoading) return <TableSkeleton rows={5} />;

  if (isError || !data) {
    return (
      <EmptyState
        icon={<MessageSquarePlus size={32} />}
        title="Could not load this conversation"
        body="The conversation still exists on our side. Try again in a moment."
        actionLabel="Retry"
        onAction={() => refetch()}
        helpLabel="Back to all conversations"
        onHelp={onBack}
      />
    );
  }

  const canSend = draft.trim().length > 0 && !sendMessage.isPending;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated">
        <div className="border-b border-rs-border-subtle px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium text-rs-text-accent">
              {data.ticket.ticket_number}
            </span>
            <StatusChip status={data.ticket.status} />
          </div>
          <h2 className="mt-2 text-base font-semibold text-rs-text">
            {data.ticket.subject}
          </h2>
        </div>

        <div className="max-h-[26rem] space-y-4 overflow-y-auto px-5 py-5">
          {data.messages.map((msg) => {
            const mine = msg.sender_type === 'user';
            return (
              <div
                key={msg.id}
                className={cn(
                  'max-w-[85%] rounded-xl border px-4 py-3',
                  mine
                    ? 'ml-auto border-rs-brand/30 bg-rs-brand-subtle'
                    : 'border-rs-border-subtle bg-rs-base'
                )}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs font-semibold text-rs-text">
                    {mine ? 'You' : msg.sender_name}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-rs-text-tertiary">
                    {timeAgo(msg.created_at)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-rs-text-secondary">
                  {msg.body}
                </p>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <div className="border-t border-rs-border-subtle p-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Write a reply…"
            className="w-full resize-y rounded-lg border border-rs-border-subtle bg-rs-base px-3 py-2 text-sm text-rs-text placeholder:text-rs-text-tertiary focus-visible:border-rs-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgb(37_99_235_/_0.20)]"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-rs-text-tertiary">
              Replies appear here automatically — no refresh needed.
            </p>
            <RsButton
              size="sm"
              disabled={!canSend}
              onClick={() =>
                sendMessage.mutate(
                  { ticketId, body: draft.trim() },
                  { onSuccess: () => setDraft('') }
                )
              }
            >
              {sendMessage.isPending ? 'Sending…' : 'Send'} <Send />
            </RsButton>
          </div>
        </div>
      </div>

      <aside className="h-fit rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-rs-brand" />
          <h3 className="text-sm font-semibold text-rs-text">What to expect</h3>
        </div>
        <ul className="mt-3 space-y-2.5 text-xs leading-5 text-rs-text-secondary">
          <li>A human from the RELIASTRA team reads every message.</li>
          <li>
            You get a notification here the moment we reply — no need to keep
            this tab open.
          </li>
          <li>
            Internal team notes are never shown in this thread.
          </li>
        </ul>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 text-xs font-medium text-rs-text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
        >
          Back to all conversations
        </button>
      </aside>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === 'resolved'
      ? 'border-rs-up/30 text-rs-up'
      : status === 'open'
        ? 'border-rs-degraded/30 text-rs-degraded'
        : 'border-rs-border-subtle text-rs-text-tertiary';
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-px text-[10px] font-semibold uppercase tracking-[0.08em]',
        tone
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
