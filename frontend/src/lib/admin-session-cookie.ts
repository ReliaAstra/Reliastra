/**
 * Admin-session cookie transport (server-only; never imported by client code).
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
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}
