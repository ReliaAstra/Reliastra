'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { TrackVendorListItem } from '@/lib/track-api';
import { SHARE_ROUTES } from '@/lib/routes';

/**
 * The index rows on the homepage: primarily typographic, one hairline
 * between records, never a card. SSR supplies first paint; visible-page
 * polling prevents frozen "just now" labels.
 *
 * Record links go through `SHARE_ROUTES.observatoryVendor`, which percent-
 * encodes the vendor name. This component used to interpolate the name into
 * the path itself, so a dependency whose name carried a space, a slash or a
 * non-ASCII character produced a URL that was not the canonical one - a second
 * address for the same record, and a 404 whenever the raw name was not a valid
 * path segment. Every other link to this route already encoded it.
 *
 * The poll costs one catalog read per visible tab per minute. It is keyed per
 * client IP at the API because `backend-proxy.ts` forwards `X-Forwarded-For`,
 * so open tabs no longer share a rate-limit bucket with the server's own
 * reads.
 */
export function PublicObservations({ initial }: { initial: TrackVendorListItem[] }) {
  const [vendors, setVendors] = useState(initial);
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let controller: AbortController | null = null;
    const refresh = async () => {
      if (document.hidden) return;
      setNow(Date.now());
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch('/api/v1/vendors?limit=9', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Unavailable');
        const result = await response.json();
        if (!Array.isArray(result.items)) throw new Error('Invalid catalog');
        setVendors(result.items); setError(false);
      } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setError(true); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); controller?.abort(); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return <>
    {error && <p role="status" className="ob-small mb-4">Updates unavailable · showing last retrieved observations</p>}
    <ul className="border-b border-[var(--ob-line)]">
      {vendors.map(v => {
        const age = now && v.last_check_at ? Math.max(0, now - Date.parse(v.last_check_at)) : null;
        const stale = age != null && age > 900_000;
        const status = stale ? 'No recent data' : ({ operational: 'Operational', down: 'Check failed', degraded: 'Degraded', stale: 'No recent data' }[v.recent_status ?? ''] ?? 'No observations');
        const state = stale ? 'unknown' : ({ operational: 'healthy', down: 'critical', degraded: 'degraded', stale: 'unknown' }[v.recent_status ?? ''] ?? 'unknown');
        return <li key={v.id} className="border-t border-[var(--ob-line)]">
          <Link href={SHARE_ROUTES.observatoryVendor(v.vendor_name)} className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 py-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]">
            <span className="min-w-0">
              <span className="block truncate text-[clamp(1.25rem,2.6vw,1.875rem)] font-semibold uppercase leading-[1.05] tracking-[-0.015em] text-[var(--ob-text)]">
                {v.display_name}
              </span>
              <span className="ob-label mt-2 block">{v.category}</span>
            </span>
            <span className="hidden md:block">
              <span className="ob-label block">Last check</span>
              <time dateTime={v.last_check_at ?? undefined} className="ob-mono mt-2 block text-[12.5px] text-[var(--ob-text-3)]">
                {v.last_check_at ? age == null ? 'Observed' : age < 60_000 ? 'Just now' : `${Math.floor(age / 60_000)}m ago` : 'Waiting'}
              </time>
            </span>
            <span className="hidden text-right md:block">
              <span className="ob-label block">Latency</span>
              <span className="ob-mono mt-2 block text-[12.5px] text-[var(--ob-text-3)]">{v.latency_ms != null ? `${Math.round(v.latency_ms)} ms` : '-'}</span>
            </span>
            <span className="ob-state shrink-0 justify-self-end self-center" data-state={state}>
              <span className="ob-dot" data-state={state} />
              {status}
            </span>
          </Link>
        </li>;
      })}
    </ul>
  </>;
}
