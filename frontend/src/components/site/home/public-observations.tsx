'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { TrackVendorListItem } from '@/lib/track-api';

/** SSR supplies first paint; visible-page polling prevents frozen "just now" labels. */
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
    {error && <p role="status" className="ob-small mt-4">Updates unavailable · showing last retrieved observations</p>}
    <ul className="mt-4 grid gap-x-12 sm:grid-cols-2 xl:grid-cols-3">
      {vendors.map(v => {
        const age = now && v.last_check_at ? Math.max(0, now - Date.parse(v.last_check_at)) : null;
        const stale = age != null && age > 900_000;
        const status = stale ? 'No recent data' : ({ operational: 'Operational', down: 'Check failed', degraded: 'Degraded', stale: 'No recent data' }[v.recent_status ?? ''] ?? 'No observations');
        return <li key={v.id}><Link href={`/track/${v.vendor_name}`} className="group flex items-baseline justify-between gap-4 border-b border-[var(--ob-line)] py-5 hover:border-[var(--ob-line-3)]">
          <span className="min-w-0"><span className="block truncate text-[15px] font-medium text-[var(--ob-text)]">{v.display_name}</span><span className="ob-label mt-2 block">{v.category}</span></span>
          <span className="shrink-0 text-right"><span className="ob-label block">{status}</span><span className="ob-small mt-1 block">{v.latency_ms != null ? `${Math.round(v.latency_ms)} ms` : '—'}</span><time dateTime={v.last_check_at ?? undefined} className="ob-small mt-1 block">{v.last_check_at ? age == null ? 'Observed' : age < 60_000 ? 'Just now' : `${Math.floor(age / 60_000)}m ago` : 'Waiting for first check'}</time></span>
        </Link></li>;
      })}
    </ul>
  </>;
}
