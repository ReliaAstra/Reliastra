'use client';

import { usePublicVendorLive, statusTone } from '@/components/landing/hooks/usePublicVendorLive';

export function CorrelationTimeline() {
  const { data: vendors, isLoading, isError, refetch } = usePublicVendorLive(4);
  const maxLatency = Math.max(1, ...(vendors ?? []).map((v) => v.latency_ms ?? 0));

  return (
    <div className="relative mx-auto w-full max-w-2xl px-2 py-4">
      <p className="mb-6 text-center font-mono text-xs text-white/40">
        Live 1-hour averages from public vendor endpoints
      </p>

      {isLoading && <p className="text-center text-sm text-white/50">Loading live probes…</p>}
      {isError && (
        <p className="text-center text-sm text-white/50">
          Could not load vendor timelines.{' '}
          <button type="button" onClick={() => refetch()} className="text-[#67E8F9]">
            Retry
          </button>
        </p>
      )}

      <div className="space-y-4">
        {vendors?.map((v) => {
          const tone = statusTone(v.status);
          const bar =
            tone === 'down'
              ? 'bg-[#DC2626]'
              : tone === 'warn'
                ? 'bg-[#D97706]'
                : 'bg-[#0891B2]';
          const width = v.latency_ms != null ? Math.max(8, (v.latency_ms / maxLatency) * 100) : 8;
          return (
            <div key={v.vendor_name} className="flex items-center gap-4">
              <div className="w-28 truncate text-right text-xs text-[#A1A1AA]">
                {v.display_name}
              </div>
              <div className="relative h-10 flex-1 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                <div
                  className={`absolute inset-y-1 left-1 rounded-md opacity-80 ${bar}`}
                  style={{ width: `${width}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-3">
                  <span className="font-mono text-[10px] capitalize text-white/70">
                    {v.status.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-[12px] text-[#67E8F9]">
                    {v.latency_ms != null ? `${v.latency_ms}ms` : '—'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
