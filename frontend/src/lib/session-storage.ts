'use client';

import { setAccessTokenCookie, clearSessionCookies } from '@/lib/auth-cookie';

/**
 * Single shared session-token store for every authenticated surface.
 *
 * Three surfaces share one backend JWT session:
 *   - customer console (`/dashboard`, app-store) — historically wrote only
 *     `reliastra_refresh_token`;
 *   - partner SPA (`/`, state-routed) — historically wrote only
 *     `partner_access_token` / `partner_refresh_token`;
 *   - admin console (`/admin`, admin-api) — read either, but wiped everything
 *     on a non-admin 401, logging the customer out.
 *
 * The canonical keys are `reliastra_access_token` / `reliastra_refresh_token`.
 * `partner_*` are kept as legacy mirrors so old readers keep working and an
 * existing partner session is not lost on upgrade. Reads check `reliastra_*`
 * first, then fall back to `partner_*`.
 *
 * Cleanup is namespace-scoped: a surface clears ONLY its own keys when a
 * refresh fails, and clears everything only on an explicit sign-out. That is
 * the rule that keeps "customer on /admin gets 'restricted'" from destroying
 * the customer's refresh token.
 */

export const ACCESS_TOKEN_KEY = 'reliastra_access_token';
export const REFRESH_TOKEN_KEY = 'reliastra_refresh_token';
export const LEGACY_ACCESS_TOKEN_KEY = 'partner_access_token';
export const LEGACY_REFRESH_TOKEN_KEY = 'partner_refresh_token';
export const LEGACY_PARTNER_STORE_KEY = 'partner-store';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    window.localStorage.getItem(ACCESS_TOKEN_KEY) ||
    window.localStorage.getItem(LEGACY_ACCESS_TOKEN_KEY)
  );
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    window.localStorage.getItem(REFRESH_TOKEN_KEY) ||
    window.localStorage.getItem(LEGACY_REFRESH_TOKEN_KEY)
  );
}

/**
 * Persist a freshly issued token pair.
 *
 * Writes both namespaces (canonical + legacy mirror) and mirrors the access
 * token into the same-origin cookie used by the Next proxy for edge-stripped
 * `Authorization` headers. Passing `undefined` for a value leaves it alone;
 * passing `null` clears it.
 */
export function storeSessionTokens(
  access: string | null | undefined,
  refresh: string | null | undefined
): void {
  if (typeof window === 'undefined') return;
  if (access) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, access);
    window.localStorage.setItem(LEGACY_ACCESS_TOKEN_KEY, access);
  }
  if (refresh) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    window.localStorage.setItem(LEGACY_REFRESH_TOKEN_KEY, refresh);
  }
  // Only touch the cookie when the access token was part of this call,
  // otherwise a refresh-token-only write would clear a live session cookie.
  if (access !== undefined) setAccessTokenCookie(access ?? null);
}

/** Clear ONLY the customer-console keys (refresh failure, non-explicit). */
export function clearCustomerTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  clearSessionCookies();
}

/** Clear ONLY the partner-SPA keys (refresh failure, non-explicit). */
export function clearPartnerTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  clearSessionCookies();
}

/** Explicit sign-out: wipe both namespaces and the persisted partner store. */
export function clearAllSessionTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  // The legacy Partner Program persists its auth envelope under this key.
  // Remove it too so an explicit logout cannot be resurrected by hydration.
  window.localStorage.removeItem(LEGACY_PARTNER_STORE_KEY);
  clearSessionCookies();
}
