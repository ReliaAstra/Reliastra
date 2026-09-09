'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  getReferralCodeFromSearch,
  persistPublicReferralCookie,
} from '@/lib/partner-referral';

/**
 * Persists `?ref=` from any public URL into the 90-day display cookie.
 *
 * The canonical `/r/{code}` resolver also writes the HttpOnly attribution
 * cookie. This component covers the secondary shape (`/?ref=CODE`,
 * `/signup?ref=CODE`) so a shared query URL still attributes at signup.
 *
 * Reads `window.location.search` inside the effect rather than
 * `useSearchParams()` so statically generated routes do not need a
 * Suspense boundary.
 */
export function ReferralCapture() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const code = getReferralCodeFromSearch(window.location.search);
    if (code) persistPublicReferralCookie(code);
  }, [pathname]);

  return null;
}
