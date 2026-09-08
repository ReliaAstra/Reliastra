'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useAddSupportMessage,
  useCreateSupportTicket,
  useSupportThread,
  useSupportTickets,
} from '@/lib/dashboard/queries';
import { formatUtc, timeAgo } from '@/lib/dashboard/format';
import {
  Empty,
  Fact,
  Failure,
  PageHead,
  RowsSkeleton,
  Section,
} from '@/components/console/primitives';
import { cn } from '@/lib/utils';

/**
 * Support desk.
 *
 * Same two-way ticket API as before - this is a presentation change only.
 * Conversations are a register, not a stack of chat bubbles: an operator
 * looking for the thread where they reported last Tuesday's Twilio outage
 * scans ticket number, subject, state and last activity in one pass.
 */
export function SupportPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const tickets = useSupportTickets();
  const items = tickets.data?.items ?? [];
  const openCount = items.filter((t) => t.status !== 'resolved' && t.status !== 'closed').length;

  return (
    <>
      <PageHead
        title="Support"
        meta={
          <>
            <Fact label="Conversations" value={items.length} />
            <Fact label="Open" value={openCount} />
            <Fact
              label="Replies"
              value="delivered to this page and your inbox"
              mono={false}
            />
          </>
        }
        actions={
          selectedId || composing ? (
            <button
              type="button"
              className="obc-btn"
              onClick={() => {
                setSelectedId(null);
                setComposing(false);
              }}
            >
              All conversations
            </button>
          ) : (
            <button
              type="button"
              className="obc-btn obc-btn-primary"
              onClick={() => setComposing(true)}
            >
              New conversation
            </button>
          )
        }
      />

      {selectedId ? (
        <Thread ticketId={selectedId} onBack={() => setSelectedId(null)} />
      ) : composing ? (
        <NewConversation
          onCancel={() => setComposing(false)}
          onCreated={(id) => {
            setComposing(false);
            setSelectedId(id);
          }}
        />
      ) : (
        <Section title="Conversations" hint="Every message is answered by a person on the RELIASTRA team.">
          {tickets.isLoading ? (
            <RowsSkeleton rows={4} cols={3} />
          ) : tickets.isError ? (
            <Failure
              title="Conversations unavailable"
              body="Your existing conversations are unaffected; the console could not read them just now."
              onRetry={() => tickets.refetch()}
            />
          ) : !items.length ? (
            <Empty
              title="No conversations"
              body="Ask about a monitor, an evidence record, an invoice or an attribution you disagree with. Include the dependency name and the window you are asking about. It is the fastest route to a useful answer."
              action={
                <button
                  type="button"
                  className="obc-btn obc-btn-primary"
                  onClick={() => setComposing(true)}
                >
                  Start a conversation
                </button>
              }
            />
          ) : (
            <ul className="border border-[var(--obc-line)]">
              {items.map((t) => (
                <li key={t.id} className="border-b border-[var(--obc-line)] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className="block w-full px-4 py-3 text-left transition-colors hover:bg-[var(--obc-hover)]"
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                      <span className="flex min-w-0 items-baseline gap-4">
                        <span className="obc-mono text-[var(--obc-signal)]">
                          {t.ticket_number}
                        </span>
                        <span className="truncate text-[13px] text-[var(--obc-text)]">
                          {t.subject}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-5">
                        {t.unread_admin_messages > 0 && (
                          <span className="obc-mono text-[var(--obc-signal)]">
                            {t.unread_admin_messages} new
                          </span>
                        )}
                        <TicketState status={t.status} />
                        <span className="obc-mono text-[var(--obc-text-4)]">
                          {timeAgo(t.last_message_at)}
                        </span>
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-[12px] text-[var(--obc-text-4)]">
                      {t.last_sender_type === 'user' ? 'You: ' : ''}
                      {t.last_message_preview}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}

function TicketState({ status }: { status: string }) {
  const state =
    status === 'resolved' || status === 'closed'
      ? 'ok'
      : status === 'open' || status === 'pending'
        ? 'warn'
        : 'idle';
  return (
    <span className="obc-state" data-state={state}>
      <span className="obc-dot" aria-hidden />
      <span>{status.replace(/_/g, ' ')}</span>
    </span>
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
  const canSubmit = subject.trim().length > 0 && message.trim().length >= 10 && !create.isPending;

  return (
    <Section
      title="New conversation"
      hint="Dependency name, UTC window, and what you expected to see."
    >
      <form
        className="max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit)
            create.mutate(
              { subject: subject.trim(), message: message.trim() },
              { onSuccess: (data) => onCreated(data.ticket.id) }
            );
        }}
      >
        <div className="mb-4">
          <label className="obc-field-label" htmlFor="ticket-subject">
            Subject
          </label>
          <input
            id="ticket-subject"
            className="obc-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="obc-field-label" htmlFor="ticket-body">
            Message
          </label>
          <textarea
            id="ticket-body"
            rows={7}
            className="obc-input resize-y py-2"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-describedby="ticket-body-note"
          />
          <p id="ticket-body-note" className="mt-1.5 text-[11.5px] text-[var(--obc-text-4)]">
            At least 10 characters.
          </p>
        </div>
        {create.isError && (
          <p className="mb-4 text-[12px] text-[#E58C85]">
            The conversation could not be opened. Nothing was sent. Try again.
          </p>
        )}
        <div className="flex items-center gap-2">
          <button type="submit" className="obc-btn obc-btn-primary" disabled={!canSubmit}>
            {create.isPending ? 'Opening…' : 'Open conversation'}
          </button>
          <button
            type="button"
            className="obc-btn"
            onClick={onCancel}
            disabled={create.isPending}
          >
            Cancel
          </button>
        </div>
      </form>
    </Section>
  );
}

function Thread({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { data, isLoading, isError, refetch } = useSupportThread(ticketId);
  const send = useAddSupportMessage();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.length]);

  if (isLoading) {
    return (
      <Section title="Conversation">
        <RowsSkeleton rows={4} cols={2} />
      </Section>
    );
  }

  if (isError || !data) {
    return (
      <Section title="Conversation">
        <Failure
          title="Conversation unavailable"
          body="The conversation still exists; the console could not read it just now."
          onRetry={() => refetch()}
        />
        <button type="button" className="obc-btn obc-btn-sm mt-3" onClick={onBack}>
          All conversations
        </button>
      </Section>
    );
  }

  const canSend = draft.trim().length > 0 && !send.isPending;

  return (
    <Section
      title={data.ticket.subject}
      hint={`${data.ticket.ticket_number} · opened ${formatUtc(data.ticket.created_at, 'yyyy-MM-dd HH:mm')}`}
      action={<TicketState status={data.ticket.status} />}
    >
      <div className="border border-[var(--obc-line)]">
        <ol className="obc-scroll max-h-[28rem] overflow-y-auto">
          {data.messages.map((m) => {
            const mine = m.sender_type === 'user';
            return (
              <li
                key={m.id}
                className={cn(
                  'border-b border-[var(--obc-line)] px-4 py-3.5 last:border-b-0',
                  !mine && 'bg-[var(--obc-raised)]'
                )}
              >
                <p className="flex items-baseline justify-between gap-4">
                  <span className="obc-label text-[var(--obc-text-3)]">
                    {mine ? 'You' : m.sender_name}
                  </span>
                  <span className="obc-mono text-[var(--obc-text-4)]">
                    {formatUtc(m.created_at, 'yyyy-MM-dd HH:mm')}
                  </span>
                </p>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[var(--obc-text-2)]">
                  {m.body}
                </p>
              </li>
            );
          })}
          <div ref={endRef} />
        </ol>

        <form
          className="border-t border-[var(--obc-line-2)] bg-[var(--obc-base)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend)
              send.mutate({ ticketId, body: draft.trim() }, { onSuccess: () => setDraft('') });
          }}
        >
          <label className="obc-field-label" htmlFor="reply">
            Reply
          </label>
          <textarea
            id="reply"
            rows={3}
            className="obc-input resize-y py-2"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11.5px] text-[var(--obc-text-4)]">
              New replies load automatically while this page is open.
            </p>
            <span className="flex items-center gap-2">
              <button type="button" className="obc-btn obc-btn-sm" onClick={onBack}>
                All conversations
              </button>
              <button type="submit" className="obc-btn obc-btn-sm obc-btn-primary" disabled={!canSend}>
                {send.isPending ? 'Sending…' : 'Send reply'}
              </button>
            </span>
          </div>
        </form>
      </div>
    </Section>
  );
}
