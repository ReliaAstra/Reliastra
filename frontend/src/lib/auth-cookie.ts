'use client';

/**
 * Cookie transport for session context across the preview edge.
 *
 * The browser talks to this app through the Arena/e2b preview origin, and
 * the shared sign-in flow keeps the bearer token in memory/localStorage.
 * Some preview edge proxies strip the `Authorization` (and other custom)
 * headers from browser requests, which silently turns every authenticated
 * API call into a 401 — login/refresh still succeed because they carry no
 * bearer header — the classic "signed in, then immediately signed out"
 * symptom.
 *
 * Cookies are normalised by edge proxies, so the access token (and the
 * active organization id) are mirrored into same-origin cookies here
 * (non-httpOnly, JS-set, SameSite=Lax) and the Next.js proxy route
 * re-injects them as `Authorization: Bearer …` / `X-Organization-ID`
 * when forwarding to the backend. The cookies are never forwarded to the
 * backend itself.
 */

import { ACCESS_TOKEN_COOKIE, ORG_ID_COOKIE } from '@/lib/session-cookies';

export { ACCESS_TOKEN_COOKIE, ORG_ID_COOKIE };
const MAX_AGE_SECONDS = 60 * 60; // matches ACCESS_TOKEN_EXPIRE_MINUTES=60

function sameSiteAttrs(): string {
  // HTTPS (Arena preview, embedded cross-site) needs None+Secure so the
  // cookie is sent on same-origin fetches from within an iframe. Add
  // `Partitioned` (CHIPS): modern browsers block *third-party* cookies in
  // cross-site iframes, and without it the cookie write is silently dropped
  // and the app 401s right after login. A partitioned cookie is still sent
  // on same-origin fetches inside the embedding partition.
  // Plain http://localhost dev cannot set Secure cookies, so fall back to Lax.
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return secure ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax';
}

function setCookie(name: string, value: string | null, maxAge: number): void {
  if (typeof document === 'undefined') return;
  const attrs = `Path=/; Max-Age=${maxAge}; ${sameSiteAttrs()}`;
  if (!value) {
    document.cookie = `${name}=; ${attrs.replace(`Max-Age=${maxAge}`, 'Max-Age=0')}`;
    return;
  }
  document.cookie = `${name}=${encodeURIComponent(value)}; ${attrs}`;
}

export function setAccessTokenCookie(token: string | null): void {
  setCookie(ACCESS_TOKEN_COOKIE, token, MAX_AGE_SECONDS);
}

export function setOrgIdCookie(orgId: string | null): void {
  setCookie(ORG_ID_COOKIE, orgId, MAX_AGE_SECONDS);
}

export function clearAccessTokenCookie(): void {
  setAccessTokenCookie(null);
}

export function clearOrgIdCookie(): void {
  setOrgIdCookie(null);
}

export function clearSessionCookies(): void {
  clearAccessTokenCookie();
  clearOrgIdCookie();
}
