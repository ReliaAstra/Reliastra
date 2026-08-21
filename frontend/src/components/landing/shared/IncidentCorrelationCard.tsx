'use client';

import { formatDistanceToNow } from 'date-fns';
import { usePublicVendorLive, statusTone } from '@/components/landing/hooks/usePublicVendorLive';
import { scrollToId } from '@/components/landing/theme';

function formatCheck(iso: string | null): string {
  if (!iso) return 'Awaiting first check';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function IncidentCorrelationCard() {
  const { data: vendors, isLoading, isError, refetch } = usePublicVendorLive(5);

  return (
    <div className="w-full max-w-[440px] mx-auto md:mx-0 rounded-2xl border border-[#E4E4E7] bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-[#131318] dark:shadow-none">
      <p className="font-semibold text-[11px] uppercase tracking-[0.08em] text-[#A1A1AA] dark:text-[#71717A]">
        Live public checks
      </p>
      <h3 className="mt-1 text-[18px] font-bold leading-tight text-[#09090B] dark:text-[#FAFAFA]">
        Independent vendor latency
      </h3>
      <p className="mt-1 font-mono text-[13px] text-[#A1A1AA] dark:text-[#71717A]">
        From Reliastra probes · refreshes every 15s
      </p>

      <hr className="my-4 h-px border-0 bg-[#E4E4E7] dark:bg-white/10" />

      {isLoading && <p className="text-sm text-[#71717A] dark:text-[#71717A]">Loading live measurements…</p>}
      {isError && (
        <div className="text-sm text-[#52525B] dark:text-[#A1A1AA]">
          Unable to reach the public vendor API.{' '}
          <button type="button" onClick={() => refetch()} className="font-medium text-[#0891B2] dark:text-[#22D3EE]">
            Retry
          </button>
        </div>
      )}
      {!isLoading && !isError && (!vendors || vendors.length === 0) && (
        <p className="text-sm text-[#71717A] dark:text-[#71717A]">No public vendors published yet.</p>
      )}

      <ul className="space-y-3">
        {vendors?.map((v) => {
          const tone = statusTone(v.status);
          const color =
            tone === 'ok'
              ? 'text-[#16A34A] dark:text-[#22C55E]'
              : tone === 'warn'
                ? 'text-[#D97706] dark:text-[#FBBF24]'
                : tone === 'down'
                  ? 'text-[#DC2626] dark:text-[#F87171]'
                  : 'text-[#71717A]';
          return (
            <li key={v.vendor_name} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-[#09090B] dark:text-[#FAFAFA]">
                  {v.display_name}
                </p>
                <p className="mt-0.5 font-mono text-[12px] text-[#A1A1AA] dark:text-[#71717A]">
                  {formatCheck(v.last_check_at)}
                  {v.status_code != null ? ` · HTTP ${v.status_code}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-[15px] font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                  {v.latency_ms != null ? `${v.latency_ms}ms` : '—'}
                </p>
                <p className={`text-[11px] font-medium capitalize ${color}`}>
                  {v.status.replace(/_/g, ' ')}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => scrollToId('live')}
        className="mt-5 block w-full rounded-[10px] bg-[#0891B2] py-3 text-center font-semibold text-[14px] text-white transition-colors hover:bg-[#0E7490]"
      >
        Open public tracking
      </button>
    </div>
  );
}
