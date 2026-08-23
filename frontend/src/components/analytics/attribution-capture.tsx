'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { captureAttribution } from '@/lib/attribution';

/**
 * Captures first-touch acquisition attribution on every full page load.
 * Silent, synchronous (localStorage), zero network - failure can never
 * affect rendering. Mounted once in the root layout.
 *
 * Suspense note: useSearchParams requires a Suspense boundary during
 * prerendering; the root layout wraps children in dynamic rendering via
 * ThemeProvider already, and this component renders null so it is safe.
 */
export function AttributionCapture() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? '';

  useEffect(() => {
    captureAttribution(search ? `?${search}` : window.location.search, pathname || '/');
  }, [pathname, search]);

  return null;
}
