import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchTrackedVendors, type TrackVendorListItem } from '@/lib/track-api';
import { PreferredSourceSection } from '@/components/seo/preferred-source';

export const metadata: Metadata = {
  title: 'Track — Public vendor status | RELIASTRA',
  description:
    'Independent, multi-region status for the third-party APIs your product depends on. Uptime, latency and incident history — measured, not self-reported.',
  openGraph: {
    title: 'Track vendor status — RELIASTRA',
    description:
      'Independent, multi-region status for third-party APIs. Uptime, latency and incident history — measured, not self-reported.',
    type: 'website',
  },
};

export const revalidate = 60;

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return '—';
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  payment: 'Payments',
  communication: 'Communication',
  cloud: 'Cloud',
  storage: 'Storage',
  database: 'Database',
  auth: 'Auth',
  ai: 'AI',
  other: 'Other',
};

function VendorRow({ v }: { v: TrackVendorListItem }) {
  return (
    <Link
      href={`/track/${v.vendor_name}`}
      className="group flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5 md:px-5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="mt-0.5 size-2 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {v.display_name}
          </span>
          <span className="block truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
            {CATEGORY_LABELS[v.category] ?? v.category}
          </span>
        </span>
      </div>
      <span className="shrink-0 font-mono text-xs text-zinc-400 dark:text-zinc-600">
        checked {formatWhen(v.last_check_at)}
      </span>
    </Link>
  );
}

async function VendorsList() {
  let page: Awaited<ReturnType<typeof fetchTrackedVendors>> | null = null;
  let failed = false;
  try {
    page = await fetchTrackedVendors();
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <div className="rounded-xl border border-zinc-200 p-10 text-center dark:border-white/10">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Live status is temporarily unavailable.
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">
          The RELIASTRA measurement network could not be reached. Please refresh in a moment.
        </p>
      </div>
    );
  }

  if (!page?.items?.length) {
    return (
      <div className="rounded-xl border border-zinc-200 p-10 text-center dark:border-white/10">
        <p className="text-sm text-zinc-900 dark:text-zinc-100">No vendors are tracked yet.</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">
          As organizations monitor public APIs on RELIASTRA, their independent status appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-[#131318]">
      {page.items.map((v) => (
        <VendorRow key={v.id} v={v} />
      ))}
    </div>
  );
}

export default function TrackIndexPage() {
  return (
    <main className="min-h-screen bg-white pb-24 dark:bg-[#0A0A0F]">
      <section className="border-b border-zinc-200 bg-[#F8F9FA] py-14 dark:border-white/10 dark:bg-[#131318] md:py-20">
        <div className="mx-auto max-w-[880px] px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-cyan-700 dark:text-cyan-400">
            RELIASTRA Track
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white md:text-4xl">
            Independent status for the services you depend on
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
            Uptime, latency and incidents for third-party APIs — measured by RELIASTRA&apos;s
            regional probes, not self-reported by the vendor.
          </p>
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-[880px] px-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
            Tracked vendors
          </h2>
          <span className="font-mono text-[11px] text-zinc-500">updated every minute</span>
        </div>
        <VendorsList />
      </section>

      <section className="mx-auto mt-8 max-w-[880px] px-6">
        <PreferredSourceSection variant="vendor" />
      </section>

      <section className="mx-auto mt-12 max-w-[880px] px-6">
        <div className="rounded-xl border border-zinc-200 bg-[#F8F9FA] p-6 dark:border-white/10 dark:bg-[#131318] md:p-8">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
            Monitor your own dependencies
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            RELIASTRA watches the external APIs your product relies on, correlates their failures
            with your incidents, and generates verifiable evidence when a vendor causes downtime.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-[10px] bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Start free
            </Link>
            <Link
              href="/#pricing"
              className="rounded-[10px] border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-white dark:border-white/20 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
