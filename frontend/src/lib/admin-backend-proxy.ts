import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_API_HEADER,
  ADMIN_REFRESH_COOKIE,
  adminAccessMaxAgeSeconds,
  adminRefreshMaxAgeSeconds,
  adminCookieAttrs,
  requestIsSecure,
} from '@/lib/admin-session-cookie';
import { verifyAdminToken } from '@/lib/admin-token-verify';

const BACKEND_URL = process.env.RELIASTRA_API_URL?.replace(/\/$/, '') || 'https://api.reliastra.com';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': `${ADMIN_API_HEADER}, Content-Type, X-Request-ID, Idempotency-Key, X-Requested-With`,
  'Access-Control-Allow-Credentials': 'true',
};

function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId?: string | null
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details: [],
        ...(requestId ? { request_id: requestId } : {}),
      },
    },
    { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
  );
}

/**
 * Every admin auth endpoint must carry the custom marker header (set by the
 * admin API client). Custom headers cannot be sent by a cross-site form or
 * top-level navigation, so this is the CSRF boundary for the cookie-based
 * admin session. (The admin surface is embedded in a cross-site preview
 * iframe, so the cookies themselves must be SameSite=None.)
 */
function hasAdminMarker(req: NextRequest): boolean {
  return req.headers.get(ADMIN_API_HEADER) === '1';
}

export interface AdminTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AdminIdentityPayload {
  id: string;
  username: string;
  email: string;
  full_name: string;
  is_system_admin: boolean;
}

export interface AdminLoginPayload {
  admin: AdminIdentityPayload;
  expires_in: number;
}

/**
 * Client login handler used by `/api/admin/auth/login`.
 *
 * This is the ONLY admin route that does not require an existing session:
 * it forwards the operator credentials to the backend, which verifies them
 * in constant time (rate-limited). The minted tokens are captured server-side
 * and returned to the browser ONLY as HttpOnly cookies — the JSON body the
 * browser receives never contains them.
 */
export async function handleAdminLogin(
  req: NextRequest,
  requestId: string | null
): Promise<NextResponse> {
  if (!hasAdminMarker(req)) {
    return errorResponse(403, 'FORBIDDEN', 'Admin login requires the admin marker.', requestId);
  }
  let body: { username?: unknown; password?: unknown };
  try {
    body = (await req.json()) as { username?: unknown; password?: unknown };
  } catch {
    return errorResponse(400, 'BAD_REQUEST', 'A JSON body is required.', requestId);
  }
  if (typeof body.username !== 'string' || !body.username || typeof body.password !== 'string' || !body.password) {
    return errorResponse(400, 'BAD_REQUEST', 'username and password are required.', requestId);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (requestId) headers['X-Request-ID'] = requestId;

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/v1/admin/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: body.username, password: body.password }),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch {
    return errorResponse(
      502,
      'BACKEND_UNAVAILABLE',
      'RELIASTRA API is temporarily unavailable. Please retry.',
      requestId
    );
  }

  const payload = (await upstream.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    admin?: AdminIdentityPayload;
    error?: { message?: string; code?: string };
    detail?: string;
  };

  if (!upstream.ok) {
    const message =
      payload.error?.message || payload.detail || 'Admin sign-in failed.';
    const code = payload.error?.code || 'ADMIN_LOGIN_FAILED';
    return errorResponse(upstream.status, code, message, requestId);
  }

  if (!payload.access_token || !payload.refresh_token || !payload.admin) {
    return errorResponse(502, 'BACKEND_PROTOCOL_ERROR', 'Unexpected admin login response.', requestId);
  }

  const response = NextResponse.json(
    {
      admin: payload.admin,
      expires_in: payload.expires_in ?? 15 * 60,
    },
    { headers: CORS_HEADERS }
  );
  setAdminSessionCookies(
    response,
    payload.access_token,
    payload.refresh_token,
    payload.expires_in ?? 15 * 60,
    requestIsSecure(req)
  );
  return response;
}

/**
 * Client logout: revoke the refresh token server-side (best-effort), then
 * always clear the admin session cookies.
 */
export async function handleAdminLogout(req: NextRequest): Promise<NextResponse> {
  if (!hasAdminMarker(req)) {
    return errorResponse(403, 'FORBIDDEN', 'Admin logout requires the admin marker.', req.headers.get('x-request-id'));
  }
  const refreshToken = req.cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? null;
  const response = new NextResponse(null, { status: 204, headers: CORS_HEADERS });

  if (refreshToken) {
    try {
      await fetch(`${BACKEND_URL}/v1/admin/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      });
    } catch {
      // Best-effort: the cookies below are cleared regardless.
    }
  }

  clearAdminSessionCookies(response, requestIsSecure(req));
  return response;
}

/**
 * Client-triggered refresh: rotate using the HttpOnly refresh cookie and
 * refresh the identity by re-checking `/auth/me`. The client never supplies
 * the token — it lives only in the cookie.
 */
export async function handleAdminRefresh(req: NextRequest): Promise<NextResponse> {
  if (!hasAdminMarker(req)) {
    return errorResponse(403, 'FORBIDDEN', 'Admin refresh requires the admin marker.', req.headers.get('x-request-id'));
  }
  const refreshToken = req.cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? null;
  const requestId = req.headers.get('x-request-id');
  if (!refreshToken || !verifyAdminToken(refreshToken, 'admin_refresh')) {
    return errorResponse(401, 'UNAUTHORIZED', 'Admin session has expired.', requestId);
  }
  const pair = await rotateAdminSession(refreshToken, requestId);
  if (!pair) {
    return errorResponse(401, 'UNAUTHORIZED', 'Admin session has expired.', requestId);
  }

  // Re-fetch the identity with the fresh access token so the response is a
  // complete, useful payload (no raw tokens leave the server).
  let admin: AdminIdentityPayload | null = null;
  try {
    const me = await fetch(`${BACKEND_URL}/v1/admin/auth/me`, {
      headers: {
        Authorization: `Bearer ${pair.accessToken}`,
        Accept: 'application/json',
        ...(requestId ? { 'X-Request-ID': requestId } : {}),
      },
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (me.ok) {
      admin = (await me.json()) as AdminIdentityPayload;
    }
  } catch {
    // Identity refresh is best-effort; session cookies are still rotated.
  }

  const response = NextResponse.json(
    { admin, expires_in: pair.expiresIn },
    { headers: CORS_HEADERS }
  );
  setAdminSessionCookies(
    response,
    pair.accessToken,
    pair.refreshToken,
    pair.expiresIn,
    requestIsSecure(req)
  );
  return response;
}

/**
 * Proxy an admin API request to the backend with the admin session cookies.
 *
 * Security boundary, enforced server-side:
 *
 *   1. The browser carries the admin session ONLY in HttpOnly cookies. An
 *      incoming `Authorization` header from the browser is deliberately
 *      ignored here, so a customer/partner token from localStorage can never
 *      be smuggled into the admin plane.
 *   2. Every request (except `/auth/login`, handled separately) must carry
 *      the admin-only CSRF marker header `x-admin-request: 1`.
 *   3. The access cookie is verified (signature + audience + type + expiry)
 *      with ADMIN_TOKEN_SECRET before anything is forwarded.
 *   4. If the access token is expired but the refresh cookie is valid, the
 *      proxy rotates it against `/v1/admin/auth/refresh`, stores the new pair
 *      in the response cookies, and replays the request once — client JS
 *      stays out of the refresh loop entirely.
 *   5. Only `/v1/admin/*` paths are reachable; the caller already sanitized
 *      and prefixed the path with `/admin`.
 */
export async function proxyAdminToBackend(
  safePath: string,
  req: NextRequest,
  options?: {
    /** Skip the authorization gate (used ONLY by /api/admin/auth/login). */
    bypassAuth?: boolean;
    /** Skip the automatic refresh-and-replay (used by /refresh + /logout). */
    noReplay?: boolean;
  }
): Promise<NextResponse> {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  // CSRF marker: a cross-site form cannot set a custom header. Login is the
  // only exception (it is credential-based and its cookies are HttpOnly).
  if (!options?.bypassAuth && req.headers.get(ADMIN_API_HEADER) !== '1') {
    return errorResponse(
      403,
      'FORBIDDEN',
      'Admin requests must include the admin session marker.',
      req.headers.get('x-request-id')
    );
  }

  const accessToken = req.cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? null;
  const refreshToken = req.cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? null;
  const requestId = req.headers.get('x-request-id');

  let authHeader: string | null = null;
  let refreshed: AdminTokenPair | null = null;

  if (!options?.bypassAuth) {
    const accessClaims = verifyAdminToken(accessToken, 'admin_access');
    if (!accessClaims) {
      // No valid access token: try rotating the refresh cookie before failing.
      if (!options?.noReplay) {
        refreshed = await rotateAdminSession(refreshToken, requestId);
      }
      if (!refreshed) {
        return errorResponse(401, 'UNAUTHORIZED', 'Admin authentication required.', requestId);
      }
      authHeader = `Bearer ${refreshed.accessToken}`;
    } else {
      authHeader = `Bearer ${accessToken}`;
    }
  }

  let response = await fetchBackend(safePath, req, authHeader);
  const secure = requestIsSecure(req);

  // Access token expired mid-session: rotate once and replay.
  if (
    response.status === 401 &&
    !options?.bypassAuth &&
    !options?.noReplay &&
    !refreshed &&
    refreshToken
  ) {
    const attempt = await rotateAdminSession(refreshToken, requestId);
    if (attempt) {
      const replayed = await fetchBackend(safePath, req, `Bearer ${attempt.accessToken}`);
      if (replayed.status !== 401) {
        return attachCookies(replayed, attempt, secure);
      }
    }
    return errorResponse(401, 'UNAUTHORIZED', 'Admin session has expired.', requestId);
  }

  if (refreshed) {
    return attachCookies(response, refreshed, secure);
  }
  return response;
}

/**
 * Exchange a refresh cookie for a fresh admin token pair.
 *
 * Returns the pair on success or null when the refresh token is invalid,
 * expired, replayed, or the backend is unreachable. The refresh token is
 * single-use server-side, so a failed rotation is terminal for the session —
 * which is why failures are surfaced to the client as "expired".
 */
async function rotateAdminSession(
  refreshToken: string | null,
  requestId: string | null
): Promise<AdminTokenPair | null> {
  if (!refreshToken || !verifyAdminToken(refreshToken, 'admin_refresh')) return null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (requestId) headers['X-Request-ID'] = requestId;

  try {
    const res = await fetch(`${BACKEND_URL}/v1/admin/auth/refresh`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!data.access_token || !data.refresh_token) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? 15 * 60,
    };
  } catch {
    return null;
  }
}

async function fetchBackend(
  safePath: string,
  req: NextRequest,
  authHeader: string | null
): Promise<NextResponse> {
  const incoming = new URL(req.url);
  const url = `${BACKEND_URL}/v1${safePath}${incoming.search}`;
  const method = req.method;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;
  const requestId = req.headers.get('x-request-id');
  if (requestId) headers['X-Request-ID'] = requestId;
  const idempotencyKey = req.headers.get('idempotency-key');
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (method !== 'GET' && method !== 'HEAD') headers['Content-Type'] = 'application/json';

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: method !== 'GET' && method !== 'HEAD' ? await req.text() : undefined,
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch {
    return errorResponse(
      502,
      'BACKEND_UNAVAILABLE',
      'RELIASTRA API is temporarily unavailable. Please retry.',
      requestId
    );
  }

  if (upstream.status === 204) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const body = await upstream.text();
  const responseHeaders = new Headers(CORS_HEADERS);
  const contentType = upstream.headers.get('Content-Type');
  responseHeaders.set('Content-Type', contentType || 'application/json');
  const upstreamRequestId = upstream.headers.get('X-Request-ID');
  if (upstreamRequestId) responseHeaders.set('X-Request-ID', upstreamRequestId);

  return new NextResponse(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

/** Re-emit a proxied response with rotated admin cookies attached. */
function attachCookies(
  response: NextResponse,
  pair: AdminTokenPair,
  secure: boolean
): NextResponse {
  const next = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  setAdminSessionCookies(next, pair.accessToken, pair.refreshToken, pair.expiresIn, secure);
  return next;
}

/** Set the HttpOnly admin session cookies on a response. */
export function setAdminSessionCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number,
  secure = true
): void {
  const attrs = adminCookieAttrs(secure);
  response.cookies.set(ADMIN_ACCESS_COOKIE, accessToken, {
    ...attrs,
    // Match the cookie to the access token's own lifetime (falling back to
    // the configured default if the backend reports a non-positive value).
    maxAge: expiresInSeconds > 0 ? expiresInSeconds : adminAccessMaxAgeSeconds(),
  });
  response.cookies.set(ADMIN_REFRESH_COOKIE, refreshToken, {
    ...attrs,
    // The refresh token lives ADMIN_REFRESH_TOKEN_EXPIRE_DAYS (default 1 day);
    // the cookie must survive that long or the browser drops it after an hour
    // and forces a re-login with an otherwise-valid server session.
    maxAge: adminRefreshMaxAgeSeconds(),
  });
}

export function clearAdminSessionCookies(response: NextResponse, secure = true): void {
  const attrs = adminCookieAttrs(secure);
  response.cookies.set(ADMIN_ACCESS_COOKIE, '', { ...attrs, maxAge: 0 });
  response.cookies.set(ADMIN_REFRESH_COOKIE, '', { ...attrs, maxAge: 0 });
}
