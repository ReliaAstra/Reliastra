'use client';

import { format } from 'date-fns';
import { BrowserMockup } from '@/components/landing/shared/BrowserMockup';
import { usePublicVendorLive } from '@/components/landing/hooks/usePublicVendorLive';
import { scrollToId } from '@/components/landing/theme';

export function EvidenceReportPreview() {
  const { data: vendors, isLoading, isError } = usePublicVendorLive(1);
  const vendor = vendors?.[0];
  const points = vendor?.points.slice(-6) ?? [];

  return (
    <BrowserMockup
      url={vendor ? `reliastra.com/track/${vendor.vendor_name}` : 'reliastra.com/track'}
      className="max-w-md"
    >
      <div className="relative space-y-4 bg-white p-5 dark:bg-[#131318]">
        <div className="border-b border-[#E4E4E7] pb-3 dark:border-white/10">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#A1A1AA] dark:text-[#71717A]">
            Live observation
          </p>
          <p className="text-sm font-bold text-[#09090B] dark:text-[#FAFAFA]">
            {vendor?.display_name ?? 'Public vendor'}
          </p>
        </div>

        {isLoading && <p className="text-sm text-[#71717A]">Loading latest check…</p>}
        {isError && <p className="text-sm text-[#71717A]">Public vendor API unavailable.</p>}

        {vendor && (
          <>
            <div className="space-y-2 rounded-lg bg-[#F8F9FA] p-3 dark:bg-[#1A1A20]">
              <div className="flex justify-between text-xs">
                <span className="text-[#52525B] dark:text-[#A1A1AA]">Status</span>
                <span className="font-semibold capitalize text-[#09090B] dark:text-[#FAFAFA]">
                  {vendor.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#52525B] dark:text-[#A1A1AA]">Latency</span>
                <span className="font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                  {vendor.latency_ms != null ? `${vendor.latency_ms} ms` : '—'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#52525B] dark:text-[#A1A1AA]">24h uptime</span>
                <span className="font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                  {vendor.uptime_24h != null ? `${vendor.uptime_24h.toFixed(2)}%` : '—'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="font-semibold text-[10px] uppercase tracking-wider text-[#A1A1AA] dark:text-[#71717A]">
                Recent 1h samples
              </p>
              {points.length === 0 && (
                <p className="text-[11px] text-[#71717A]">No timeline samples yet.</p>
              )}
              {points.map((p) => (
                <div key={p.timestamp} className="flex items-center gap-2 text-[11px]">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      p.is_up ? 'bg-[#16A34A] dark:bg-[#22C55E]' : 'bg-[#DC2626] dark:bg-[#F87171]'
                    }`}
                  />
                  <span className="w-28 shrink-0 font-mono text-[#A1A1AA] dark:text-[#71717A]">
                    {format(new Date(p.timestamp), 'HH:mm:ss')} UTC
                  </span>
                  <span className="text-[#52525B] dark:text-[#A1A1AA]">{p.latency_ms} ms</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollToId('live')}
              className="block text-center text-xs font-semibold text-[#0891B2] hover:underline dark:text-[#22D3EE]"
            >
              View full public history
            </button>
          </>
        )}
      </div>
    </BrowserMockup>
  );
}
