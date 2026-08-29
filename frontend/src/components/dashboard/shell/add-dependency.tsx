'use client';

import { Building2, Layers, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { effectivePlan, getPlan, nextPlan } from '@/lib/dashboard/plans';
import {
  useApplications,
  useClients,
  useCreateDependency,
  useDependencies,
  useUpdateDependency,
} from '@/lib/dashboard/queries';
import { HelpTooltip } from '../ui/help-tooltip';
import { RsButton } from '../ui/button';
import { cn } from '@/lib/utils';

const METHODS = ['GET', 'HEAD', 'POST'] as const;
const CODES = [200, 201, 204, 301, 302];
const REGIONS = [
  { id: 'us-east', label: 'US East' },
  { id: 'us-west', label: 'US West' },
  { id: 'eu-west', label: 'EU West' },
  { id: 'ap-south', label: 'AP Southeast' },
];

const field =
  'flex h-9 w-full rounded-[10px] border border-rs-border-subtle bg-rs-input px-3 text-sm text-rs-text placeholder:text-rs-text-tertiary outline-none transition-[border-color,box-shadow] duration-150 focus:border-rs-brand focus:ring-[3px] focus:ring-[rgb(37_99_235_/_0.20)] dark:focus:ring-[rgb(59_130_246_/_0.20)]';

export function AddDependencyPanel() {
  const open = useAppStore((s) => s.addDependencyOpen);
  const editingId = useAppStore((s) => s.editingDependencyId);
  const setOpen = useAppStore((s) => s.setAddDependencyOpen);
  const plan = useAppStore((s) => s.plan);
  const selectedClientId = useAppStore((s) => s.selectedClientId);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const { data: deps } = useDependencies();
  const create = useCreateDependency();
  const update = useUpdateDependency();
  const currentPlan = effectivePlan(plan);
  const agencyEnabled = currentPlan.id === 'enterprise';

  const { data: clients } = useClients(agencyEnabled);
  const [selectedClientForDep, setSelectedClientForDep] = useState<string>('');
  const { data: applications } = useApplications(
    selectedClientForDep || undefined,
    Boolean(selectedClientForDep) && agencyEnabled
  );

  const [name, setName] = useState('');
  const [applicationId, setApplicationId] = useState<string>('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]>('GET');
  const [codes, setCodes] = useState<number[]>([200]);
  const [timeout, setTimeoutSec] = useState(10);
  const [interval, setInterval] = useState(60);
  const [regions, setRegions] = useState<string[]>(['us-east']);
  const [threshold, setThreshold] = useState(500);
  const [active, setActive] = useState(true);

  const current = getPlan(plan?.effective_plan ?? plan?.plan);
  const nxt = nextPlan(plan?.effective_plan ?? plan?.plan);

  useEffect(() => {
    if (!open) return;
    const existing = editingId ? deps?.find((d) => d.id === editingId) : null;
    if (existing) {
      setName(existing.name);
      setUrl(existing.endpoint_url);
      setMethod((existing.method as typeof method) || 'GET');
      setCodes(existing.expected_status_codes);
      setTimeoutSec(existing.timeout_seconds);
      setInterval(existing.check_interval_seconds);
      setRegions(existing.regions);
      setThreshold(existing.alert_threshold_ms ?? 500);
      setActive(existing.is_active);
      setApplicationId(existing.application_id ?? '');
    } else {
      setName('');
      setUrl('');
      setMethod('GET');
      setCodes([200]);
      setTimeoutSec(10);
      setInterval(60);
      setRegions(['us-east']);
      setThreshold(500);
      setActive(true);
      setApplicationId('');
      if (selectedClientId) {
        setSelectedClientForDep(selectedClientId);
      } else {
        setSelectedClientForDep('');
      }
    }
  }, [open, editingId, deps, selectedClientId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const atLimit = !editingId && current.dependencies != null && (deps?.length ?? 0) >= current.dependencies;

  function toggleCode(code: number) {
    setCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }
  function toggleRegion(id: string) {
    setRegions((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function submit() {
    if (atLimit) {
      openUpgrade('limit');
      return;
    }
    const body: any = {
      name: name.trim(),
      endpoint_url: url.trim(),
      method,
      expected_status_codes: codes,
      timeout_seconds: timeout,
      check_interval_seconds: interval,
      regions,
      alert_threshold_ms: threshold,
      is_active: active,
    };
    if (applicationId) {
      body.application_id = applicationId;
    } else if (editingId) {
      body.application_id = null;
    }

    if (editingId) await update.mutateAsync({ id: editingId, body });
    else await create.mutateAsync(body);
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-[rgb(11_15_25_/_0.5)]" onClick={() => setOpen(false)} />
      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-[480px] flex-col border-l border-rs-border-subtle bg-rs-elevated shadow-rs-modal">
        <div className="flex h-14 items-center justify-between border-b border-rs-border-subtle px-6">
          <h2 className="rs-section-title text-base font-semibold">
            {editingId ? 'Edit dependency' : 'Add dependency'}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-rs-text-tertiary hover:bg-rs-hover hover:text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 rs-scrollbar">
          {atLimit && (
            <div className="mb-5 flex items-start justify-between rounded-[10px] border border-[rgba(37,99,235,0.2)] bg-rs-brand-subtle px-[18px] py-3.5">
              <p className="text-sm text-rs-text">
                You are monitoring {deps?.length} of {current.dependencies} dependencies on the {current.name} plan. Upgrade to {nxt.name} to monitor {nxt.dependencies} dependencies.
              </p>
              <RsButton className="ml-3 shrink-0 px-3 py-1.5 text-[13px]" onClick={() => openUpgrade('limit')}>
                Upgrade to {nxt.name}
              </RsButton>
            </div>
          )}

          {agencyEnabled && (clients?.length ?? 0) > 0 && (
            <div className="mb-5 rounded-xl border border-rs-border-subtle bg-rs-base p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rs-text-tertiary">
                <Building2 size={13} className="text-rs-brand" />
                <span>Agency Hierarchy Assignment</span>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-rs-text-secondary">
                Assign this dependency to an application so uptime rolls up accurately to your client&apos;s SLA posture.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="rs-label mb-1 block text-xs">Client</label>
                  <select
                    value={selectedClientForDep}
                    onChange={(e) => {
                      setSelectedClientForDep(e.target.value);
                      setApplicationId('');
                    }}
                    className={field}
                  >
                    <option value="">Select a client workspace…</option>
                    {(clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedClientForDep && (
                  <div>
                    <label className="rs-label mb-1 block text-xs">Application</label>
                    <select
                      value={applicationId}
                      onChange={(e) => setApplicationId(e.target.value)}
                      className={field}
                    >
                      <option value="">Select an application…</option>
                      {(applications ?? []).map((app) => (
                        <option key={app.id} value={app.id}>
                          {app.name}
                        </option>
                      ))}
                    </select>
                    {(applications?.length ?? 0) === 0 && (
                      <p className="mt-1 text-[11px] text-rs-text-tertiary">
                        This client has no applications yet. Create an application from the client workspace.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <label className="mb-4 block">
            <span className="rs-label mb-1.5 block">Name</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Stripe API" />
          </label>
          <label className="mb-4 block">
            <span className="rs-label mb-1.5 block">Endpoint URL</span>
            <input
              className={cn(field, 'font-mono')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/health"
            />
          </label>
          <div className="mb-4">
            <span className="rs-label mb-1.5 block">Method</span>
            <div className="inline-flex rounded-lg border border-rs-border-subtle p-0.5">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    'rounded-md px-3 py-1.5 font-mono text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
                    method === m ? 'bg-rs-active text-rs-text' : 'text-rs-text-secondary hover:text-rs-text'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <span className="rs-label mb-1.5 block">Expected status codes</span>
            <div className="flex flex-wrap gap-2">
              {CODES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCode(c)}
                  className={cn(
                    'rounded-full border px-3 py-1 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
                    codes.includes(c)
                      ? 'border-rs-brand bg-rs-brand-subtle text-rs-brand'
                      : 'border-rs-border-subtle text-rs-text-secondary hover:border-rs-border'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <label className="mb-4 block">
            <span className="rs-label mb-1.5 block">Timeout (seconds)</span>
            <input className={cn(field, 'font-mono')} type="number" value={timeout} onChange={(e) => setTimeoutSec(Number(e.target.value))} />
          </label>
          <label className="mb-4 block">
            <span className="rs-label mb-1.5 flex items-center gap-1">
              Check interval (seconds)
              <HelpTooltip
                title="Check interval"
                body="How often Reliastra probes this endpoint from each selected region. Paid plans can check more frequently."
              />
            </span>
            <input className={cn(field, 'font-mono')} type="number" value={interval} onChange={(e) => setInterval(Number(e.target.value))} />
          </label>
          <div className="mb-4">
            <span className="rs-label mb-1.5 block">Regions</span>
            <div className="space-y-2">
              {REGIONS.map((r) => (
                <label key={r.id} className="flex h-12 items-center gap-2 text-sm text-rs-text">
                  <input
                    type="checkbox"
                    checked={regions.includes(r.id)}
                    onChange={() => toggleRegion(r.id)}
                    className="h-4 w-4 accent-[var(--rs-brand)]"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
          <label className="mb-4 block">
            <span className="rs-label mb-1.5 flex items-center gap-1">
              Alert threshold (ms)
              <HelpTooltip
                title="Alert threshold"
                body="A check is treated as degraded when latency exceeds this value, even if the status code is healthy."
              />
            </span>
            <input className={cn(field, 'font-mono')} type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </label>
          <label className="flex h-12 items-center justify-between text-sm text-rs-text">
            Active
            <button
              type="button"
              role="switch"
              aria-checked={active}
              onClick={() => setActive((v) => !v)}
              className={cn(
                'h-6 w-10 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2',
                active ? 'bg-rs-brand' : 'bg-rs-border'
              )}
            >
              <span className={cn('block h-5 w-5 translate-y-0.5 rounded-full bg-white transition-transform', active ? 'translate-x-4' : 'translate-x-0.5')} />
            </button>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-rs-border-subtle px-6 py-4">
          <RsButton variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </RsButton>
          <RsButton onClick={submit} disabled={!name || !url || create.isPending || update.isPending}>
            {editingId ? 'Save changes' : 'Add dependency'}
          </RsButton>
        </div>
      </aside>
    </div>
  );
}
