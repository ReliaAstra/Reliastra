import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  clearAdminSessionCookiesProxy,
  requestIsSecure,
  setAdminSessionCookiesProxy,
} from '@/lib/admin-session-gate';
import { verifyAdminToken } from '@/lib/admin-token-verify';

/**
 * Server-side gate for the admin surface.
 *
 * `/admin` and every sub-route must never render for a visitor who does not
 * hold a valid admin session. This proxy:
 *
 *   1. verifies the HttpOnly admin access cookie (HS256 signature,
 *      audience, token type, expiry) using ADMIN_TOKEN_SECRET;
 *   2. if the access cookie is expired but the refresh cookie is valid,
 *      rotates the session against the backend and rewrites both cookies so
 *      the visitor continues uninterrupted;
 *   3. otherwise redirects to the dedicated `/admin/login` page — the
 *      customer/partner sign-in is never offered to the control plane.
 *
 * Assets under `/_next/*` are not matched, so bundles and fonts stay
 * cacheable; the HTML/shell (`/admin/**`) is what is protected.
 *
 * NOTE: proxy.ts runs on the Node.js runtime in Next 16, so the Node
 * crypto-based JWT verification in `admin-token-verify.ts` is available.
 * `ADMIN_TOKEN_SECRET` must be set in the frontend env (same value as the
 * backend); if it is missing the gate FAILS CLOSED and redirects to login.
 */

const ADMIN_PAGE_PREFIX = '/admin';
const ADMIN_LOGIN_PATH = '/admin/login';

export const config = {
  // All admin page routes, excluding static assets and the API (the API
  // route handler has its own cookie-gated enforcement).
  matcher: ['/admin/:path*'],
};

interface RotatedSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Resolve the admin session for a page request.
 *
 * Returns `{ rotated: session }` when a rotation just happened,
 * `{ rotated: null }` when the access cookie is already valid, or `null`
 * when there is no usable session (no cookie, invalid, or backend rejected
 * the refresh).
 */
async function resolveAdminPageSession(
  req: NextRequest
): Promise<{ rotated: RotatedSession | null } | null> {
  if (verifyAdminToken(req.cookies.get(ADMIN_ACCESS_COOKIE)?.value, 'admin_access')) {
    return { rotated: null };
  }

  const refreshToken = req.cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? null;
  if (!refreshToken || !verifyAdminToken(refreshToken, 'admin_refresh')) return null;

  const backendUrl =
    (process.env.RELIASTRA_API_URL?.replace(/\/$/, '') || 'https://api.reliastra.com') +
    '/v1/admin/auth/refresh';

  let res: Response;
  try {
    res = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token || !data.refresh_token) return null;

  return {
    rotated: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? 15 * 60,
    },
  };
}

export default async function proxy(req: NextRequest, _event?: unknown): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const isAdminPage = pathname === ADMIN_PAGE_PREFIX || pathname.startsWith(`${ADMIN_PAGE_PREFIX}/`);
  const isLoginPage = pathname === ADMIN_LOGIN_PATH || pathname.startsWith(`${ADMIN_LOGIN_PATH}/`);
  const secure = requestIsSecure(req);

  // Already-authenticated visitors (valid access cookie OR a refresh that
  // just succeeded) skip the login page entirely.
  if (isLoginPage) {
    const session = await resolveAdminPageSession(req);
    if (session) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin';
      url.search = '';
      const response = NextResponse.redirect(url);
      if (session.rotated) {
        setAdminSessionCookiesProxy(
          response,
          session.rotated.accessToken,
          session.rotated.refreshToken,
          session.rotated.expiresIn,
          secure
        );
      }
      return response;
    }
    return NextResponse.next();
  }

  if (!isAdminPage) {
    return NextResponse.next();
  }

  const session = await resolveAdminPageSession(req);
  if (!session) {
    // Fail closed: no (verified) session → the dedicated admin sign-in.
    const url = req.nextUrl.clone();
    url.pathname = ADMIN_LOGIN_PATH;
    url.search = pathname === ADMIN_PAGE_PREFIX ? '' : `?next=${encodeURIComponent(pathname)}`;
    const response = NextResponse.redirect(url);
    // Drop stale admin cookies on the way out so a revoked session does not
    // keep being replayed.
    clearAdminSessionCookiesProxy(response, secure);
    return response;
  }

  const response = NextResponse.next();
  if (session.rotated) {
    // Session rotated: proceed with fresh cookies attached.
    setAdminSessionCookiesProxy(
      response,
      session.rotated.accessToken,
      session.rotated.refreshToken,
      session.rotated.expiresIn,
      secure
    );
  }
  applyAdminHeaders(response);
  return response;
}

function applyAdminHeaders(response: NextResponse): void {
  // No indexing and no caching of the shell HTML. (X-Frame-Options is left
  // to next.config.ts: the app is legitimately embedded in the live-preview
  // iframe, and the existing global policy applies to admin too.)
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
}
