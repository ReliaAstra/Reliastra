'use client';

import { setAccessTokenCookie, setPartnerAccessTokenCookie, clearSessionCookies } from '@/lib/auth-cookie';

/** Customer session storage. Partner sessions have their own token family and cookie. */
export const ACCESS_TOKEN_KEY = 'reliastra_access_token';
export const REFRESH_TOKEN_KEY = 'reliastra_refresh_token';
export const LEGACY_ACCESS_TOKEN_KEY = 'partner_access_token';
export const LEGACY_REFRESH_TOKEN_KEY = 'partner_refresh_token';
export const LEGACY_PARTNER_STORE_KEY = 'partner-store';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    window.localStorage.getItem(ACCESS_TOKEN_KEY)
  );
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    window.localStorage.getItem(REFRESH_TOKEN_KEY)
  );
}

/**
 * Persist a freshly issued token pair.
 *
 * Writes only the customer namespace and mirrors the access
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
  } else if (access === null) {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
  if (refresh) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  } else if (refresh === null) {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
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

export { clearPartnerTokens } from './partner-session';

/** Explicit sign-out: wipe both namespaces and the persisted partner store. */
export function clearAllSessionTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  // The legacy Partner Network persists its auth envelope under this key.
  // Remove it too so an explicit logout cannot be resurrected by hydration.
  window.localStorage.removeItem(LEGACY_PARTNER_STORE_KEY);
  setPartnerAccessTokenCookie(null);
  clearSessionCookies();
}
