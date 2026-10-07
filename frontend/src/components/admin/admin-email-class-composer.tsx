'use client';

/**
 * Compose-from-class panel for the Email Center.
 *
 * The compiled template rows ship fixtures baked in, so they can never be
 * sent. This panel is the sendable path instead: pick a class, fill its
 * declared fields (or bind a live incident/evidence record to prefill the
 * machine values), render the actual components with those values, review the
 * result, and drop it into the composer. The send itself still goes through
 * the existing composer flow — sanitizer, contract enforcement, audit log.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { adminApi, AdminApiError } from '@/lib/admin-api';
import { sanitizeEmailHtml } from '@/lib/email-sanitize';
import type { EmailClass } from '@/types/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface ClassDraft {
  classId: string;
  className: string;
  subject: string;
  html: string;
  text: string;
  variables: Record<string, string>;
}

const BOOLEAN_VARS = new Set([
  'first_response',
  'awaiting_customer',
  'requires_confirmation',
  'contact_first',
  'suppressed',
  'signed',
]);

const ENUM_OPTIONS: Record<string, string[]> = {
  'billing:event': [
    'payment_succeeded',
    'payment_failed',
    'trial_ending',
    'trial_expired',
    'plan_changed',
    'refund_processed',
  ],
  'security:event': [
    'new_device_login',
    'admin_action',
    'secret_rotated',
    'api_key_created',
    'suspicious_activity',
    'domain_changed',
  ],
  'partner:event': ['invitation', 'terms', 'payout_sent', 'payout_pending'],
  'internal_ops:severity': ['info', 'warning', 'critical'],
};

const LONG_VARS = new Set([
  'remediation',
  'detail',
  'containment',
  'note',
  'body_1',
  'body_2',
  'next_step',
]);

const DATE_RE = /(_at|_start|_end|_date)$/;
const NUMBER_RE =
  /(count|seconds|score|ceiling|bytes|days|hours|threshold|interval|retention)$/;

type FieldKind = 'text' | 'textarea' | 'number' | 'datetime' | 'boolean' | 'toggle' | 'enum';

const IDENTITY_DEFAULTS: Record<string, string> = {
  dashboard_url: 'https://reliastra.com/dashboard',
  support_email: 'support@reliastra.com',
  address: 'Reliastra · Lagos, Nigeria',
  preferences_url: 'https://reliastra.com/dashboard/settings/notifications',
  security_email: 'security@reliastra.com',
};

function fieldKind(classId: string, name: string): FieldKind {
  // Section toggles default to shown: an absent value renders the section.
  if (name.startsWith('show_')) return 'toggle';
  if (BOOLEAN_VARS.has(name)) return 'boolean';
  const options = ENUM_OPTIONS[`${classId}:${name}`];
  if (options) return 'enum';
  if (LONG_VARS.has(name)) return 'textarea';
  if (DATE_RE.test(name)) return 'datetime';
  if (NUMBER_RE.test(name)) return 'number';
  return 'text';
}

/** datetime-local value ("2026-03-11T04:12") -> full ISO for the builder. */
function datetimeLocalToISO(value: string): string {
  const t = value.trim();
  if (!t) return '';
  return /:\d{2}$/.test(t) ? `${t}:00Z`.replace('T', 'T') : `${t}Z`;
}

/** ISO/display stamp -> datetime-local value for editing. */
function isoToDatetimeLocal(value: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?/.exec(value.trim());
  return m ? `${m[1]}T${m[2]}` : value;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof AdminApiError) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function AdminEmailClassComposer({
  onUse,
}: {
  onUse: (draft: ClassDraft) => void;
}) {
  const classesQuery = useQuery({
    queryKey: ['admin', 'email-center', 'classes'],
    queryFn: adminApi.emailClasses,
    staleTime: 60_000,
  });
  const classes = classesQuery.data?.classes ?? [];
  const loadError = classesQuery.data?.load_error ?? null;

  const [classId, setClassId] = useState('');
  const spec: EmailClass | undefined = classes.find((c) => c.id === classId) ?? undefined;
  const [values, setValues] = useState<Record<string, string>>({});
  const [incidentId, setIncidentId] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  const setValue = (name: string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setPreview(null);
    setFieldErrors((current) => current.filter((f) => f !== name));
  };

  const selectClass = (id: string) => {
    setClassId(id);
    setPreview(null);
    setMissing([]);
    setFieldErrors([]);
    // Editable defaults, not surprises: the deterministic open rule and
    // every section toggle start in their showing state.
    const next: Record<string, string> = {};
    const target = classes.find((c) => c.id === id);
    if (target?.variables.some((v) => v.name === 'confirm_threshold')) {
      next.confirm_threshold = '2';
    }
    for (const v of target?.variables ?? []) {
      if (v.name.startsWith('show_')) next[v.name] = 'true';
    }
    setValues(next);
    setIncidentId('');
    setEvidenceId('');
  };

  const bindMutation = useMutation({
    mutationFn: () =>
      adminApi.bindEmailClass(classId, {
        ...(incidentId.trim() ? { incident_id: incidentId.trim() } : {}),
        ...(evidenceId.trim() ? { evidence_id: evidenceId.trim() } : {}),
      }),
    onSuccess: (result) => {
      setValues((current) => ({ ...current, ...result.variables }));
      setMissing(result.missing);
      setPreview(null);
      const bound = Object.keys(result.variables).length;
      toast.success('Records bound', {
        description:
          result.missing.length > 0
            ? `${bound} field${bound === 1 ? '' : 's'} filled from live records; ${result.missing.length} still need values.`
            : `${bound} fields filled from live records. Nothing is missing.`,
      });
    },
    onError: (error: unknown) => {
      toast.error('Binding failed', { description: errorMessage(error, 'Please try again.') });
    },
  });

  const renderMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/email-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-request': '1' },
        body: JSON.stringify({ class_id: classId, variables: values }),
      });
      const payload = (await response.json().catch(() => null)) as {
        subject?: string;
        html?: string;
        text?: string;
        error?: string;
        fields?: string[];
      } | null;
      if (!response.ok) {
        const err = new Error(payload?.error || 'Render failed.') as Error & { fields?: string[] };
        err.fields = payload?.fields;
        throw err;
      }
      if (!payload || typeof payload.html !== 'string') {
        throw new Error('Render returned no document.');
      }
      return {
        subject: payload.subject ?? '',
        html: payload.html,
        text: payload.text ?? '',
      };
    },
    onSuccess: (result) => {
      setPreview(result);
      setFieldErrors([]);
      toast.success('Preview rendered', {
        description: 'Rendered with the values above — this is what sends.',
      });
    },
    onError: (error: unknown) => {
      const fields = (error as { fields?: string[] }).fields ?? [];
      setFieldErrors(fields);
      toast.error('Cannot render yet', { description: errorMessage(error, 'Fill the highlighted fields.') });
    },
  });

  const previewDoc = useMemo(() => {
    if (!preview) return null;
    const safe = sanitizeEmailHtml(preview.html);
    return (
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
      `<body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">` +
      `<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">` +
      (safe || '<p style="color:#9ca3af;">Nothing to preview yet.</p>') +
      `</div></body></html>`
    );
  }, [preview]);

  const requiredLeft = useMemo(() => {
    if (!spec) return [];
    return spec.variables.filter((v) => v.required).filter((v) => !(values[v.name] ?? '').trim()).map((v) => v.name);
  }, [spec, values]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <Label htmlFor="class-id" className="text-xs font-semibold">
            Message class
          </Label>
          <Select value={classId} onValueChange={selectClass} disabled={classesQuery.isPending}>
            <SelectTrigger id="class-id" className="mt-1.5">
              <SelectValue placeholder={classesQuery.isPending ? 'Loading classes…' : 'Pick a class…'} />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loadError && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
              Design catalogue unavailable: {loadError}. Hand-authored mail below still works.
            </p>
          )}
        </div>
        <div className="flex items-end">
          <p className="max-w-60 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {spec ? (
              <>
                <span className="font-semibold text-slate-700 dark:text-slate-200">{spec.audience}</span>
                {' · '}
                {spec.permitted_senders.join(', ')}
              </>
            ) : (
              'Nine classes. Each one renders with live values — never fixtures.'
            )}
          </p>
        </div>
      </div>

      {spec && (
        <>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{spec.description}</p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Bind live records</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Paste an incident or evidence id from the dashboard. Machine values fill in; what no record
              holds stays listed below for you to type. Nothing is invented.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Input
                value={incidentId}
                onChange={(e) => setIncidentId(e.target.value)}
                placeholder="Incident id (uuid)"
                className="font-mono text-xs"
                spellCheck={false}
              />
              <Input
                value={evidenceId}
                onChange={(e) => setEvidenceId(e.target.value)}
                placeholder="Evidence id (uuid)"
                className="font-mono text-xs"
                spellCheck={false}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bindMutation.isPending || (!incidentId.trim() && !evidenceId.trim())}
                onClick={() => bindMutation.mutate()}
              >
                {bindMutation.isPending ? 'Binding…' : 'Bind'}
              </Button>
            </div>
            {missing.length > 0 && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Still needs values:{' '}
                <span className="font-mono">{missing.join(', ')}</span>
              </p>
            )}
          </div>

          {spec.variables.some((v) => v.name.startsWith('show_')) && (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Sections</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Uncheck to omit a section. The rest renumber automatically.
              </p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {spec.variables
                  .filter((v) => v.name.startsWith('show_'))
                  .map((v) => (
                    <label key={v.name} className="flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={(values[v.name] ?? 'true') !== 'false'}
                        onChange={(e) => setValue(v.name, e.target.checked ? 'true' : 'false')}
                        className="size-4 accent-slate-900 dark:accent-white"
                      />
                      <span className="text-slate-700 dark:text-slate-200">
                        {v.name.slice(5).replace(/_/g, ' ')}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {spec.variables
              .filter((v) => !v.name.startsWith('show_'))
              .map((v) => {
              const kind = fieldKind(spec.id, v.name);
              const value = values[v.name] ?? '';
              const invalid = fieldErrors.includes(v.name);
              const id = `class-field-${v.name}`;
              const help = (
                <span className="mt-1 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  {v.description}
                  {v.bound && (
                    <>
                      {' '}· <span className="font-mono">{v.bound}</span>
                    </>
                  )}
                  {v.machine && (
                    <> · <span className="font-semibold">machine value</span></>
                  )}
                </span>
              );
              return (
                <div key={v.name} className={kind === 'textarea' ? 'sm:col-span-2' : ''}>
                  <Label htmlFor={id} className="text-xs font-semibold">
                    {v.name}
                    {v.required && <span className="ml-1 text-red-500">*</span>}
                  </Label>
                  {kind === 'boolean' || kind === 'toggle' ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        id={id}
                        type="checkbox"
                        checked={kind === 'toggle' ? value !== 'false' : value === 'true'}
                        onChange={(e) => setValue(v.name, e.target.checked ? 'true' : 'false')}
                        className="size-4 accent-slate-900 dark:accent-white"
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {kind === 'toggle'
                          ? value !== 'false'
                            ? 'Shown'
                            : 'Omitted'
                          : value === 'true'
                            ? 'Set'
                            : 'Unset'}
                      </span>
                    </div>
                  ) : kind === 'enum' ? (
                    <Select value={value || undefined} onValueChange={(next) => setValue(v.name, next)}>
                      <SelectTrigger
                        id={id}
                        className={cn('mt-1.5', invalid && 'border-red-500', v.machine && 'font-mono text-xs')}
                      >
                        <SelectValue placeholder="Pick…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(ENUM_OPTIONS[`${spec.id}:${v.name}`] ?? []).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : kind === 'textarea' ? (
                    <Textarea
                      id={id}
                      value={value}
                      onChange={(e) => setValue(v.name, e.target.value)}
                      rows={3}
                      spellCheck={false}
                      className={cn('mt-1.5', invalid && 'border-red-500', v.machine && 'font-mono text-xs')}
                    />
                  ) : (
                    <Input
                      id={id}
                      value={kind === 'datetime' ? isoToDatetimeLocal(value) : value}
                      placeholder={IDENTITY_DEFAULTS[v.name]}
                      onChange={(e) =>
                        setValue(
                          v.name,
                          kind === 'datetime' ? datetimeLocalToISO(e.target.value) : e.target.value,
                        )
                      }
                      type={kind === 'datetime' ? 'datetime-local' : kind === 'number' ? 'number' : 'text'}
                      spellCheck={false}
                      className={cn('mt-1.5', invalid && 'border-red-500', v.machine && 'font-mono text-xs')}
                    />
                  )}
                  {invalid ? (
                    <span className="mt-1 block text-[11px] font-semibold text-red-600 dark:text-red-400">
                      This field needs a value before the class can render.
                    </span>
                  ) : (
                    help
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={renderMutation.isPending}
              onClick={() => renderMutation.mutate()}
            >
              {renderMutation.isPending ? 'Rendering…' : 'Render preview'}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!preview}
              onClick={() => {
                if (!preview || !spec) return;
                const filled: Record<string, string> = {};
                for (const [k, val] of Object.entries(values)) {
                  if (val.trim() !== '') filled[k] = val;
                }
                onUse({
                  classId: spec.id,
                  className: spec.name,
                  subject: preview.subject,
                  html: preview.html,
                  text: preview.text,
                  variables: filled,
                });
                toast.success('Class applied to composer', { description: spec.name });
              }}
            >
              Use in composer
            </Button>
            {requiredLeft.length > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {requiredLeft.length} required field{requiredLeft.length === 1 ? '' : 's'} empty
              </span>
            )}
          </div>

          {preview && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">
                {preview.subject || '(no subject)'}
              </p>
              {previewDoc && (
                <iframe
                  title="Class email preview"
                  srcDoc={previewDoc}
                  sandbox=""
                  className="h-[480px] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800"
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
