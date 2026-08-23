'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { captureAttribution } from '@/lib/attribution';

/**
 * Captures first-touch acquisition attribution on every full page load.
 * Silent, synchronous (localStorage), zero network - failure can never
 * affect rendering. Mounted once in the root layout.
 *
 * NOTE: deliberately reads window.location.search inside the effect rather
 * than calling useSearchParams() - that hook requires a Suspense boundary
 * during static prerendering and would break `next build` for every
 * statically generated route. A pathname-keyed effect covers every entry
 * point (direct hit, refresh, campaign link) because UTMs arrive on fresh
 * document loads.
 */
export function AttributionCapture() {
  const pathname = usePathname();

  useEffect(() => {
    captureAttribution(window.location.search, pathname || '/');
  }, [pathname]);

  return null;
}
