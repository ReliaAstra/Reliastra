'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  History,
  Loader2,
  Paperclip,
  Search,
} from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { formatAdminDate, formatRelativeTime } from '@/lib/admin-utils';
import { sanitizeEmailHtml } from '@/lib/email-sanitize';
import type {
  EmailCenterMessageDetail,
  EmailCenterMessageItem,
  EmailCenterMessageStatus,
} from '@/types/admin';
import {
  AdminCard,
  AdminEmptyState,
  Pagination,
  SectionFailure,
  SectionHeading,
  SectionSkeleton,
  StatusPill,
} from '@/components/admin/admin-primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const PAGE_SIZE = 15;

function statusTone(status: EmailCenterMessageStatus): string {
  switch (status) {
    case 'sent':
      return 'healthy';
    case 'failed':
      return 'failed';
    case 'queued':
      return 'pending';
    case 'rejected':
      return 'banned';
    default:
      return 'unknown';
  }
}

function recipientSummary(item: EmailCenterMessageItem): string {
  const to = item.recipients.to ?? [];
  if (!to.length) return '—';
  const extra = to.length - 1 + (item.recipients.cc?.length ?? 0) + (item.recipients.bcc?.length ?? 0);
  return extra > 0 ? `${to[0]} +${extra}` : to[0];
}

export function EmailActivitySection() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const messagesQuery = useQuery({
    queryKey: ['admin', 'email-center', 'messages', page, status, committedSearch],
    queryFn: () =>
      adminApi.emailMessages({
        page,
        page_size: PAGE_SIZE,
        status: status === 'all' ? undefined : status,
        search: committedSearch || undefined,
      }),
    staleTime: 15_000,
  });

  const items = messagesQuery.data?.items ?? [];
  const total = messagesQuery.data?.total ?? 0;

  return (
    <AdminCard>
      <SectionHeading
        title="Email Activity"
        subtitle="Every send attempt — successes and failures — with its provider receipt."
        action={
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setCommittedSearch(search.trim());
            }}
          >
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-32 text-xs" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search subject or sender…"
                className="h-8 w-44 pl-8 text-xs sm:w-56"
                aria-label="Search messages"
              />
            </div>
          </form>
        }
      />
      {messagesQuery.isLoading ? (
        <SectionSkeleton lines={5} />
      ) : messagesQuery.isError ? (
        <SectionFailure
          title="Activity unavailable."
          description="Could not load the email activity log."
          onRetry={() => messagesQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title="No emails yet"
          description={
            committedSearch || status !== 'all'
              ? 'No messages match these filters.'
              : 'Sent emails will appear here with their delivery status and provider receipt.'
          }
          icon={History}
        />
      ) : (
        <>
          <div className="overflow-x-auto border-t border-slate-100 dark:border-white/10">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-[0.08em] text-slate-400 dark:border-white/10">
                  <th className="px-5 py-2.5 font-semibold sm:px-6">Status</th>
                  <th className="px-3 py-2.5 font-semibold">From</th>
                  <th className="px-3 py-2.5 font-semibold">To</th>
                  <th className="px-3 py-2.5 font-semibold">Subject</th>
                  <th className="px-3 py-2.5 font-semibold">Provider</th>
                  <th className="px-3 py-2.5 font-semibold">Sent At</th>
                  <th className="px-3 py-2.5 pr-5 font-semibold sm:pr-6">Message ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    <td className="px-5 py-3 sm:px-6">
                      <span className="flex items-center gap-1.5">
                        <StatusPill status={statusTone(item.status)} label={item.status} />
                        {item.is_test && (
                          <Badge variant="outline" className="text-[10px]">
                            Test
                          </Badge>
                        )}
                      </span>
                    </td>
                    <td className="max-w-44 truncate px-3 py-3 text-[13px] text-slate-600 dark:text-slate-300">
                      {item.sender}
                    </td>
                    <td className="max-w-44 truncate px-3 py-3 text-[13px] text-slate-600 dark:text-slate-300">
                      {recipientSummary(item)}
                    </td>
                    <td className="max-w-64 truncate px-3 py-3 text-[13px] font-medium text-slate-800 dark:text-slate-100">
                      {item.subject}
                    </td>
                    <td className="px-3 py-3 text-[13px] capitalize text-slate-600 dark:text-slate-300">
                      {item.provider}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                      {formatRelativeTime(item.created_at)}
                    </td>
                    <td className="max-w-32 truncate px-3 py-3 pr-5 font-mono text-[11px] text-slate-400 sm:pr-6">
                      {item.provider_message_id ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}

      <MessageDetailSheet
        messageId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </AdminCard>
  );
}

function MessageDetailSheet({
  messageId,
  onClose,
}: {
  messageId: string | null;
  onClose: () => void;
}) {
  const detailQuery = useQuery({
    queryKey: ['admin', 'email-center', 'messages', 'detail', messageId],
    queryFn: () => adminApi.emailMessage(messageId as string),
    enabled: !!messageId,
    staleTime: 30_000,
  });

  const description = detailQuery.isLoading
    ? 'Loading the audit record…'
    : detailQuery.isError
      ? 'This record could not be loaded.'
      : 'Full audit record for this send attempt.';

  return (
    <Sheet open={!!messageId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Message detail</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <MessageDetailBody
          detail={detailQuery.data}
          loading={detailQuery.isLoading}
          failed={detailQuery.isError}
          onRetry={() => detailQuery.refetch()}
        />
      </SheetContent>
    </Sheet>
  );
}

function MessageDetailBody({
  detail: record,
  loading,
  failed,
  onRetry,
}: {
  detail: EmailCenterMessageDetail | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (failed || !record) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-slate-500">Could not load this record.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  const safeHtml = sanitizeEmailHtml(record.html_body);
  const previewDoc =
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head>` +
    `<body style="margin:0;padding:16px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">` +
    `<div style="background:#ffffff;border-radius:8px;padding:20px;">` +
    (safeHtml || '<p style="color:#9ca3af;">(no HTML body)</p>') +
    `</div></body></html>`;

  return (
    <div className="mt-4 space-y-5 pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={statusTone(record.status)} label={record.status} />
        {record.is_test && <Badge variant="outline">Test</Badge>}
        <Badge variant="secondary" className="capitalize">
          {record.provider}
        </Badge>
      </div>

      <dl className="space-y-3 rounded-lg border border-slate-200 p-4 text-[13px] dark:border-white/10">
        <Row label="From">
          {record.sender_name ? `${record.sender_name} <${record.sender}>` : record.sender}
        </Row>
        <Row label="To">{record.recipients.to.join(', ') || '—'}</Row>
        {record.recipients.cc.length > 0 && <Row label="CC">{record.recipients.cc.join(', ')}</Row>}
        {record.recipients.bcc.length > 0 && (
          <Row label="BCC">{record.recipients.bcc.join(', ')}</Row>
        )}
        <Row label="Subject">{record.subject}</Row>
        <Row label="Sent by">{record.admin_email ?? '—'}</Row>
        <Row label="Timestamp">{formatAdminDate(record.created_at, true)}</Row>
        <Row label="Provider ID" mono>
          {record.provider_message_id ?? '—'}
        </Row>
        {record.failure_reason && (
          <Row label="Error">
            <span className="text-rose-700 dark:text-rose-300">{record.failure_reason}</span>
          </Row>
        )}
        {record.attachments_meta && record.attachments_meta.length > 0 && (
          <Row label="Attachments">
            <span className="flex flex-wrap gap-1.5">
              {record.attachments_meta.map((item) => (
                <span
                  key={item.filename}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] dark:border-white/10 dark:bg-white/5"
                >
                  <Paperclip className="size-3" />
                  {item.filename}
                </span>
              ))}
            </span>
          </Row>
        )}
      </dl>

      <Tabs defaultValue={record.html_body ? 'html' : 'text'} className="w-full">
        <TabsList className="h-8">
          <TabsTrigger value="html" className="px-3 text-xs">
            HTML
          </TabsTrigger>
          <TabsTrigger value="text" className="px-3 text-xs">
            Plain Text
          </TabsTrigger>
        </TabsList>
        <TabsContent value="html" className="mt-3">
          {record.html_body ? (
            <iframe
              title="Sent message HTML"
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={previewDoc}
              className="h-72 w-full rounded-lg border border-slate-200 bg-white dark:border-white/10"
            />
          ) : (
            <p className="text-xs text-slate-400">(no HTML body)</p>
          )}
        </TabsContent>
        <TabsContent value="text" className="mt-3">
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
            {record.text_body || '(no plain-text body)'}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={
          mono
            ? 'min-w-0 break-all font-mono text-[11px] text-slate-700 dark:text-slate-200'
            : 'min-w-0 break-words text-slate-800 dark:text-slate-100'
        }
      >
        {children}
      </dd>
    </div>
  );
}
