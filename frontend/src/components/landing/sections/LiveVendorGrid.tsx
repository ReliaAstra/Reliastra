'use client';

import { motion } from 'framer-motion';
import { VendorSparkline } from '@/components/landing/shared/VendorSparkline';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { usePublicVendorLive } from '@/components/landing/hooks/usePublicVendorLive';
import { scrollToId } from '@/components/landing/theme';

const ease = [0.25, 0.1, 0.25, 1] as const;

const CATEGORY_COLORS: Record<string, string> = {
  payments: '#635BFF',
  identity: '#EB5424',
  communications: '#F22F46',
  infrastructure: '#F6821F',
  ai: '#10A37F',
  hosting: '#0891B2',
  database: '#007AF5',
  monitoring: '#6C5CE7',
};

const FALLBACK_COLOR = '#0891B2';

const statusConfig: Record<string, { dotColor: string; label: string }> = {
  up: { dotColor: 'bg-[#16A34A]', label: 'Operational' },
  operational: { dotColor: 'bg-[#16A34A]', label: 'Operational' },
  degraded: { dotColor: 'bg-[#D97706]', label: 'Degraded' },
  degraded_performance: { dotColor: 'bg-[#D97706]', label: 'Degraded' },
  down: { dotColor: 'bg-[#DC2626]', label: 'Down' },
  partial_outage: { dotColor: 'bg-[#F97316]', label: 'Partial Outage' },
  major_outage: { dotColor: 'bg-[#DC2626]', label: 'Major Outage' },
  unknown: { dotColor: 'bg-[#71717A]', label: 'Unknown' },
};

export function LiveVendorGrid() {
  const { data: snapshots = [], isLoading: loading, isError, refetch, dataUpdatedAt } =
    usePublicVendorLive(6);
  const error = isError ? 'Unable to load vendor data' : null;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null;
  const vendors = snapshots.map((v) => ({
    id: v.vendor_name,
    vendor_name: v.vendor_name,
    display_name: v.display_name,
    color: CATEGORY_COLORS[v.category?.toLowerCase()] || FALLBACK_COLOR,
    recent_status: v.status,
    latency: v.latency_ms,
    uptime: v.uptime_24h,
    last_check_at: v.last_check_at,
    history: v.points.map((p) => p.latency_ms),
  }));

  const formatLastCheck = (dateStr: string | null): string => {
    if (!dateStr) return 'Pending';
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return 'N/A';
    }
  };

  return (
    <section id="live" className="bg-[#0A0A0F] py-32">
      <div className="mx-auto max-w-[1200px] px-6 md:px-12">
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease }}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#0891B2] dark:text-[#22D3EE]">
            LIVE PUBLIC TRACKING
          </p>
          <h2 className="mb-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            What&apos;s actually happening right now.
          </h2>
          <p className="mx-auto max-w-xl text-white/50">
            Independent monitoring from Reliastra&apos;s infrastructure. Real measurements, real endpoints.
          </p>
        </motion.div>

        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[240px] rounded-2xl bg-[#131318]" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="py-16 text-center">
            <p className="text-sm text-white/50">{error}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 text-xs font-medium text-[#0891B2] transition-colors hover:text-[#22D3EE] dark:text-[#22D3EE]"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && vendors.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((vendor, i) => {
              const sCfg = statusConfig[vendor.recent_status] || statusConfig.unknown;
              const isDegraded = ['degraded', 'degraded_performance', 'partial_outage'].includes(
                vendor.recent_status
              );
              const isDown = ['down', 'major_outage'].includes(vendor.recent_status);

              return (
                <motion.button
                  key={vendor.id}
                  onClick={() => scrollToId('live')}
                  className="block rounded-2xl border border-white/5 bg-[#131318] p-6 text-left transition-all duration-300 hover:-translate-y-4 hover:border-[#0891B2]/20 hover:shadow-[0_0_0_1px_#0891B2,0_0_60px_rgba(8,145,178,0.12)]"
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 0.6, delay: i * 0.08, ease }}
                  aria-label={`${vendor.display_name} status: ${sCfg.label}`}
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: vendor.color === '#FFFFFF' ? '#0891B2' : vendor.color,
                        }}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold text-white">{vendor.display_name}</span>
                    </div>
                    <span className="relative flex h-2 w-2">
                      {(vendor.recent_status === 'up' || vendor.recent_status === 'operational') && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#16A34A] opacity-75" />
                      )}
                      {isDegraded && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D97706] opacity-75" />
                      )}
                      <span className={cn('relative inline-flex h-2 w-2 rounded-full', sCfg.dotColor)} />
                    </span>
                  </div>

                  <div className="mb-4">
                    {vendor.latency !== null ? (
                      <>
                        <span className="font-mono text-3xl font-bold text-white">{vendor.latency}</span>
                        <span className="ml-1 text-sm text-white/40">ms</span>
                      </>
                    ) : (
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-medium',
                          isDown
                            ? 'bg-red-500/10 text-red-400'
                            : isDegraded
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-emerald-500/10 text-emerald-400'
                        )}
                      >
                        {sCfg.label}
                      </span>
                    )}
                  </div>

                  {vendor.history.length > 0 && (
                    <div className="mb-4">
                      <VendorSparkline
                        data={vendor.history}
                        color={vendor.color === '#FFFFFF' ? '#0891B2' : vendor.color}
                        width={240}
                        height={40}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white/40">
                      {vendor.uptime !== null
                        ? `Uptime: ${vendor.uptime.toFixed(2)}%`
                        : `Last: ${formatLastCheck(vendor.last_check_at)}`}
                    </p>
                    <span
                      className={cn(
                        'text-[10px] font-medium uppercase tracking-wider',
                        isDown ? 'text-red-400' : isDegraded ? 'text-amber-400' : 'text-emerald-400'
                      )}
                    >
                      {sCfg.label}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        <motion.div
          className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, delay: 0.3, ease }}
        >
          {lastUpdated && (
            <span className="font-mono text-xs text-white/30">
              Last updated: {formatLastCheck(lastUpdated)} &middot; Refreshes every 15s
            </span>
          )}
          <button
            onClick={() => scrollToId('live')}
            className="rounded-[10px] border border-white/20 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            Explore Public Tracking
          </button>
        </motion.div>
      </div>
    </section>
  );
}
