import type { NextResponse } from 'next/server';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  adminAccessMaxAgeSeconds,
  adminCookieAttrs,
  requestIsSecure,
} from '@/lib/admin-session-cookie';

export { ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE, requestIsSecure };

/**
 * Cookie write helpers used by `proxy.ts` (the server-side admin gate).
 *
 * Kept in a separate module from `admin-backend-proxy.ts` so the proxy can
 * reuse the exact same cookie attributes (Secure/SameSite/Partitioned) as
 * the API route handlers — a mismatch there is what silently discards a
 * session on the preview edge.
 */

export function setAdminSessionCookiesProxy(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number,
  secure: boolean
): void {
  const attrs = adminCookieAttrs(secure);
  response.cookies.set(ADMIN_ACCESS_COOKIE, accessToken, {
    ...attrs,
    maxAge: expiresInSeconds > 0 ? expiresInSeconds : adminAccessMaxAgeSeconds(),
  });
  response.cookies.set(ADMIN_REFRESH_COOKIE, refreshToken, {
    ...attrs,
    maxAge: Math.max(expiresInSeconds, 60 * 60),
  });
}

export function clearAdminSessionCookiesProxy(response: NextResponse, secure: boolean): void {
  const attrs = adminCookieAttrs(secure);
  response.cookies.set(ADMIN_ACCESS_COOKIE, '', { ...attrs, maxAge: 0 });
  response.cookies.set(ADMIN_REFRESH_COOKIE, '', { ...attrs, maxAge: 0 });
}
