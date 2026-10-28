'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CheckCheck,
  FileUp,
  KeyRound,
  Lock,
  PlugZap,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Unlock,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/admin-api';
import { formatAdminDate } from '@/lib/admin-utils';
import { cn } from '@/lib/utils';
import type {
  ProspectBatchSendResult,
  ProspectLead,
  ProspectProvider,
  ProspectProviderTestResult,
} from '@/types/admin';
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
const MAX_BATCH = 25;
const MAX_GENERATE = 8;

const STATUS_LABELS: Record<string, string> = {
  pending: 'no draft',
  ready: 'ready',
  approved: 'approved',
  failed: 'failed',
  sent: 'sent',
};

export function ProspectAiPage() {
  const queryClient = useQueryClient();
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const mdInputRef = useRef<HTMLInputElement>(null);
  const [jsonFile, setJsonFile] = useState<{ name: string; text: string } | null>(null);
  const [mdFile, setMdFile] = useState<{ name: string; text: string } | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProspectLead | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [batchSender, setBatchSender] = useState('');
  const [batchTemplateId, setBatchTemplateId] = useState('');
  const [batchResult, setBatchResult] = useState<ProspectBatchSendResult | null>(null);

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
  const sendersQuery = useQuery({
    queryKey: ['admin', 'email-center', 'senders'],
    queryFn: () => adminApi.emailSenders(),
    staleTime: 60_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'prospect-ai'] });
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
    mutationFn: (force: boolean) =>
      adminApi.prospectAiGenerate({ lead_ids: Array.from(checkedIds).slice(0, MAX_GENERATE), force }),
    onSuccess: async (leads) => {
      const failed = leads.filter((l) => l.draft_status === 'failed').length;
      toast.success(
        failed ? `Drafted ${leads.length - failed}, failed ${failed}.` : `Drafted ${leads.length}.`,
      );
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message || 'Generation failed.'),
  });

  const approveBatch = useMutation({
    mutationFn: () =>
      adminApi.prospectAiApproveBatch({ lead_ids: Array.from(checkedIds).slice(0, MAX_BATCH) }),
    onSuccess: async (leads) => {
      const approved = leads.filter((l) => l.draft_status === 'approved').length;
      toast.success(`Approved ${approved} of ${leads.length} selected.`);
      setCheckedIds(new Set());
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message || 'Approve failed.'),
  });

  const sendBatch = useMutation({
    mutationFn: () =>
      adminApi.prospectAiSendBatch({
        lead_ids: Array.from(checkedIds).slice(0, MAX_BATCH),
        sender: batchSender,
        template_id: batchTemplateId || undefined,
      }),
    onSuccess: async (result) => {
      setBatchResult(result);
      toast.success(`Batch ${result.batch_id.slice(0, 8)}: ${result.sent} sent, ${result.failed} failed.`);
      setCheckedIds(new Set());
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message || 'Batch send failed.'),
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
  const readyToApprove = selectedLeads.filter((l) => l.draft_status === 'ready');
  const approvedSelected = selectedLeads.filter((l) => l.draft_status === 'approved');
  const generatable = selectedLeads.filter((l) => l.draft_status !== 'sent');
  const needsForce = generatable.some((l) => l.draft_status === 'approved');
  const status = statusQuery.data;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Prospect AI"
        title="Prospect reports to first-touch drafts"
        description="Import a prospect report, generate evidence-backed drafts with your own LLM provider, review and approve each one, then send singly or in batch. Nothing sends without an approval."
        actions={<StatusBadges status={status} />}
      />

      <ProviderPanel />

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
              onClick={() => { setReportId(null); setCheckedIds(new Set()); setBatchResult(null); }}
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
                  onClick={() => { setReportId(report.id); setCheckedIds(new Set()); setBatchResult(null); }}
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

          {/* Selection bar: authority only moves through approvals. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.02]">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {checkedIds.size} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => approveBatch.mutate()}
              disabled={readyToApprove.length === 0 || approveBatch.isPending}
              className="gap-1.5"
            >
              <CheckCheck className="size-3.5" />
              Approve ready ({readyToApprove.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (needsForce) {
                  const ok = window.confirm(
                    `Regenerate also overwrites ${approvedSelected.length} approved draft(s). Proceed?`,
                  );
                  if (!ok) return;
                }
                generate.mutate(true);
              }}
              disabled={generatable.length === 0 || generatable.length > MAX_GENERATE || generate.isPending}
              className="gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              Regenerate drafts ({Math.min(generatable.length, MAX_GENERATE)})
            </Button>
            <Button
              size="sm"
              onClick={() => sendBatch.mutate()}
              disabled={
                approvedSelected.length === 0 ||
                !batchSender ||
                sendBatch.isPending ||
                (status?.sends_remaining_today ?? 0) === 0
              }
              className="gap-1.5"
            >
              <Send className="size-3.5" />
              Send batch ({approvedSelected.length} approved)
            </Button>
            {selectedLeads.length > MAX_GENERATE && (
              <span className="text-xs text-amber-600">Drafting caps at {MAX_GENERATE} per run; batch sending caps at {MAX_BATCH}.</span>
            )}
            <span className="ml-auto flex items-center gap-3">
              <select
                aria-label="Batch sender"
                value={batchSender}
                onChange={(event) => setBatchSender(event.target.value)}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none transition focus:border-blue-500 dark:border-white/10 dark:bg-card dark:text-slate-100"
              >
                <option value="">Batch sender…</option>
                {(sendersQuery.data?.senders ?? [])
                  .filter((s) => s.enabled && s.verified)
                  .map((s) => (
                    <option key={s.email} value={s.email}>{s.email}</option>
                  ))}
              </select>
              <TemplatePicker
                value={batchTemplateId}
                onChange={setBatchTemplateId}
                label="Batch template"
              />
            </span>
          </div>

          {batchResult && <BatchResultSummary result={batchResult} />}

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

      <DraftInspector draft={selected} onClose={() => setSelected(null)} onChanged={refresh} />
    </div>
  );
}

function StatusBadges({ status }: {
  status?: {
    ai_available: boolean;
    model_name: string | null;
    provider_source: string;
    daily_send_cap: number;
    sends_remaining_today: number;
    total_leads: number;
  };
}) {
  if (!status) return null;
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      {status.ai_available ? (
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <CheckCircle2 className="size-3.5" />
          AI ready · {status.model_name ? `${status.model_name} ` : ''}
          ({status.provider_source === 'profile' ? 'provider profile' : 'platform config'})
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-amber-600">
          <TriangleAlert className="size-3.5" /> No LLM configured
        </span>
      )}
      <span>· sends left today: {status.sends_remaining_today}/{status.daily_send_cap}</span>
      <span>· {status.total_leads} leads</span>
    </span>
  );
}

function TemplatePicker({ value, onChange, label }: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const templatesQuery = useQuery({
    queryKey: ['admin', 'email-center', 'templates'],
    queryFn: () => adminApi.emailTemplates(),
    staleTime: 60_000,
  });
  const templates = templatesQuery.data ?? [];
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none transition focus:border-blue-500 dark:border-white/10 dark:bg-card dark:text-slate-100"
    >
      <option value="">Plain text (no template)</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>Template: {t.name}</option>
      ))}
    </select>
  );
}

function BatchResultSummary({ result }: { result: ProspectBatchSendResult }) {
  return (
    <div className="max-h-48 overflow-y-auto border-b border-slate-100 bg-slate-50/70 p-3 text-xs dark:border-white/10 dark:bg-white/[0.02]">
      <p className="mb-1.5 font-semibold text-slate-700 dark:text-slate-200">
        Batch {result.batch_id.slice(0, 8)} · {result.sent} sent · {result.failed} failed
      </p>
      <table className="w-full text-left">
        <tbody>
          {result.results.map((row) => (
            <tr key={row.lead_id} className="text-slate-600 dark:text-slate-300">
              <td className="w-24 py-0.5">
                {row.status === 'sent' ? (
                  <span className="text-emerald-600">sent</span>
                ) : row.status === 'failed' ? (
                  <span className="text-rose-600">failed</span>
                ) : (
                  <span className="text-amber-600">skipped</span>
                )}
              </td>
              <td className="py-0.5 font-mono">{row.lead_id.slice(0, 8)}</td>
              <td className="py-0.5">{row.error || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProviderPanel() {
  const queryClient = useQueryClient();
  const [providerType, setProviderType] = useState('openai_compatible');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testResult, setTestResult] = useState<ProspectProviderTestResult | null>(null);

  const providerQuery = useQuery({
    queryKey: ['admin', 'prospect-ai', 'provider'],
    queryFn: adminApi.prospectAiProvider,
    staleTime: 30_000,
  });

  const applyProfile = (profile: ProspectProvider | null) => {
    if (!profile) return;
    setProviderType(profile.provider_type);
    setEndpointUrl(profile.endpoint_url);
    setModel(profile.model);
    setApiKey('');
  };

  const save = useMutation({
    mutationFn: () =>
      adminApi.prospectAiSaveProvider({
        provider_type: providerType,
        endpoint_url: endpointUrl,
        model,
        api_key: apiKey || undefined,
      }),
    onSuccess: async (profile) => {
      toast.success('Provider profile saved. Key stored encrypted.');
      applyProfile(profile);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'prospect-ai'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Save failed.'),
  });

  const test = useMutation({
    mutationFn: () => {
      // Unsaved candidate values are probed without persisting anything;
      // omitted fields fall back to the saved profile.
      if (endpointUrl || model || apiKey) {
        return adminApi.prospectAiTestProvider({
          provider_type: providerType,
          endpoint_url: endpointUrl || undefined,
          model: model || undefined,
          api_key: apiKey || undefined,
        });
      }
      return adminApi.prospectAiTestProvider({});
    },
    onSuccess: async (result) => {
      setTestResult(result);
      if (result.ok) toast.success(`Connection OK (${result.latency_ms} ms).`);
      else toast.error(result.detail);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'prospect-ai', 'provider'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Test failed.'),
  });

  const profile = providerQuery.data;

  return (
    <AdminCard>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <KeyRound className="size-4 text-slate-500" /> LLM provider
          </p>
          {profile ? (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="size-3.5 text-emerald-600" />
              Active: {profile.model} · key ····{profile.api_key_last4 || '????'}
              {profile.last_test_ok === true && <span className="text-emerald-600">· test OK</span>}
              {profile.last_test_ok === false && <span className="text-rose-600">· test failed</span>}
            </span>
          ) : (
            <span className="text-xs text-slate-500">No profile - drafting falls back to RELIASTRA_AI_* env config.</span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Bring any OpenAI-compatible, Anthropic or Google endpoint. The key is stored encrypted
          at rest and outbound calls are SSRF-pinned to the endpoint&apos;s resolved address.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">Provider</label>
            <select
              value={providerType}
              onChange={(e) => setProviderType(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-white/10 dark:bg-card dark:text-slate-100"
            >
              <option value="openai_compatible">OpenAI-compatible</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">Model</label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" className="h-9 text-xs" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">Endpoint URL (https)</label>
            <Input
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder="https://api.openai.com/v1/chat/completions"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
              API key{profile ? ' (leave blank to keep stored key)' : ''}
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={profile ? 'unchanged' : 'sk-…'}
              className="h-9 text-xs"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save profile</Button>
          <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending} className="gap-1.5">
            <PlugZap className="size-3.5" /> Test connection
          </Button>
          {testResult && (
            <span className={cn('text-xs', testResult.ok ? 'text-emerald-600' : 'text-rose-600')}>
              {testResult.ok ? 'OK' : 'Failed'}{testResult.latency_ms ? ` · ${testResult.latency_ms} ms` : ''} · {testResult.detail}
            </span>
          )}
        </div>
      </div>
    </AdminCard>
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
      <table className="w-full min-w-[900px] text-left">
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
            {['#', 'Company', 'Contact', 'Evidence signal', 'Angle', 'Draft', ''].map((h) => (
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
              <td className="px-4 py-3 text-xs text-slate-500 tabular-nums">{lead.rank ?? '-'}</td>
              <td className="px-4 py-3">
                <button type="button" onClick={() => onSelect(lead)} className="block max-w-xs text-left">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                    {lead.draft_status === 'approved' && <Lock className="size-3 text-emerald-600" aria-label="approved" />}
                    <span className="truncate">{lead.company}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{lead.domain}</span>
                </button>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                {lead.contact_email ? (
                  <span className="block max-w-[200px] truncate">{lead.contact_email}</span>
                ) : (
                  <span className="text-xs text-slate-400">no email</span>
                )}
                {lead.contact_name && <span className="mt-0.5 block max-w-[200px] truncate text-xs text-slate-500">{lead.contact_name} · {lead.role}</span>}
              </td>
              <td className="max-w-[240px] truncate px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{lead.pain_signal || lead.outreach_hook || '-'}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{lead.draft_angle || ''}</td>
              <td className="px-4 py-3"><StatusPill status={lead.draft_status} label={STATUS_LABELS[lead.draft_status]} /></td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {lead.draft_status === 'sent' ? formatAdminDate(lead.sent_at || lead.drafted_at) : lead.draft_error || ''}
              </td>
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
  const [templateId, setTemplateId] = useState('');
  const activeSubject = subject ?? draft?.draft_subject ?? '';
  const activeBody = body ?? draft?.draft_body ?? '';

  const sendersQuery = useQuery({
    queryKey: ['admin', 'email-center', 'senders'],
    queryFn: () => adminApi.emailSenders(),
    enabled: Boolean(draft),
    staleTime: 60_000,
  });
  const enabledSenders = (sendersQuery.data?.senders ?? []).filter((s) => s.enabled && s.verified);

  const finish = async () => {
    setSubject(null);
    setBody(null);
    await queryClient.invalidateQueries({ queryKey: ['admin', 'prospect-ai'] });
    onChanged();
  };

  const save = useMutation({
    mutationFn: () =>
      adminApi.prospectAiReviewDraft(draft!.id, { subject: activeSubject, body_text: activeBody }),
    onSuccess: async () => {
      toast.success('Draft saved (returns to ready for approval).');
      await finish();
    },
    onError: (error: Error) => toast.error(error.message || 'Save failed.'),
  });
  const approve = useMutation({
    mutationFn: () => adminApi.prospectAiApprove(draft!.id),
    onSuccess: async () => {
      toast.success('Draft approved. It can now be sent.');
      await finish();
    },
    onError: (error: Error) => toast.error(error.message || 'Approve failed.'),
  });
  const unapprove = useMutation({
    mutationFn: () => adminApi.prospectAiUnapprove(draft!.id),
    onSuccess: async () => {
      toast.success('Approval lifted.');
      await finish();
    },
    onError: (error: Error) => toast.error(error.message || 'Unapprove failed.'),
  });
  const regenerate = useMutation({
    mutationFn: () => adminApi.prospectAiGenerate({ lead_ids: [draft!.id], force: true }),
    onSuccess: async (leads) => {
      const failed = leads[0]?.draft_status === 'failed';
      toast[failed ? 'error' : 'success'](
        failed ? leads[0]?.draft_error || 'Generation failed.' : 'Draft regenerated.',
      );
      await finish();
    },
    onError: (error: Error) => toast.error(error.message || 'Generation failed.'),
  });
  const send = useMutation({
    mutationFn: () =>
      adminApi.prospectAiSend(draft!.id, {
        sender,
        template_id: templateId || undefined,
      }),
    onSuccess: async () => {
      toast.success('Sent via Email Center.');
      onClose();
      await finish();
    },
    onError: (error: Error) => toast.error(error.message || 'Send blocked.'),
  });

  const isApproved = draft?.draft_status === 'approved';
  const dirty = subject !== null || body !== null;

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
          {draft?.draft_angle && (
            <EvidenceBlock
              label="Angle chosen by the model"
              value={[
                draft.draft_angle,
                ...(draft.draft_rejected_angles ?? [])
                  .filter((r) => r && typeof r === 'object')
                  .map((r) => `rejected ${r.angle}: ${r.why_not ?? ''}`),
              ].join('\n')}
            />
          )}
          <EvidenceBlock label="Pain signal" value={draft?.pain_signal} />
          <EvidenceBlock label="External dependencies" value={draft?.external_dependencies} />
          <EvidenceBlock label="Evidence" value={draft?.evidence} />
          <EvidenceBlock label="Why RELIASTRA is relevant" value={draft?.why_reliastra_is_relevant} />
          <EvidenceBlock label="Outreach hook" value={draft?.outreach_hook} />
          <Input value={activeSubject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" placeholder="Subject" disabled={draft?.draft_status === 'sent'} />
          <Textarea value={activeBody} onChange={(e) => setBody(e.target.value)} rows={14} aria-label="Draft body" placeholder="Draft body" disabled={draft?.draft_status === 'sent'} />
          {draft?.draft_error && (
            <p className="text-xs text-amber-600">{draft.draft_error}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {isApproved ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Lock className="size-3.5" /> Approved{draft?.approved_at ? ` ${formatAdminDate(draft.approved_at)}` : ''} - editable only after lifting approval
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Unlock className="size-3.5" /> Not approved yet - nothing can send
              </span>
            )}
          </div>
          <div>
            <label htmlFor="prospect-send-sender" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
              Send from
            </label>
            <div className="flex gap-2">
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
              <TemplatePicker value={templateId} onChange={setTemplateId} label="Send template" />
            </div>
          </div>
        </div>
        <SheetFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => save.mutate()} disabled={save.isPending || draft?.draft_status === 'sent' || isApproved && !dirty}>
            Save
          </Button>
          {isApproved ? (
            <Button variant="outline" size="sm" onClick={() => unapprove.mutate()} disabled={unapprove.isPending} className="gap-1.5">
              <Lock className="size-3.5" /> Lift approval
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => approve.mutate()} disabled={approve.isPending || draft?.draft_status === 'sent'} className="gap-1.5">
              <CheckCircle2 className="size-3.5" /> Approve
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (isApproved) {
                const ok = window.confirm('Regenerating overwrites this approved draft. Proceed?');
                if (!ok) return;
              }
              regenerate.mutate();
            }}
            disabled={regenerate.isPending || draft?.draft_status === 'sent'}
            className="gap-1.5"
          >
            <RefreshCw className="size-3.5" /> Regenerate
          </Button>
          <Button
            size="sm"
            onClick={() => send.mutate()}
            disabled={!isApproved || !sender || !draft?.contact_email || send.isPending}
            className="gap-1.5"
          >
            <Send className="size-3.5" /> Send
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
