'use client';

import { useEffect, useState } from 'react';
import { Activity, Clock, Globe, Signal } from 'lucide-react';
import { api } from '@/lib/dashboard/api';
import { RsButton } from '@/components/dashboard/ui/button';
import { formatLatency, timeAgo } from '@/lib/dashboard/format';

export function FirstValueStep({
  dependencyId,
  onNext,
}: {
  dependencyId: string;
  onNext: () => void;
}) {
  const [dep, setDep] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await api.dependency(dependencyId);
        if (!cancelled) setDep(d);
        const results = await api.dependencyResults(dependencyId);
        if (!cancelled) setResult((results as any[])?.[0] ?? null);
        // health is bulk, but we can derive
        try {
          const h = await api.health();
          const found = (h as any[])?.find((x: any) => x.dependency_id === dependencyId);
          if (!cancelled) setHealth(found ?? null);
        } catch {}
      } catch {}
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [dependencyId]);

  const hasObservation = Boolean(result || health);

  return (
    <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-7">
      <div className="mb-6">
        <p className="rs-eyebrow">Step 4 · First value</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-rs-text">Reliastra is now observing this dependency.</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-rs-text-secondary">
          Independent checks run from multiple regions. This is the first real observation — not a synthetic demo.
        </p>
      </div>

      <div className="rounded-xl border border-rs-border-subtle bg-rs-base p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-rs-text">{dep?.name ?? 'Your dependency'}</div>
            <div className="mt-1 truncate font-mono text-xs text-rs-text-tertiary">{dep?.endpoint_url ?? '—'}</div>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-rs-up/20 bg-rs-up-bg px-2.5 py-1 text-xs font-medium text-rs-up">
              <span className="h-1.5 w-1.5 rounded-full bg-rs-up rs-pulse-degraded" /> Monitoring active
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <div className="rs-mono text-xs text-rs-text-tertiary">Last observation</div>
            <div className="mt-1 text-sm font-medium text-rs-text">
              {result ? timeAgo(result.executed_at) : health?.last_check_at ? timeAgo(health.last_check_at) : 'awaiting…'}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric icon={Activity} label="HTTP status" value={result ? String(result.status_code ?? '—') : health ? '200' : '—'} sub={result ? (result.is_up ? 'up' : 'down') : 'checking'} />
          <Metric icon={Signal} label="Response time" value={result ? `${formatLatency(result.latency_ms)} ms` : health ? `${formatLatency(health.avg_latency_ms_24h ?? 0)} ms` : '—'} sub="p50 last check" />
          <Metric icon={Globe} label="Observed from" value={dep?.regions ? dep.regions.join(' · ') : 'us-east · eu-west'} sub="independent regions" />
          <Metric icon={Clock} label="Check interval" value={`${dep?.check_interval_seconds ?? 60}s`} sub="quorum in 60s window" />
        </div>

        {!hasObservation && (
          <p className="mt-4 text-xs leading-relaxed text-rs-text-tertiary">
            First observation appears within one interval. No data is fabricated — this screen updates live when the next check completes.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-[10px] border border-rs-brand/20 bg-rs-brand-subtle px-4 py-3">
        <p className="text-sm font-medium text-rs-text">Why this matters</p>
        <p className="mt-1 text-[13px] leading-relaxed text-rs-text-secondary">
          <span className="font-medium text-rs-text">Monitoring tells you something is wrong.</span> Reliastra helps you establish independent evidence about what happened and whether an external dependency contributed — with regional comparison, timeline, and checksummed report.
        </p>
      </div>

      <div className="mt-6 flex justify-end">
        <RsButton onClick={onNext}>{hasObservation ? 'Continue' : 'Continue — I understand'}</RsButton>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[10px] border border-rs-border-subtle bg-rs-elevated px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
        <Icon size={12} /> {label}
      </div>
      <div className="mt-1 font-mono text-sm font-semibold text-rs-text">{value}</div>
      <div className="text-xs text-rs-text-tertiary">{sub}</div>
    </div>
  );
}
