'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Mail, MailCheck } from 'lucide-react';
import {
  useSendSupportEmail,
  useSessionReady,
} from '@/lib/dashboard/queries';
import { SUPPORT_CATEGORIES, type SupportCategory, type SupportEmailReceipt } from '@/lib/dashboard/types';
import { Fact, PageHead, Section } from '@/components/console/primitives';
import { formatUtc } from '@/lib/dashboard/format';

/**
 * Support.
 *
 * Support is answered by email. This page writes one, and that is the whole
 * interaction: no thread to watch, no reply box that only works while the tab
 * is open, nothing polled in the background.
 *
 * The page states the loop plainly - where the message goes, who answers it,
 * which address the answer arrives at - because a form with a Send button and
 * no visible consequence is why people asked for a chat window in the first
 * place.
 */
export function SupportPage() {
  const [receipt, setReceipt] = useState<SupportEmailReceipt | null>(null);

  return (
    <>
      <PageHead
        title="Support"
        meta={
          <>
            <Fact label="Channel" value="email" />
            <Fact label="Replies" value="to the address on your account" mono={false} />
            <Fact label="First response" value="within one business day" mono={false} />
          </>
        }
        actions={
          receipt ? (
            <button type="button" className="obc-btn" onClick={() => setReceipt(null)}>
              Write another
            </button>
          ) : null
        }
      />

      {receipt ? <SentReceipt receipt={receipt} /> : <ComposeSupportEmail onSent={setReceipt} />}
    </>
  );
}

function ComposeSupportEmail({ onSent }: { onSent: (receipt: SupportEmailReceipt) => void }) {
  const ready = useSessionReady();
  const send = useSendSupportEmail();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportCategory>('general');
  const [message, setMessage] = useState('');
  const [attachmentNote, setAttachmentNote] = useState(false);

  const canSubmit = ready && subject.trim().length >= 3 && message.trim().length >= 20 && !send.isPending;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Section
        title="Email the support team"
        hint="Dependency name, UTC window, and what you expected to see. The more specific the first message, the fewer round trips."
      >
        <form
          className="max-w-2xl"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            send.mutate(
              { subject: subject.trim(), message: message.trim(), category },
              { onSuccess: (data) => onSent(data) }
            );
          }}
        >
          <div className="mb-4">
            <label className="obc-field-label" htmlFor="support-subject">
              Subject
            </label>
            <input
              id="support-subject"
              className="obc-input"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Monitor shows Responding, the vendor reports an outage"
              autoComplete="off"
            />
          </div>

          <div className="mb-4">
            <label className="obc-field-label" htmlFor="support-category">
              Category
            </label>
            <select
              id="support-category"
              className="obc-input"
              value={category}
              onChange={(event) => setCategory(event.target.value as SupportCategory)}
            >
              {SUPPORT_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11.5px] text-[var(--obc-text-4)]">
              Category decides how the request is triaged, not who reads it.
            </p>
          </div>

          <div className="mb-4">
            <label className="obc-field-label" htmlFor="support-message">
              Message
            </label>
            <textarea
              id="support-message"
              rows={10}
              className="obc-input resize-y py-2"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={'What happened, when (UTC), and which dependency or record it concerns.'}
              aria-describedby="support-message-note"
            />
            <p id="support-message-note" className="mt-1.5 text-[11.5px] text-[var(--obc-text-4)]">
              At least 20 characters.
            </p>
          </div>

          <label className="mb-4 flex items-start gap-2 text-[12px] text-[var(--obc-text-3)]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={attachmentNote}
              onChange={(event) => setAttachmentNote(event.target.checked)}
            />
            <span>
              I need to send a file or a screenshot with this request.
            </span>
          </label>
          {attachmentNote && (
            <p className="mb-4 text-[11.5px] text-[var(--obc-text-4)]">
              Send the message now and reply to the confirmation email with the file attached -
              attachments on that reply reach the same team.
            </p>
          )}

          {send.isError && (
            <p className="mb-4 text-[12px] text-[#E58C85]">
              The email was not sent. Nothing was delivered - try again, or write directly to
              support@reliastra.com.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="obc-btn obc-btn-primary" disabled={!canSubmit}>
              {send.isPending ? 'Sending…' : 'Send to support'}
            </button>
            <a className="obc-link text-[12px]" href="mailto:support@reliastra.com">
              Or write from your own mail client
            </a>
          </div>
        </form>
      </Section>

      <Section title="How this reaches a person">
        <ol className="space-y-3 text-[13px] leading-6 text-[var(--obc-text-2)]">
          <li className="flex gap-3">
            <span className="obc-mono text-[var(--obc-signal)]">01</span>
            <span>
              Your message is queued and the team is alerted immediately - by email and by
              notification in the admin console.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="obc-mono text-[var(--obc-signal)]">02</span>
            <span>A person reads it and answers. There is no bot and no auto-close.</span>
          </li>
          <li className="flex gap-3">
            <span className="obc-mono text-[var(--obc-signal)]">03</span>
            <span>
              The answer arrives by email to the address on your account. Reply to that email
              and it reaches the same team, with the ticket number attached.
            </span>
          </li>
        </ol>
        <p className="mt-5 border-t border-[var(--obc-line)] pt-4 text-[12px] text-[var(--obc-text-4)]">
          Support is email only. There is no live chat window: a message you have to keep a page
          open to receive is worse than one waiting in your inbox.
        </p>
      </Section>
    </div>
  );
}

function SentReceipt({ receipt }: { receipt: SupportEmailReceipt }) {
  return (
    <Section
      title="Your email is on its way"
      hint={`${receipt.ticket_number} · sent ${formatUtc(receipt.received_at, 'yyyy-MM-dd HH:mm')} UTC`}
      action={
        <Link href="/dashboard" className="obc-btn obc-btn-sm">
          Back to overview <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      <div className="max-w-2xl">
        <div className="flex items-start gap-3 border border-[var(--obc-line)] bg-[var(--obc-raised)] p-4">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-[var(--obc-signal)]" aria-hidden />
          <div className="text-[13px] leading-6 text-[var(--obc-text-2)]">
            <p className="text-[var(--obc-text)]">
              {receipt.confirmation_sent_to ? (
                <>
                  A copy of your request was sent to{' '}
                  <span className="obc-mono">{receipt.confirmation_sent_to}</span>.
                </>
              ) : (
                <>
                  Your request is queued. The confirmation email could not be sent just now, but
                  the request itself is recorded.
                </>
              )}
            </p>
            <p className="mt-2">
              {receipt.admin_notified
                ? 'The support team was alerted the moment it arrived.'
                : 'The team was not alerted by email for this one - it is in the queue and will be picked up on the next pass.'}{' '}
              Replies come from <span className="obc-mono">{receipt.support_email}</span> and go to
              the address on your account.
            </p>
          </div>
        </div>

        <dl className="mt-5 divide-y divide-[var(--obc-line)] border border-[var(--obc-line)]">
          <ReceiptRow label="Ticket" value={receipt.ticket_number} />
          <ReceiptRow label="Subject" value={receipt.subject} />
          <ReceiptRow label="Category" value={receipt.category} />
          <ReceiptRow label="Status" value={receipt.status} />
          <ReceiptRow
            label="Expected reply"
            value={`within ${receipt.reply_in_days} business day${receipt.reply_in_days === 1 ? '' : 's'}`}
          />
        </dl>

        <p className="mt-5 flex items-start gap-2 text-[12px] text-[var(--obc-text-4)]">
          <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Keep the confirmation email: replying to it adds detail to the same request. Nothing
            further is needed here.
          </span>
        </p>
      </div>
    </Section>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="obc-label text-[var(--obc-text-3)]">{label}</dt>
      <dd className="obc-mono text-right text-[var(--obc-text)]">{value}</dd>
    </div>
  );
}
