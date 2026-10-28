'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileUp, Send, Sparkles, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/admin-api';
import { formatAdminDate } from '@/lib/admin-utils';
import { cn } from '@/lib/utils';
import type { ProspectLead } from '@/types/admin';
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  SectionFailure,
  SectionSkeleton,
  StatusPill,
} from '@/components/admin/admin-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const MAX_UPLOAD_BYTES = 2_000_000;

export function ProspectAiPage() {
  const queryClient = useQueryClient();
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const mdInputRef = useRef<HTMLInputElement>(null);
  const [jsonFile, setJsonFile] = useState<{ name: string; text: string } | null>(null);
  const [mdFile, setMdFile] = useState<{ name: string; text: string } | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProspectLead | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const statusQuery = useQuery({
    queryKey: ['admin', 'prospect-ai', 'status'],
    queryFn: adminApi.prospectAiStatus,
    staleTime: 30_000,
  });
  const reportsQuery = useQuery({
    queryKey: ['admin', 'prospect-ai', 'reports'],
    queryFn: adminApi.prospectAiReports,
    staleTime: 60_000,
  });
  const leadsQuery = useQuery({
    queryKey: ['admin', 'prospect-ai', 'leads', reportId],
    queryFn: () =>
      adminApi.prospectAiLeads(reportId ? { report_id: reportId, limit: 500 } : { limit: 500 }),
    staleTime: 30_000,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'prospect-ai'] }),
    ]);
  };

  const readFile = async (file: File | undefined, setter: (v: { name: string; text: string } | null) => void) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('File too large (max 2 MB).');
      return;
    }
    setter({ name: file.name, text: await file.text() });
  };

  const importReport = useMutation({
    mutationFn: () =>
      adminApi.prospectAiImport({
        filename: jsonFile!.name,
        json_text: jsonFile!.text,
        md_text: mdFile?.text,
      }),
    onSuccess: async (result) => {
      toast.success(`Imported ${result.imported} prospects (${result.skipped} skipped).`);
      setJsonFile(null);
      setMdFile(null);
      if (jsonInputRef.current) jsonInputRef.current.value = '';
      if (mdInputRef.current) mdInputRef.current.value = '';
      setReportId(result.report.id);
      setCheckedIds(new Set());
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message || 'Import failed.'),
  });

  const generate = useMutation({
    mutationFn: () =>
      adminApi.prospectAiGenerate({ lead_ids: Array.from(checkedIds).slice(0, 8) }),
    onSuccess: async (leads) => {
      const failed = leads.filter((l) => l.draft_status === 'failed').length;
      toast.success(
        failed ? `Drafted ${leads.length - failed}, failed ${failed}.` : `Drafted ${leads.length}.`,
      );
      setCheckedIds(new Set());
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message || 'Generation failed.'),
  });

  const deleteReport = useMutation({
    mutationFn: (id: string) => adminApi.prospectAiDeleteReport(id),
    onSuccess: async () => {
      toast.success('Report deleted.');
      setReportId(null);
      setCheckedIds(new Set());
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message || 'Delete failed.'),
  });

  const leads = leadsQuery.data ?? [];
  const selectedLeads = leads.filter((lead) => checkedIds.has(lead.id));
  const generatable = selectedLeads.filter((l) => l.draft_status !== 'sent' && l.contact_email !== undefined);
  const canGenerate = generatable.length > 0 && generatable.length <= 8 && !generate.isPending;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Prospect AI"
        title="Prospect reports to first-touch drafts"
        description="Upload a prospect report, generate AI drafts from the researched evidence, review each one, then send through the Email Center."
        actions={
          <StatusBadges status={statusQuery.data} />
        }
      />

      <ImportPanel
        jsonInputRef={jsonInputRef}
        mdInputRef={mdInputRef}
        jsonFile={jsonFile}
        mdFile={mdFile}
        onJson={(file) => readFile(file, setJsonFile)}
        onMd={(file) => readFile(file, setMdFile)}
        onImport={() => importReport.mutate()}
        importing={importReport.isPending}
      />

      {reportsQuery.data && reportsQuery.data.length > 0 && (
        <AdminCard>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4 dark:border-white/10 sm:p-5">
            <button
              type="button"
              onClick={() => { setReportId(null); setCheckedIds(new Set()); }}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium',
                reportId === null
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300',
              )}
            >
              All reports
            </button>
            {reportsQuery.data.map((report) => (
              <span key={report.id} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setReportId(report.id); setCheckedIds(new Set()); }}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium',
                    reportId === report.id
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300',
                  )}
                  title={`${report.prospect_count} prospects · imported ${formatAdminDate(report.created_at)}`}
                >
                  {report.report_date || report.source_filename} · {report.prospect_count}
                </button>
                <button
                  type="button"
                  onClick={() => deleteReport.mutate(report.id)}
                  className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  aria-label={`Delete report ${report.report_date || report.source_filename}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
          <LeadTable
            query={leadsQuery}
            checkedIds={checkedIds}
            onToggle={(id) => {
              const next = new Set(checkedIds);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              setCheckedIds(next);
            }}
            onToggleAll={(ids, allChecked) => setCheckedIds(allChecked ? new Set() : new Set(ids))}
            onSelect={setSelected}
          />
        </AdminCard>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => generate.mutate()} disabled={!canGenerate} className="gap-1.5">
          <Sparkles className="size-3.5" />
          Generate drafts with AI ({Math.min(selectedLeads.length, 8)}{selectedLeads.length > 8 ? ` of ${selectedLeads.length} selected` : ''})
        </Button>
        {selectedLeads.length > 8 && (
          <p className="text-xs text-red-600">Max 8 drafts per run - deselect {selectedLeads.length - 8}.</p>
        )}
        {statusQuery.data && !statusQuery.data.ai_available && (
          <p className="inline-flex items-center gap-1.5 text-xs text-amber-600">
            <TriangleAlert className="size-3.5" /> RELIASTRA AI is not configured (RELIASTRA_AI_* settings) - drafting disabled.
          </p>
        )}
      </div>

      <DraftInspector draft={selected} onClose={() => setSelected(null)} onChanged={refresh} />
    </div>
  );
}

function StatusBadges({ status }: { status?: { ai_available: boolean; model_name: string | null; total_leads: number } }) {
  if (!status) return null;
  return (
    <span className="flex items-center gap-2 text-xs text-slate-500">
      {status.ai_available ? (
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <CheckCircle2 className="size-3.5" /> AI ready {status.model_name ? `· ${status.model_name}` : ''}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-amber-600">
          <TriangleAlert className="size-3.5" /> AI unavailable
        </span>
      )}
      <span>· {status.total_leads} leads</span>
    </span>
  );
}

function ImportPanel({
  jsonInputRef,
  mdInputRef,
  jsonFile,
  mdFile,
  onJson,
  onMd,
  onImport,
  importing,
}: {
  jsonInputRef: React.RefObject<HTMLInputElement | null>;
  mdInputRef: React.RefObject<HTMLInputElement | null>;
  jsonFile: { name: string; text: string } | null;
  mdFile: { name: string; text: string } | null;
  onJson: (file: File | undefined) => void;
  onMd: (file: File | undefined) => void;
  onImport: () => void;
  importing: boolean;
}) {
  return (
    <AdminCard>
      <div className="space-y-3 p-4 sm:p-5">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Import prospect report</p>
        <p className="text-xs text-slate-500">
          The daily research JSON (array or object with a <code className="rounded bg-slate-100 px-1 dark:bg-white/10">prospects</code> key). The Markdown twin is optional and archived for reference.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 dark:border-white/10 dark:bg-card dark:text-slate-200">
            <Upload className="size-3.5" />
            {jsonFile ? jsonFile.name : 'Choose .json report'}
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => onJson(event.target.files?.[0])}
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 dark:border-white/10 dark:bg-card dark:text-slate-200">
            <FileUp className="size-3.5" />
            {mdFile ? mdFile.name : 'Optional .md twin'}
            <input
              ref={mdInputRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              className="sr-only"
              onChange={(event) => onMd(event.target.files?.[0])}
            />
          </label>
          <Button onClick={onImport} disabled={!jsonFile || importing} className="gap-1.5">
            <Upload className="size-3.5" /> Import
          </Button>
        </div>
      </div>
    </AdminCard>
  );
}

function LeadTable({
  query,
  checkedIds,
  onToggle,
  onToggleAll,
  onSelect,
}: {
  query: { isLoading: boolean; isError: boolean; data?: ProspectLead[]; refetch: () => unknown };
  checkedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], allChecked: boolean) => void;
  onSelect: (lead: ProspectLead) => void;
}) {
  if (query.isLoading) return <SectionSkeleton lines={10} />;
  if (query.isError)
    return <SectionFailure title="Lead list unavailable." description="Try refreshing." onRetry={() => query.refetch()} />;
  const leads = query.data ?? [];
  if (!leads.length)
    return <AdminEmptyState title="No prospects yet." description="Import a prospect report to get started." icon={Upload} />;
  const ids = leads.map((lead) => lead.id);
  const allChecked = ids.every((id) => checkedIds.has(id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.02]">
            <th className="px-4 py-2.5">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => onToggleAll(ids, allChecked)}
                aria-label="Select all leads"
              />
            </th>
            {['#', 'Company', 'Contact', 'Pain signal', 'Draft', ''].map((h) => (
              <th key={h || 'action'} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-white/10 dark:hover:bg-white/[0.03]">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={checkedIds.has(lead.id)}
                  onChange={() => onToggle(lead.id)}
                  aria-label={`Select ${lead.company}`}
                />
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{lead.rank ?? '-'}</td>
              <td className="px-4 py-3">
                <button type="button" onClick={() => onSelect(lead)} className="block max-w-xs text-left">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{lead.company}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{lead.domain}{lead.website && lead.website !== lead.domain ? ` · ${lead.website}` : ''}</span>
                </button>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                {lead.contact_email ? (
                  <span className="block max-w-[220px] truncate">{lead.contact_email}</span>
                ) : (
                  <span className="text-xs text-slate-400">no email</span>
                )}
                {lead.contact_name && <span className="mt-0.5 block max-w-[220px] truncate text-xs text-slate-500">{lead.contact_name} · {lead.role}</span>}
              </td>
              <td className="max-w-[280px] truncate px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{lead.pain_signal || lead.outreach_hook || '-'}</td>
              <td className="px-4 py-3"><StatusPill status={lead.draft_status} /></td>
              <td className="px-4 py-3 text-xs text-slate-500">{lead.draft_status === 'sent' ? formatAdminDate(lead.drafted_at) : lead.draft_error || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DraftInspector({ draft, onClose, onChanged }: {
  draft: ProspectLead | null;
  onClose: () => void;
  onChanged: () => unknown;
}) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [sender, setSender] = useState('');
  const activeSubject = subject ?? draft?.draft_subject ?? '';
  const activeBody = body ?? draft?.draft_body ?? '';

  const sendersQuery = useQuery({
    queryKey: ['admin', 'email-center', 'senders'],
    queryFn: () => adminApi.emailSenders(),
    enabled: Boolean(draft),
    staleTime: 60_000,
  });
  const enabledSenders = (sendersQuery.data?.senders ?? []).filter((s) => s.enabled && s.verified);

  const save = useMutation({
    mutationFn: () =>
      adminApi.prospectAiReviewDraft(draft!.id, { subject: activeSubject, body_text: activeBody }),
    onSuccess: async () => {
      toast.success('Draft saved.');
      setSubject(null);
      setBody(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'prospect-ai'] });
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message || 'Save failed.'),
  });
  const send = useMutation({
    mutationFn: () => adminApi.prospectAiSend(draft!.id, { sender }),
    onSuccess: async () => {
      toast.success('Sent via Email Center.');
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['admin', 'prospect-ai'] });
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message || 'Send blocked.'),
  });

  return (
    <Sheet open={!!draft} onOpenChange={(open) => { if (!open) { onClose(); setSubject(null); setBody(null); } }}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{draft?.company}</SheetTitle>
          <SheetDescription>
            {draft?.domain} · {draft?.contact_email || 'no public email - send disabled'}
            {draft?.role && draft?.contact_name ? ` · ${draft.contact_name}, ${draft.role}` : ''}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3 overflow-y-auto px-4 pb-4 sm:px-6">
          <EvidenceBlock label="Pain signal" value={draft?.pain_signal} />
          <EvidenceBlock label="External dependencies" value={draft?.external_dependencies} />
          <EvidenceBlock label="Evidence" value={draft?.evidence} />
          <EvidenceBlock label="Why RELIASTRA is relevant" value={draft?.why_reliastra_is_relevant} />
          <EvidenceBlock label="Outreach hook" value={draft?.outreach_hook} />
          <Input value={activeSubject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" placeholder="Subject" />
          <Textarea value={activeBody} onChange={(e) => setBody(e.target.value)} rows={14} aria-label="Draft body" placeholder="Draft body" />
          {draft?.draft_error && <p className="text-xs text-red-600">Last attempt failed: {draft.draft_error}</p>}
          <div>
            <label htmlFor="prospect-send-sender" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
              Send from
            </label>
            <select
              id="prospect-send-sender"
              value={sender}
              onChange={(event) => setSender(event.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-white/10 dark:bg-card dark:text-slate-100"
            >
              <option value="">Choose a verified sender…</option>
              {enabledSenders.map((s) => (
                <option key={s.email} value={s.email}>{s.name} · {s.email}</option>
              ))}
            </select>
          </div>
        </div>
        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>Save draft</Button>
          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || !sender || !draft?.contact_email || draft?.draft_status === 'sent'}
            className="gap-1.5"
          >
            <Send className="size-3.5" /> Review &amp; send
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function EvidenceBlock({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="max-h-24 overflow-y-auto whitespace-pre-wrap">{value}</p>
    </div>
  );
}
