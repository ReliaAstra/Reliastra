'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Privacy-light visitor beacon.
 *
 * Fires once per pathname per browser session to
 * /v1/public/analytics/visit. The backend derives country from CDN headers
 * or IP (hashed, cached) and counts unique visitors via HyperLogLog. No
 * cookies, no localStorage, no PII leaves the browser except the path.
 */
export function VisitBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const key = `reliastra_beacon:${pathname}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Private mode with storage disabled - still send, dedupe is best-effort.
    }

    const url = `/api/v1/public/analytics/visit?path=${encodeURIComponent(pathname)}`;
    try {
      const blob = new Blob([], { type: 'application/json' });
      if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url, blob)) {
        return;
      }
    } catch {
      // fall through to fetch
    }
    void fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
  }, [pathname]);

  return null;
}
