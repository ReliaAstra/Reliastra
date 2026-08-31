/**
 * Shared cookie names + attribute policy for the customer/partner session.
 *
 * Server-safe (no `'use client'`): imported by both the server proxy
 * (`lib/backend-proxy.ts`, which sets these cookies via Set-Cookie) and the
 * client-side mirror (`lib/auth-cookie.ts`, which sets them via
 * `document.cookie` as a belt-and-suspenders fallback).
 *
 * Keeping the names and attributes in ONE place is what stops the cookie
 * written by one layer from diverging from the cookie read by the other —
 * a mismatch there is what silently discards a session on the preview edge.
 */

export const ACCESS_TOKEN_COOKIE = 'reliastra_access_token';
export const ORG_ID_COOKIE = 'reliastra_organization_id';

/**
 * Mirror header for the access token.
 *
 * The preview edge strips the standard `Authorization` header from browser
 * requests. Cookies are the primary fallback, but in cross-site iframe
 * previews third-party cookies can also be refused. This non-standard header
 * carries the same bearer token so the proxy has a channel the edge is less
 * likely to mangle; the proxy re-injects it as `Authorization` upstream and
 * never lets it reach the browser as a credential different from the one the
 * client already holds.
 */
export const AUTH_TOKEN_HEADER = 'X-Reliastra-Token';
export const ORG_ID_HEADER = 'X-Reliastra-Org-Id';

export interface SessionCookieAttrs {
  httpOnly: boolean;
  sameSite: 'none' | 'lax';
  secure: boolean;
  partitioned: boolean;
  path: '/';
}

/**
 * Is the browser-facing connection HTTPS?
 *
 * The preview edge terminates TLS in front of the app and forwards
 * `x-forwarded-proto: http` even though the visitor connected over https.
 * Trusting that header makes the app emit `SameSite=Lax` (no Secure) cookies,
 * which the browser refuses to store in a cross-site iframe — the exact
 * "signed in, then immediately signed out" failure. The reliable signal is
 * the Host: anything that is not localhost/127.0.0.1 is served behind a
 * TLS-terminating proxy.
 */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded && forwarded.split(',')[0].trim().toLowerCase() === 'https') {
    return true;
  }
  const host =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    '';
  const isLocalHost = /(^|\.)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(
    host
  );
  if (host && !isLocalHost) return true;
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Structured attributes for a customer-session cookie.
 *
 * The access/org cookies are read back ONLY by the Next proxy (never by
 * browser JS on this surface — the browser reads its tokens from
 * localStorage), but they are kept non-httpOnly so the existing client-side
 * clear path (`clearSessionCookies`) can still remove them on sign-out.
 *
 * HTTPS (Arena preview, embedded cross-site): SameSite=None; Secure;
 * Partitioned (CHIPS) so the cookie survives a cross-site iframe. Plain
 * http://localhost cannot set Secure cookies, so fall back to Lax.
 */
export function sessionCookieAttrs(secure: boolean): SessionCookieAttrs {
  if (secure) {
    return {
      httpOnly: false,
      sameSite: 'none',
      secure: true,
      partitioned: true,
      path: '/',
    };
  }
  return {
    httpOnly: false,
    sameSite: 'lax',
    secure: false,
    partitioned: false,
    path: '/',
  };
}
