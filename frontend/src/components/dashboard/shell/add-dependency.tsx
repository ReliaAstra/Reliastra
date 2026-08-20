'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { getPlan, nextPlan } from '@/lib/dashboard/plans';
import { useCreateDependency, useDependencies, useUpdateDependency } from '@/lib/dashboard/queries';
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
  'w-full rounded-lg border border-rs-border bg-rs-input px-3.5 py-2.5 text-sm text-rs-text placeholder:text-rs-text-tertiary outline-none focus:border-rs-brand focus:shadow-[0_0_0_2px_rgba(37,99,235,0.2)]';

export function AddDependencyPanel() {
  const open = useAppStore((s) => s.addDependencyOpen);
  const editingId = useAppStore((s) => s.editingDependencyId);
  const setOpen = useAppStore((s) => s.setAddDependencyOpen);
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const { data: deps } = useDependencies();
  const create = useCreateDependency();
  const update = useUpdateDependency();
  const current = getPlan(plan?.plan);
  const nxt = nextPlan(plan?.plan);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]>('GET');
  const [codes, setCodes] = useState<number[]>([200]);
  const [timeout, setTimeoutSec] = useState(10);
  const [interval, setInterval] = useState(60);
  const [regions, setRegions] = useState<string[]>(['us-east']);
  const [threshold, setThreshold] = useState(500);
  const [active, setActive] = useState(true);

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
    }
  }, [open, editingId, deps]);

  if (!open) return null;

  const atLimit = !editingId && (deps?.length ?? 0) >= current.dependencies;

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
    const body = {
      name,
      endpoint_url: url,
      method,
      expected_status_codes: codes,
      timeout_seconds: timeout,
      check_interval_seconds: interval,
      regions,
      alert_threshold_ms: threshold,
      is_active: active,
    };
    if (editingId) await update.mutateAsync({ id: editingId, body });
    else await create.mutateAsync(body);
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-[480px] flex-col border-l border-rs-border-subtle bg-rs-base">
        <div className="flex items-center justify-between border-b border-rs-border-subtle px-6 py-4">
          <h2 className="text-lg font-semibold text-rs-text">
            {editingId ? 'Edit dependency' : 'Add dependency'}
          </h2>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-rs-text-tertiary">
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
                Start {nxt.name} trial
              </RsButton>
            </div>
          )}

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm text-rs-text-secondary">Name</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Stripe API" />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm text-rs-text-secondary">Endpoint URL</span>
            <input
              className={cn(field, 'font-mono')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/health"
            />
          </label>
          <div className="mb-4">
            <span className="mb-1.5 block text-sm text-rs-text-secondary">Method</span>
            <div className="inline-flex rounded-lg border border-rs-border p-0.5">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    'rounded-md px-3 py-1.5 font-mono text-sm',
                    method === m ? 'bg-rs-hover text-rs-text' : 'text-rs-text-secondary'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <span className="mb-1.5 block text-sm text-rs-text-secondary">Expected status codes</span>
            <div className="flex flex-wrap gap-2">
              {CODES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCode(c)}
                  className={cn(
                    'rounded-full border px-3 py-1 font-mono text-xs',
                    codes.includes(c)
                      ? 'border-rs-brand bg-rs-brand-subtle text-rs-brand'
                      : 'border-rs-border text-rs-text-secondary'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm text-rs-text-secondary">Timeout (seconds)</span>
            <input className={cn(field, 'font-mono')} type="number" value={timeout} onChange={(e) => setTimeoutSec(Number(e.target.value))} />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 flex items-center gap-1 text-sm text-rs-text-secondary">
              Check interval (seconds)
              <HelpTooltip
                title="Check interval"
                body="How often Reliastra probes this endpoint from each selected region. Paid plans can check more frequently."
              />
            </span>
            <input className={cn(field, 'font-mono')} type="number" value={interval} onChange={(e) => setInterval(Number(e.target.value))} />
          </label>
          <div className="mb-4">
            <span className="mb-1.5 block text-sm text-rs-text-secondary">Regions</span>
            <div className="space-y-2">
              {REGIONS.map((r) => (
                <label key={r.id} className="flex h-12 items-center gap-2 text-sm text-rs-text">
                  <input
                    type="checkbox"
                    checked={regions.includes(r.id)}
                    onChange={() => toggleRegion(r.id)}
                    className="h-4 w-4 accent-[#2563EB]"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
          <label className="mb-4 block">
            <span className="mb-1.5 flex items-center gap-1 text-sm text-rs-text-secondary">
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
                'h-6 w-10 rounded-full transition-colors',
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
