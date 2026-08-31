/**
 * Client-side fallback transport for the admin session.
 *
 * The primary admin transport is HttpOnly cookies (set by the `/api/admin/*`
 * route handlers), so the tokens normally never reach browser JavaScript.
 * Embedded cross-site preview iframes refuse to store cookies, which strands
 * the cookie-only admin session — so the login handler ALSO returns the token
 * pair to the client and it is held here, in sessionStorage (cleared when the
 * tab closes), as a last-resort channel. The admin proxy verifies the mirror
 * header exactly like the cookie (signature + audience + type + expiry) and
 * only falls back to it when the HttpOnly cookie is absent.
 *
 * These keys are deliberately distinct from the customer/partner session
 * keys: the admin token family is a separate security domain and is rejected
 * on every customer/partner surface.
 */

const ADMIN_ACCESS_KEY = 'reliastra_admin_access_token';
const ADMIN_REFRESH_KEY = 'reliastra_admin_refresh_token';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function storeAdminTokens(access: string | null, refresh: string | null): void {
  const s = storage();
  if (!s) return;
  if (access) s.setItem(ADMIN_ACCESS_KEY, access);
  else s.removeItem(ADMIN_ACCESS_KEY);
  if (refresh) s.setItem(ADMIN_REFRESH_KEY, refresh);
  else s.removeItem(ADMIN_REFRESH_KEY);
}

export function getAdminAccessToken(): string | null {
  return storage()?.getItem(ADMIN_ACCESS_KEY) ?? null;
}

export function getAdminRefreshToken(): string | null {
  return storage()?.getItem(ADMIN_REFRESH_KEY) ?? null;
}

export function clearAdminTokens(): void {
  const s = storage();
  if (!s) return;
  s.removeItem(ADMIN_ACCESS_KEY);
  s.removeItem(ADMIN_REFRESH_KEY);
}
