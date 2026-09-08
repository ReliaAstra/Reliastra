'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Beaker,
  Check,
  ChevronsUpDown,
  ExternalLink,
  FileCode2,
  FileText,
  FlaskConical,
  Inbox,
  Loader2,
  Mail,
  MonitorSmartphone,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import { formatRelativeTime, humanize } from '@/lib/admin-utils';
import {
  extractEmailVariables,
  renderEmailVariables,
  sanitizeEmailHtml,
} from '@/lib/email-sanitize';
import { cn } from '@/lib/utils';
import type {
  EmailCenterAttachmentInput,
  EmailCenterSender,
  EmailCenterTemplate,
} from '@/types/admin';
import {
  AdminCard,
  AdminPageHeader,
  SectionFailure,
  SectionHeading,
  SectionSkeleton,
  StatusPill,
} from '@/components/admin/admin-primitives';
import { EmailActivitySection } from '@/components/admin/admin-email-activity';
import { EmailTemplatesSection } from '@/components/admin/admin-email-templates';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTACHMENT_BYTES = 8_000_000;
const MAX_ATTACHMENTS_TOTAL_BYTES = 20_000_000;
const MAX_ATTACHMENTS = 5;
const RESEND_DASHBOARD_URL = 'https://resend.com/domains';

interface StagedAttachment extends EmailCenterAttachmentInput {
  size_bytes: number;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof AdminApiError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Recipient chip input ─────────────────────────────────────────────── */

function EmailChipInput({
  id,
  label,
  values,
  onChange,
  placeholder,
  optional = false,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  optional?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const candidates = raw
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (!candidates.length) {
      setDraft('');
      return;
    }
    const next = [...values];
    for (const candidate of candidates) {
      if (!EMAIL_RE.test(candidate)) {
        setInvalid(`"${candidate}" is not a valid email address.`);
        setDraft(candidate);
        return;
      }
      if (!next.some((item) => item.toLowerCase() === candidate.toLowerCase())) {
        next.push(candidate);
      }
    }
    setInvalid(null);
    setDraft('');
    onChange(next);
  };

  return (
    <div>
      <Label htmlFor={id} className="text-xs font-semibold text-slate-700 dark:text-slate-200">
        {label}
        {optional && <span className="ml-1 font-normal text-slate-400">· optional</span>}
      </Label>
      <div
        className={cn(
          'mt-1.5 flex min-h-10 cursor-text flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 transition-colors focus-within:border-slate-400 dark:bg-card',
          invalid
            ? 'border-rose-300 dark:border-rose-500/40'
            : 'border-slate-200 dark:border-white/10'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((value) => (
          <span
            key={value.toLowerCase()}
            className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 py-0.5 pl-2 pr-1 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          >
            <span className="max-w-52 truncate">{value}</span>
            <button
              type="button"
              aria-label={`Remove ${value}`}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={(event) => {
                event.stopPropagation();
                onChange(values.filter((item) => item.toLowerCase() !== value.toLowerCase()));
              }}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (invalid) setInvalid(null);
          }}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
              event.preventDefault();
              commit(draft);
            } else if (event.key === 'Backspace' && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text');
            if (pasted && /[,;\n]/.test(pasted)) {
              event.preventDefault();
              commit(`${draft} ${pasted}`);
            }
          }}
          placeholder={values.length ? '' : placeholder}
          className="min-w-40 flex-1 bg-transparent px-1 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
          aria-invalid={!!invalid}
        />
      </div>
      {invalid ? (
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{invalid}</p>
      ) : (
        <p className="mt-1 text-[11px] text-slate-400">
          Press Enter or comma to add · paste a comma-separated list
        </p>
      )}
    </div>
  );
}

/* ── Sender combobox ──────────────────────────────────────────────────── */

function SenderCombobox({
  senders,
  value,
  onChange,
  disabled,
}: {
  senders: EmailCenterSender[];
  value: string;
  onChange: (email: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = senders.find((sender) => sender.email.toLowerCase() === value.toLowerCase());
  const verified = senders.filter((sender) => sender.verified);
  const others = senders.filter((sender) => !sender.verified);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select sender"
          disabled={disabled}
          className="h-10 w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <SenderDot sender={selected} />
              <span className="truncate text-sm">{selected.email}</span>
            </span>
          ) : (
            <span className="text-sm text-slate-400">Select a verified sender…</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,380px)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search senders…" />
          <CommandList>
            <CommandEmpty>No senders match this search.</CommandEmpty>
            {verified.length > 0 && (
              <CommandGroup heading="Verified — ready to send">
                {verified.map((sender) => (
                  <CommandItem
                    key={sender.id}
                    value={`${sender.email} ${sender.name}`}
                    onSelect={() => {
                      onChange(sender.email);
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <SenderDot sender={sender} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{sender.email}</span>
                      <span className="block truncate text-xs text-slate-500">{sender.name}</span>
                    </span>
                    {selected?.id === sender.id && <Check className="size-4 shrink-0" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {others.length > 0 && (
              <CommandGroup heading="Not available">
                {others.map((sender) => (
                  <CommandItem
                    key={sender.id}
                    value={`${sender.email} ${sender.name}`}
                    disabled
                    className="gap-2 opacity-70"
                    aria-disabled="true"
                  >
                    <SenderDot sender={sender} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{sender.email}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {sender.status_detail}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SenderDot({ sender }: { sender: EmailCenterSender }) {
  if (sender.verified) {
    return <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  if (sender.status === 'unavailable') {
    return <TriangleAlert className="size-4 shrink-0 text-slate-400" />;
  }
  return <ShieldX className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />;
}

/* ── Main page ────────────────────────────────────────────────────────── */

export function EmailCenterPage() {
  const queryClient = useQueryClient();

  // Composer state
  const [senderEmail, setSenderEmail] = useState('');
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [replyTo, setReplyTo] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  // Dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [addSenderOpen, setAddSenderOpen] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['admin', 'email-center', 'status'],
    queryFn: () => adminApi.emailStatus(),
    staleTime: 60_000,
  });
  const sendersQuery = useQuery({
    queryKey: ['admin', 'email-center', 'senders'],
    queryFn: () => adminApi.emailSenders(),
    staleTime: 60_000,
  });
  const templatesQuery = useQuery({
    queryKey: ['admin', 'email-center', 'templates'],
    queryFn: adminApi.emailTemplates,
    staleTime: 60_000,
  });

  const senders = sendersQuery.data?.senders ?? [];
  const verifiedSenders = useMemo(
    () => senders.filter((sender) => sender.verified),
    [senders]
  );
  const selectedSender = senders.find(
    (sender) => sender.email.toLowerCase() === senderEmail.toLowerCase()
  );
  const templates = templatesQuery.data ?? [];
  const activeTemplate = templates.find((template) => template.id === templateId) ?? null;

  // Auto-select the first verified sender on load.
  useEffect(() => {
    if (!senderEmail && verifiedSenders.length > 0) {
      setSenderEmail(verifiedSenders[0].email);
    }
  }, [senderEmail, verifiedSenders]);

  const variableNames = useMemo(
    () => extractEmailVariables(subject, html, text),
    [subject, html, text]
  );

  const rendered = useMemo(
    () => ({
      subject: renderEmailVariables(subject, variables),
      html: sanitizeEmailHtml(renderEmailVariables(html, variables)),
      text: renderEmailVariables(text, variables),
    }),
    [subject, html, text, variables]
  );

  const previewDoc = useMemo(() => {
    const textFallback = rendered.text
      ? `<div style="white-space:pre-wrap;">${rendered.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</div>`
      : '<p style="color:#9ca3af;">Nothing to preview yet.</p>';
    return (
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
      `<body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">` +
      `<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">` +
      (rendered.html || textFallback) +
      `</div></body></html>`
    );
  }, [rendered.html, rendered.text]);

  const recipientCount = to.length + cc.length + bcc.length;
  const attachmentBytes = attachments.reduce((sum, item) => sum + item.size_bytes, 0);

  const validationError = useMemo(() => {
    if (!selectedSender) return 'Select a sender to continue.';
    if (!selectedSender.verified) return 'The selected sender is not verified for sending.';
    if (to.length === 0) return 'Add at least one recipient.';
    if (recipientCount > 50) return 'Too many recipients (maximum 50 across To/CC/BCC).';
    if (replyTo.trim() && !EMAIL_RE.test(replyTo.trim())) return 'The reply-to address is invalid.';
    if (!subject.trim()) return 'Add a subject.';
    if (!html.trim() && !text.trim()) return 'Write an HTML or plain-text message.';
    return null;
  }, [selectedSender, to.length, recipientCount, replyTo, subject, html, text]);

  const invalidateLogs = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'email-center', 'messages'] });

  const sendMutation = useMutation({
    mutationFn: adminApi.sendEmail,
    onSuccess: (result) => {
      void invalidateLogs();
      if (result.status === 'sent') {
        toast.success('Email sent', {
          description: result.provider_message_id
            ? `Accepted by Resend · ${result.provider_message_id}`
            : 'Accepted by Resend.',
        });
        resetComposer({ keepSender: true });
      } else {
        // A failed attempt keeps its audit record, but the next Send must be
        // a fresh attempt - not an idempotent replay of this failure.
        regenerateIdempotencyKey();
        toast.error('Email not sent', { description: result.message });
      }
    },
    onError: (error: unknown) => {
      regenerateIdempotencyKey();
      toast.error('Email not sent', { description: errorMessage(error, 'Please try again.') });
    },
  });

  const testMutation = useMutation({
    mutationFn: adminApi.sendTestEmail,
    onSuccess: (result) => {
      void invalidateLogs();
      setTestOpen(false);
      toast.success('Test email sent', {
        description: result.provider_message_id
          ? `Accepted by Resend · ${result.provider_message_id}`
          : 'Accepted by Resend.',
      });
    },
    onError: (error: unknown) => {
      toast.error('Test email failed', { description: errorMessage(error, 'Please try again.') });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const [status, senderList] = await Promise.all([
        adminApi.emailStatus(true),
        adminApi.emailSenders(true),
      ]);
      return { status, senderList };
    },
    onSuccess: ({ status, senderList }) => {
      queryClient.setQueryData(['admin', 'email-center', 'status'], status);
      queryClient.setQueryData(['admin', 'email-center', 'senders'], senderList);
      toast.success('Sender status refreshed', {
        description: `Domain ${senderList.domain_status} · ${senderList.senders.filter((s) => s.verified).length} verified sender${senderList.senders.filter((s) => s.verified).length === 1 ? '' : 's'}.`,
      });
    },
    onError: (error: unknown) => {
      toast.error('Refresh failed', { description: errorMessage(error, 'Please try again.') });
    },
  });

  function regenerateIdempotencyKey() {
    setIdempotencyKey(
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  }

  function resetComposer({ keepSender }: { keepSender: boolean }) {
    if (!keepSender) setSenderEmail('');
    setTo([]);
    setCc([]);
    setBcc([]);
    setShowCcBcc(false);
    setReplyTo('');
    setSubject('');
    setHtml('');
    setText('');
    setAttachments([]);
    setTemplateId(null);
    setVariables({});
    regenerateIdempotencyKey();
  }

  function applyTemplate(template: EmailCenterTemplate) {
    setTemplateId(template.id);
    setSubject(template.subject);
    setHtml(template.html_body);
    setText(template.text_body);
    setVariables((current) => {
      const next: Record<string, string> = {};
      for (const name of template.variables) {
        if (current[name] !== undefined) next[name] = current[name];
      }
      return next;
    });
    toast.success('Template applied', { description: template.name });
  }

  function handleSend() {
    if (validationError || sendMutation.isPending) return;
    setConfirmOpen(true);
  }

  function confirmSend() {
    if (!selectedSender) return;
    setConfirmOpen(false);
    sendMutation.mutate({
      sender: selectedSender.email,
      to,
      cc,
      bcc,
      reply_to: replyTo.trim() || null,
      subject: subject.trim(),
      text: text || null,
      html: html || null,
      attachments: attachments.map(({ filename, content_base64, content_type }) => ({
        filename,
        content_base64,
        content_type,
      })),
      template_id: templateId,
      variables,
      idempotency_key: idempotencyKey,
    });
  }

  const status = statusQuery.data;
  const sending = sendMutation.isPending;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Admin · Operations"
        title="Email Center"
        description="Send operational and business emails from verified Reliastra sender identities."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="gap-1.5"
          >
            <RefreshCw className={cn('size-3.5', refreshMutation.isPending && 'animate-spin')} />
            {refreshMutation.isPending ? 'Refreshing…' : 'Refresh Senders'}
          </Button>
        }
      />

      <ResendStatusStrip
        statusQuery={statusQuery}
        onRefresh={() => refreshMutation.mutate()}
        refreshing={refreshMutation.isPending}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Main: compose + preview ─────────────────────────────── */}
        <div className="min-w-0 space-y-6">
          <AdminCard>
            <SectionHeading
              title="Compose Email"
              subtitle={
                activeTemplate ? (
                  <>
                    Using template{' '}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {activeTemplate.name}
                    </span>{' '}
                    <button
                      type="button"
                      onClick={() => setTemplateId(null)}
                      className="ml-1 underline decoration-slate-300 underline-offset-2 hover:text-slate-900 dark:hover:text-white"
                    >
                      Detach
                    </button>
                  </>
                ) : (
                  'Content is sanitized and validated before delivery.'
                )
              }
              action={
                <TemplatePicker
                  templates={templates}
                  loading={templatesQuery.isLoading}
                  activeId={templateId}
                  onSelect={applyTemplate}
                />
              }
            />
            <div className="space-y-5 border-t border-slate-100 px-5 py-5 dark:border-white/10 sm:px-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-1">
                  <EmailChipInput
                    id="email-to"
                    label="To"
                    values={to}
                    onChange={setTo}
                    placeholder="recipient@example.com"
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="email-reply-to" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Reply-To <span className="ml-1 font-normal text-slate-400">· optional</span>
                  </Label>
                  <Input
                    id="email-reply-to"
                    value={replyTo}
                    onChange={(event) => setReplyTo(event.target.value)}
                    placeholder="support@reliastra.com"
                    className="mt-1.5 h-10"
                    inputMode="email"
                  />
                </div>
              </div>

              {showCcBcc ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <EmailChipInput
                    id="email-cc"
                    label="CC"
                    values={cc}
                    onChange={setCc}
                    placeholder="cc@example.com"
                    optional
                  />
                  <EmailChipInput
                    id="email-bcc"
                    label="BCC"
                    values={bcc}
                    onChange={setBcc}
                    placeholder="bcc@example.com"
                    optional
                  />
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowCcBcc(true)}
                    className="text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Add CC / BCC
                  </button>
                </div>
              )}

              <div>
                <Label htmlFor="email-subject" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Subject
                </Label>
                <Input
                  id="email-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Request for USD Virtual Account and International Payment Collection"
                  className="mt-1.5 h-10"
                  maxLength={500}
                />
              </div>

              {variableNames.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Template variables
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Values are substituted safely at send time — variables can never inject code.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {variableNames.map((name) => (
                      <div key={name}>
                        <Label
                          htmlFor={`var-${name}`}
                          className="font-mono text-[11px] text-slate-500 dark:text-slate-400"
                        >
                          {`{{${name}}}`}
                        </Label>
                        <Input
                          id={`var-${name}`}
                          value={variables[name] ?? ''}
                          onChange={(event) =>
                            setVariables((current) => ({ ...current, [name]: event.target.value }))
                          }
                          placeholder={humanize(name)}
                          className="mt-1 h-9 bg-white dark:bg-card"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="email-html" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    HTML Message
                  </Label>
                  <span className="text-[11px] text-slate-400">
                    {(html.length / 1024).toFixed(1)} KB · sanitized on send
                  </span>
                </div>
                <Textarea
                  id="email-html"
                  value={html}
                  onChange={(event) => setHtml(event.target.value)}
                  placeholder="<p>Hello,</p>"
                  className="mt-1.5 min-h-44 font-mono text-xs leading-5"
                  spellCheck={false}
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="email-text" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Plain-Text Message
                  </Label>
                  <span className="text-[11px] text-slate-400">fallback for text-only clients</span>
                </div>
                <Textarea
                  id="email-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Hello,"
                  className="mt-1.5 min-h-32 text-sm leading-6"
                />
              </div>

              <AttachmentPicker attachments={attachments} onChange={setAttachments} />
            </div>
          </AdminCard>

          <AdminCard>
            <Tabs defaultValue="preview" className="w-full">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 sm:px-6">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Preview</h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Rendered from sanitized HTML — scripts never execute here.
                  </p>
                </div>
                <TabsList className="h-8">
                  <TabsTrigger value="preview" className="gap-1.5 px-3 text-xs">
                    <MonitorSmartphone className="size-3.5" /> Preview
                  </TabsTrigger>
                  <TabsTrigger value="html" className="gap-1.5 px-3 text-xs">
                    <FileCode2 className="size-3.5" /> HTML
                  </TabsTrigger>
                  <TabsTrigger value="text" className="gap-1.5 px-3 text-xs">
                    <FileText className="size-3.5" /> Plain Text
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="px-5 pb-5 pt-4 sm:px-6">
                <TabsContent value="preview" className="mt-0">
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
                    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-white/10 dark:bg-white/5">
                      <Inbox className="size-3.5 text-slate-400" />
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {rendered.subject || '(no subject)'}
                        </span>
                        {'  ·  '}
                        {selectedSender
                          ? `${selectedSender.name} <${selectedSender.email}>`
                          : 'No sender selected'}
                      </p>
                    </div>
                    <iframe
                      title="Email preview"
                      sandbox=""
                      referrerPolicy="no-referrer"
                      srcDoc={previewDoc}
                      className="h-[420px] w-full bg-white"
                    />
                  </div>
                </TabsContent>
                <TabsContent value="html" className="mt-0">
                  <pre className="max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-[11px] leading-5 text-slate-100 dark:border-white/10">
                    {rendered.html || '(empty)'}
                  </pre>
                </TabsContent>
                <TabsContent value="text" className="mt-0">
                  <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-[13px] leading-6 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                    {rendered.text || '(empty)'}
                  </pre>
                </TabsContent>
              </div>
            </Tabs>
          </AdminCard>
        </div>

        {/* ── Right rail: sender & delivery ─────────────────────────── */}
        <div className="min-w-0 space-y-6 xl:sticky xl:top-24">
          <AdminCard>
            <SectionHeading
              title="Sender & Delivery"
              subtitle="Only verified identities can send."
            />
            <div className="space-y-4 border-t border-slate-100 px-5 py-5 dark:border-white/10 sm:px-6">
              <div>
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  From
                </Label>
                <div className="mt-1.5">
                  {sendersQuery.isLoading ? (
                    <div className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-white/5" />
                  ) : sendersQuery.isError ? (
                    <SectionFailure
                      compact
                      title="Senders unavailable."
                      description="Could not load sender identities."
                      onRetry={() => sendersQuery.refetch()}
                    />
                  ) : (
                    <SenderCombobox
                      senders={senders}
                      value={senderEmail}
                      onChange={setSenderEmail}
                      disabled={sending}
                    />
                  )}
                </div>
                {selectedSender && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                    <SenderDot sender={selectedSender} />
                    <span>
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {selectedSender.name}
                      </span>{' '}
                      — {selectedSender.status_detail}
                    </span>
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-8 gap-1 px-2 text-xs text-slate-500"
                  onClick={() => setAddSenderOpen(true)}
                >
                  <Plus className="size-3.5" /> Add Sender
                </Button>
              </div>

              <Separator />

              <dl className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Recipients</dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-100">
                    {recipientCount} / 50
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Attachments</dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-100">
                    {attachments.length} · {formatBytes(attachmentBytes)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Provider</dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-100">Resend</dd>
                </div>
              </dl>

              <Separator />

              {validationError && (
                <p className="flex items-start gap-1.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {validationError}
                </p>
              )}

              <div className="space-y-2">
                <Button
                  className="h-10 w-full gap-2"
                  disabled={!!validationError || sending}
                  onClick={handleSend}
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {sending ? 'Sending…' : 'Send Email'}
                </Button>
                <Button
                  variant="outline"
                  className="h-10 w-full gap-2"
                  disabled={!selectedSender?.verified || testMutation.isPending || sending}
                  onClick={() => setTestOpen(true)}
                >
                  <FlaskConical className="size-4" />
                  Send Test
                </Button>
                <p className="text-center text-[11px] leading-4 text-slate-400">
                  Sends are confirmed, rate-limited, and audit-logged.
                </p>
              </div>
            </div>
          </AdminCard>

          <AdminCard>
            <div className="px-5 py-4 sm:px-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Delivery notes
              </h3>
              <ul className="mt-2.5 space-y-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                <li>· Resend verifies domains, not mailboxes — every alias above shares the {status?.sending_domain ?? 'sending domain'} verification.</li>
                <li>· Test sends are labeled <span className="font-mono text-[11px]">[Test]</span> and logged separately.</li>
                <li>· Duplicate clicks are safe: each send carries an idempotency key.</li>
              </ul>
            </div>
          </AdminCard>
        </div>
      </div>

      <EmailTemplatesSection
        templates={templates}
        loading={templatesQuery.isLoading}
        error={templatesQuery.isError}
        onRetry={() => templatesQuery.refetch()}
        onUse={applyTemplate}
        activeId={templateId}
      />

      <EmailActivitySection />

      <SendConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        sender={selectedSender ?? null}
        to={to}
        cc={cc}
        bcc={bcc}
        subject={rendered.subject}
        onConfirm={confirmSend}
        sending={sending}
      />

      <TestSendDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        sender={selectedSender ?? null}
        pending={testMutation.isPending}
        onSend={(recipient) => {
          if (!selectedSender) return;
          testMutation.mutate({ sender: selectedSender.email, to: recipient });
        }}
      />

      <AddSenderDialog
        open={addSenderOpen}
        onOpenChange={setAddSenderOpen}
        domain={sendersQuery.data?.domain ?? status?.sending_domain ?? 'reliastra.com'}
        onAdded={(email) => setSenderEmail(email)}
      />
    </div>
  );
}

/* ── Resend status strip ──────────────────────────────────────────────── */

function ResendStatusStrip({
  statusQuery,
  onRefresh,
  refreshing,
}: {
  statusQuery: ReturnType<typeof useQuery>;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const status = statusQuery.data as
    | import('@/types/admin').EmailCenterStatus
    | undefined;

  if (statusQuery.isLoading) {
    return (
      <AdminCard>
        <SectionSkeleton lines={2} />
      </AdminCard>
    );
  }

  if (statusQuery.isError || !status) {
    return (
      <AdminCard>
        <SectionFailure
          compact
          title="Resend status unavailable."
          description="Could not reach the Email Center backend. Sending is disabled until this recovers."
          onRetry={() => statusQuery.refetch()}
        />
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <div className="flex flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
            <Mail className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Resend</p>
              <StatusPill
                status={status.connected ? 'healthy' : 'unknown'}
                label={status.connection_detail}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Sending domain{' '}
              <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
                {status.sending_domain}
              </span>{' '}
              · {status.domain_detail} ·{' '}
              {status.sender_identities_verified !== null &&
              status.sender_identities_total !== null ? (
                <>
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {status.sender_identities_verified}
                  </span>{' '}
                  of {status.sender_identities_total} senders verified
                </>
              ) : (
                'sender verification unavailable'
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="mr-1 hidden text-[11px] text-slate-400 md:inline">
            Last checked {status.last_checked_at ? formatRelativeTime(status.last_checked_at) : 'never'}
          </span>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <a href={RESEND_DASHBOARD_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              Resend Dashboard
            </a>
          </Button>
        </div>
      </div>
    </AdminCard>
  );
}

/* ── Template picker ──────────────────────────────────────────────────── */

function TemplatePicker({
  templates,
  loading,
  activeId,
  onSelect,
}: {
  templates: EmailCenterTemplate[];
  loading: boolean;
  activeId: string | null;
  onSelect: (template: EmailCenterTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading} className="gap-1.5">
          <FileText className="size-3.5" />
          Use Template
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,360px)] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search templates…" />
          <CommandList>
            <CommandEmpty>No templates found.</CommandEmpty>
            <CommandGroup>
              {templates.map((template) => (
                <CommandItem
                  key={template.id}
                  value={`${template.name} ${template.subject}`}
                  onSelect={() => {
                    onSelect(template);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{template.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {template.subject}
                    </span>
                  </span>
                  {activeId === template.id && <Check className="size-4 shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ── Attachments ──────────────────────────────────────────────────────── */

function AttachmentPicker({
  attachments,
  onChange,
}: {
  attachments: StagedAttachment[];
  onChange: (next: StagedAttachment[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const stageFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      toast.error('Too many attachments', {
        description: `Maximum ${MAX_ATTACHMENTS} files per email.`,
      });
      return;
    }
    setBusy(true);
    try {
      const staged: StagedAttachment[] = [];
      let total = attachments.reduce((sum, item) => sum + item.size_bytes, 0);
      for (const file of Array.from(files)) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(`"${file.name}" is too large`, {
            description: 'Maximum 8 MB per file.',
          });
          continue;
        }
        if (total + file.size > MAX_ATTACHMENTS_TOTAL_BYTES) {
          toast.error('Attachments exceed 20 MB in total.');
          break;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('read failed'));
          reader.readAsDataURL(file);
        });
        const base64 = dataUrl.split(',')[1] ?? '';
        if (!base64) continue;
        total += file.size;
        staged.push({
          filename: file.name,
          content_base64: base64,
          content_type: file.type || null,
          size_bytes: file.size,
        });
      }
      if (staged.length) onChange([...attachments, ...staged]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
        Attachments <span className="ml-1 font-normal text-slate-400">· optional · max 5 files, 8 MB each, 20 MB total</span>
      </Label>
      <div className="mt-1.5">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => stageFiles(event.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="gap-1.5"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
          {busy ? 'Attaching…' : 'Attach files'}
        </Button>
      </div>
      {attachments.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {attachments.map((item) => (
            <li
              key={`${item.filename}-${item.size_bytes}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            >
              <Paperclip className="size-3" />
              <span className="max-w-44 truncate font-medium">{item.filename}</span>
              <span className="text-slate-400">{formatBytes(item.size_bytes)}</span>
              <button
                type="button"
                aria-label={`Remove ${item.filename}`}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                onClick={() =>
                  onChange(attachments.filter((candidate) => candidate !== item))
                }
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Dialogs ──────────────────────────────────────────────────────────── */

function SendConfirmDialog({
  open,
  onOpenChange,
  sender,
  to,
  cc,
  bcc,
  subject,
  onConfirm,
  sending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sender: EmailCenterSender | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  onConfirm: () => void;
  sending: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send this email?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 pt-1 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                <dl className="space-y-1.5 text-[13px]">
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-semibold text-slate-500">From:</dt>
                    <dd className="min-w-0 break-all text-slate-800 dark:text-slate-100">
                      {sender ? `${sender.name} <${sender.email}>` : '—'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-semibold text-slate-500">To:</dt>
                    <dd className="min-w-0 break-all text-slate-800 dark:text-slate-100">
                      {to.join(', ')}
                      {cc.length > 0 && <span className="text-slate-500"> · CC: {cc.join(', ')}</span>}
                      {bcc.length > 0 && (
                        <span className="text-slate-500"> · BCC: {bcc.length} recipient{bcc.length === 1 ? '' : 's'}</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-semibold text-slate-500">Subject:</dt>
                    <dd className="min-w-0 break-words text-slate-800 dark:text-slate-100">
                      {subject || '(no subject)'}
                    </dd>
                  </div>
                </dl>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This delivers immediately through Resend and is recorded in the activity log.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
          <Button onClick={onConfirm} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send Email
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TestSendDialog({
  open,
  onOpenChange,
  sender,
  pending,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sender: EmailCenterSender | null;
  pending: boolean;
  onSend: (recipient: string) => void;
}) {
  const [recipient, setRecipient] = useState('');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (open) {
      setRecipient('');
      setInvalid(false);
    }
  }, [open ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Beaker className="size-4" /> Send test email
          </DialogTitle>
          <DialogDescription>
            Sends{' '}
            <span className="font-mono text-xs font-medium">[Test] Reliastra Email Center Test</span>{' '}
            through the same Resend path as a real send.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label className="text-xs font-semibold">From</Label>
            <p className="mt-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
              {sender ? `${sender.name} <${sender.email}>` : 'No verified sender selected'}
            </p>
          </div>
          <div>
            <Label htmlFor="test-recipient" className="text-xs font-semibold">
              Test recipient
            </Label>
            <Input
              id="test-recipient"
              value={recipient}
              onChange={(event) => {
                setRecipient(event.target.value);
                setInvalid(false);
              }}
              placeholder="you@example.com"
              inputMode="email"
              className="mt-1.5"
              aria-invalid={invalid}
            />
            {invalid && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                Enter a valid email address.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || !sender}
            onClick={() => {
              if (!EMAIL_RE.test(recipient.trim())) {
                setInvalid(true);
                return;
              }
              onSend(recipient.trim());
            }}
            className="gap-2"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Send Test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddSenderDialog({
  open,
  onOpenChange,
  domain,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  onAdded: (email: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
    }
  }, [open ]);

  const mutation = useMutation({
    mutationFn: () => adminApi.addEmailSender({ email: email.trim(), name: name.trim() }),
    onSuccess: (sender) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-center', 'senders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-center', 'status'] });
      setName('');
      setEmail('');
      onOpenChange(false);
      onAdded(sender.email);
      toast.success('Sender added', { description: sender.email });
    },
    onError: (error: unknown) => {
      toast.error('Sender not added', { description: errorMessage(error, 'Please try again.') });
    },
  });

  const valid =
    name.trim().length > 0 &&
    EMAIL_RE.test(email.trim()) &&
    email.trim().toLowerCase().endsWith(`@${domain.toLowerCase()}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add sender</DialogTitle>
          <DialogDescription>
            Only <span className="font-mono text-xs">@{domain}</span> aliases whose domain is
            verified in Resend can be added.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label htmlFor="sender-name" className="text-xs font-semibold">
              Name
            </Label>
            <Input
              id="sender-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Reliastra Finance"
              className="mt-1.5"
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="sender-email" className="text-xs font-semibold">
              Email
            </Label>
            <Input
              id="sender-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={`finance@${domain}`}
              inputMode="email"
              className="mt-1.5"
            />
            {email.trim() && !email.trim().toLowerCase().endsWith(`@${domain.toLowerCase()}`) && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                The alias must belong to @{domain}.
              </p>
            )}
          </div>
          <p className="rounded-lg bg-slate-50 p-2.5 text-[11px] leading-5 text-slate-500 dark:bg-white/5 dark:text-slate-400">
            The backend verifies this identity against Resend before listing it. Unverified
            identities are rejected with an explanation — never silently accepted.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Add Sender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
