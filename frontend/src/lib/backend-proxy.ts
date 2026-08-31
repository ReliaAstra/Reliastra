import { NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  ORG_ID_COOKIE,
  AUTH_TOKEN_HEADER,
  ORG_ID_HEADER,
  sessionCookieAttrs,
  isSecureRequest,
} from '@/lib/session-cookies';

const BACKEND_URL =
  process.env.RELIASTRA_API_URL?.replace(/\/$/, '') ||
  'https://api.reliastra.com';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Organization-ID, Reliastra-Organization, X-Request-ID, Idempotency-Key, X-Requested-With',
  'Access-Control-Allow-Credentials': 'true',
};

/**
 * Auth responses whose body carries a fresh access token. When the preview
 * edge strips the browser's `Authorization` header, the ONLY channel left for
 * the token is the cookie — so the proxy sets `reliastra_access_token` from
 * the response body here, server-side, instead of relying on browser JS
 * (`document.cookie`) to do it. Server `Set-Cookie` is what the admin surface
 * already uses and is far more reliable through the edge.
 */
const TOKEN_ISSUING_PATHS = new Set(['/auth/login', '/auth/verify-otp', '/auth/refresh']);

/** Responses that reveal the active organization id. */
const ORG_ID_PATHS = new Set(['/orgs', '/orgs/current']);

function extractAccessToken(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  // login / refresh: top-level `access_token`.
  if (typeof obj.access_token === 'string' && obj.access_token.length > 0) {
    return obj.access_token;
  }
  // verify-otp: tokens are nested under `tokens.access_token`.
  const tokens = obj.tokens;
  if (tokens && typeof tokens === 'object') {
    const nested = (tokens as Record<string, unknown>).access_token;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return null;
}

function extractOrgId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  // Single organization shape (/orgs/current).
  if (typeof obj.id === 'string') return obj.id;
  // List shape (/orgs): [{...}] or { data: [{...}] } — the bootstrap picks
  // the first entry, so mirror that choice here.
  const list = Array.isArray(data)
    ? (data as unknown[])
    : Array.isArray(obj.data)
      ? (obj.data as unknown[])
      : null;
  const first = list && list[0];
  if (first && typeof first === 'object') {
    const id = (first as Record<string, unknown>).id;
    if (typeof id === 'string') return id;
  }
  return null;
}

export async function proxyToBackend(
  path: string,
  req: Request,
  options?: {
    /** Override the HTTP method */
    method?: string;
    /** Omit the request body (e.g. for GET) */
    noBody?: boolean;
  }
): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  const incoming = new URL(req.url);
  const url = `${BACKEND_URL}/v1${path}${incoming.search}`;
  const method = options?.method || req.method;

  const headers: Record<string, string> = {};

  const cookieHeader = req.headers.get('cookie') ?? '';

  // Forward authorization and request-tracing / idempotency context.
  let authHeader = req.headers.get('authorization');
  let authSource = 'authorization';
  if (!authHeader) {
    // Some preview edge proxies strip the `Authorization` header from
    // browser requests. The client mirrors the bearer token into a
    // non-standard header (X-Reliastra-Token) that the edge is less likely
    // to mangle.
    const mirrorHeader = req.headers.get(AUTH_TOKEN_HEADER);
    if (mirrorHeader) {
      authHeader = mirrorHeader.startsWith('Bearer ')
        ? mirrorHeader
        : `Bearer ${mirrorHeader}`;
      authSource = AUTH_TOKEN_HEADER;
    }
  }
  if (!authHeader) {
    // The token is also mirrored into a same-origin cookie (set server-side
    // here and mirrored by lib/auth-cookie.ts); re-inject it so authenticated
    // calls survive the edge. If a header is present it wins (direct API
    // clients keep working unchanged).
    const cookieMatch = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${ACCESS_TOKEN_COOKIE}=`));
    if (cookieMatch) {
      const token = cookieMatch.slice(`${ACCESS_TOKEN_COOKIE}=`.length);
      authHeader = `Bearer ${decodeURIComponent(token)}`;
      authSource = ACCESS_TOKEN_COOKIE;
    }
  }
  if (authHeader) headers['Authorization'] = authHeader;
  const requestId = req.headers.get('x-request-id');
  if (requestId) headers['X-Request-ID'] = requestId;
  const idempotencyKey = req.headers.get('idempotency-key');
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  // Tenant context must be forwarded on EVERY method: the backend resolves
  // the organization exclusively via these headers, and org-scoped GETs
  // (dependencies, incidents, dashboard, ...) fail without them.
  let orgHeader = req.headers.get('x-organization-id');
  if (!orgHeader) {
    // Mirror header fallback: the edge strips custom headers, so the client
    // sends the org id here too as a channel the edge is less likely to drop.
    const mirrorOrg = req.headers.get(ORG_ID_HEADER);
    if (mirrorOrg) orgHeader = mirrorOrg;
  }
  if (!orgHeader) {
    // Mirrored into a cookie because custom headers can be stripped by
    // preview edges.
    const orgMatch = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${ORG_ID_COOKIE}=`));
    if (orgMatch) {
      orgHeader = decodeURIComponent(orgMatch.slice(`${ORG_ID_COOKIE}=`.length));
    }
  }
  if (orgHeader) headers['X-Organization-ID'] = orgHeader;

  // Forward content-type for requests with body
  if (!options?.noBody && method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    // 30s hard timeout so a hung upstream never leaves the UI in a
    // skeleton forever; the proxy returns a structured 502 the UI can retry.
    signal: AbortSignal.timeout(30_000),
  };

  if (!options?.noBody && method !== 'GET' && method !== 'HEAD') {
    fetchOptions.body = await req.text();
  }

  // Diagnostic: surface exactly what reached the proxy so a stripped header
  // or dropped cookie is visible in dev.log instead of a silent 401 loop.
  if (process.env.NODE_ENV !== 'production') {
    const keys = Array.from(req.headers.keys()).sort();
    console.log(
      `[proxy] ${method} ${path} auth=${authHeader ? authSource : '-'}` +
        ` accessCookie=${cookieHeader.includes(`${ACCESS_TOKEN_COOKIE}=`) ? 'y' : 'n'}` +
        ` orgHeader=${orgHeader ? 'y' : 'n'}` +
        ` orgCookie=${cookieHeader.includes(`${ORG_ID_COOKIE}=`) ? 'y' : 'n'}` +
        ` fwd=${req.headers.get('x-forwarded-proto') ?? '-'}` +
        ` host=${req.headers.get('host') ?? '-'}`
    );
    console.log(`[proxy:headers] ${keys.join(',')}`);
  }

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch {
    // Keep proxy failures in the same normalized shape as backend errors so
    // independently rendered dashboard sections can show a useful retry state
    // instead of receiving a framework-level 500 response.
    return new Response(
      JSON.stringify({
        error: {
          code: 'BACKEND_UNAVAILABLE',
          message: 'RELIASTRA API is temporarily unavailable. Please retry.',
          details: [],
        },
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
      }
    );
  }

  // Token/org responses must be buffered so the proxy can read the body and
  // re-issue the session cookies server-side (see TOKEN_ISSUING_PATHS note).
  const shouldBuffer =
    TOKEN_ISSUING_PATHS.has(path) || ORG_ID_PATHS.has(path);
  const bufferedText = shouldBuffer ? await res.text() : null;

  const secure = isSecureRequest(req);
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[proxy:secure] path=${path} secure=${secure} fwd=${req.headers.get('x-forwarded-proto') ?? '-'} xfhost=${req.headers.get('x-forwarded-host') ?? '-'} host=${req.headers.get('host') ?? '-'}`
    );
  }

  // Return the response as-is to the client with CORS headers
  const responseHeaders = new Headers();
  responseHeaders.set('Content-Type', res.headers.get('Content-Type') || 'application/json');
  const responseRequestId = res.headers.get('X-Request-ID');
  if (responseRequestId) responseHeaders.set('X-Request-ID', responseRequestId);
  // Add CORS headers for outbound verification
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(k, v);
  }

  let out: Response;
  if (shouldBuffer) {
    out = new NextResponse(bufferedText, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } else {
    out = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  }

  // Server-side session cookie mirror — the reliable path when the preview
  // edge strips the `Authorization` / `X-Organization-ID` headers.
  if (bufferedText !== null && res.ok) {
    let data: unknown = null;
    try {
      data = JSON.parse(bufferedText);
    } catch {
      /* non-JSON body — nothing to mirror */
    }
    if (TOKEN_ISSUING_PATHS.has(path)) {
      const token = extractAccessToken(data);
      if (token) {
        (out as NextResponse).cookies.set(ACCESS_TOKEN_COOKIE, token, {
          ...sessionCookieAttrs(secure),
          maxAge: 60 * 60,
        });
      }
    }
    if (ORG_ID_PATHS.has(path)) {
      const orgId = extractOrgId(data);
      if (orgId) {
        (out as NextResponse).cookies.set(ORG_ID_COOKIE, orgId, {
          ...sessionCookieAttrs(secure),
          maxAge: 60 * 60,
        });
      }
    }
  }

  return out;
}
