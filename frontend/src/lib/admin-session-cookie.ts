/**
 * Admin-session cookie transport (cookie attrs + header constants).
 *
 * Cookie WRITING stays server-side (route handlers + proxy). The module has no
 * `server-only` guard because the admin client imports the `ADMIN_API_HEADER`
 * and `ADMIN_TOKEN_HEADER` constants for its requests and the preview-edge
 * mirror fallback.
 *
 * The admin console is a SEPARATE security domain from the customer/partner
 * console:
 *
 *   - The admin JWT family (aud=reliastra-admin, signed with
 *     ADMIN_TOKEN_SECRET) never reaches browser JavaScript. Tokens are
 *     written into HttpOnly cookies by the /api/admin route handlers and are
 *     read back only by those handlers and by the Next proxy (`proxy.ts`).
 *   - Cookie names are namespaced (`reliastra_admin_*`) so a customer or
 *     partner session can never be mistaken for an admin session.
 *   - There is NO localStorage / sessionStorage involvement for admin: the
 *     browser is never given the raw access or refresh token.
 *
 * Attribute story (must match what auth-cookie.ts does for the customer
 * surface, otherwise the admin session vanishes in the same environments):
 *
 *   - HTTPS preview (Arena/e2b, cross-site iframe): SameSite=None; Secure;
 *     Partitioned (CHIPS). A partitioned cookie is still sent on same-origin
 *     fetches inside the embedding partition.
 *   - plain http://localhost dev cannot set Secure cookies → SameSite=Lax.
 */

export const ADMIN_ACCESS_COOKIE = 'reliastra_admin_access';
export const ADMIN_REFRESH_COOKIE = 'reliastra_admin_refresh';

/** Custom header every admin API request must carry (CSRF defense). */
export const ADMIN_API_HEADER = 'x-admin-request';

/**
 * Mirror header for the admin access token.
 *
 * The admin session is transported in HttpOnly cookies so the tokens never
 * reach browser JavaScript. That design breaks in embedded cross-site preview
 * iframes where the browser refuses to store ANY cookie — the same reason the
 * customer surface mirrors its bearer token. As a fallback the login handler
 * also returns the tokens to the client (held in sessionStorage), and the
 * admin proxy accepts this header when the HttpOnly cookie is absent. It is
 * verified (signature + audience + type + expiry) exactly like the cookie, so
 * a customer/partner token can never be smuggled in.
 */
export const ADMIN_TOKEN_HEADER = 'X-Reliastra-Admin-Token';

/** Defaults mirror backend settings; env may override per-deploy. */
export function adminAccessMaxAgeSeconds(): number {
  const minutes = Number(process.env.ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES ?? '15');
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : 15 * 60;
}

export function adminRefreshMaxAgeSeconds(): number {
  const days = Number(process.env.ADMIN_REFRESH_TOKEN_EXPIRE_DAYS ?? '1');
  return Number.isFinite(days) && days > 0 ? days * 24 * 60 * 60 : 24 * 60 * 60;
}

export interface AdminCookieAttrs {
  httpOnly: true;
  sameSite: 'none' | 'lax';
  secure: boolean;
  partitioned: boolean;
  path: '/';
}

export function adminCookieAttrs(secure: boolean): AdminCookieAttrs {
  if (secure) {
    return {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      partitioned: true,
      path: '/',
    };
  }
  return { httpOnly: true, sameSite: 'lax', secure: false, partitioned: false, path: '/' };
}

/**
 * Is this request arriving over TLS? In the Arena preview the platform
 * terminates TLS in front of the app, so check the forwarded header first;
 * fall back to the URL the Next server sees.
 */
export function requestIsSecure(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) {
    const proto = forwarded.split(',')[0].trim().toLowerCase();
    if (proto === 'https') return true;
    // Some preview edges forward `x-forwarded-proto: http` even though the
    // browser actually connected over https (TLS terminates in front of the
    // app). Do NOT trust that value blindly — fall through to the host
    // heuristic below, which is the reliable signal here.
  }
  const host =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    '';
  const isLocalHost = /(^|\.)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(host);
  // A non-local host (arena.site, e2b.app, a real domain) is always served
  // behind a TLS-terminating proxy from the browser's point of view.
  if (host && !isLocalHost) return true;
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}
