/**
 * Server-only partner-referral resolver.
 *
 * `GET /r/{code}` is the public URL partners share. This module:
 *   1. validates the code shape;
 *   2. asks `GET /v1/public/referral/{code}` to count the click and confirm
 *      the partner can earn;
 *   3. writes the 90-day first-party cookies;
 *   4. 302s into the signup/landing flow.
 *
 * Invalid or expired codes never render the generic 404. They land on
 * `/referral-unavailable`.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  REFERRAL_COOKIE,
  REFERRAL_DEFAULT_DESTINATION,
  REFERRAL_PUBLIC_COOKIE,
  REFERRAL_UNAVAILABLE_PATH,
  backendApiOrigin,
  normalizeReferralCode,
  referralCookieAttrs,
  safeReferralDestination,
} from '@/lib/partner-referral';

const UNAVAILABLE = REFERRAL_UNAVAILABLE_PATH;

export function requestIsSecure(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function codeFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/r\/([^/]+)\/?$/);
  if (!match) return null;
  return normalizeReferralCode(match[1]);
}

function attachReferralCookies(
  response: NextResponse,
  code: string,
  secure: boolean
): void {
  const attrs = referralCookieAttrs(secure);
  response.cookies.set(REFERRAL_COOKIE, code, {
    ...attrs,
    httpOnly: true,
  });
  response.cookies.set(REFERRAL_PUBLIC_COOKIE, code, {
    ...attrs,
    httpOnly: false,
  });
}

function redirectToUnavailable(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = UNAVAILABLE;
  url.search = '';
  const response = NextResponse.redirect(url, 302);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return response;
}

function landingUrl(
  request: NextRequest,
  destination: string,
  code: string
): URL {
  const url = request.nextUrl.clone();
  const dest = new URL(destination, url.origin);

  url.pathname = dest.pathname || REFERRAL_DEFAULT_DESTINATION;
  url.hash = dest.hash;

  const params = new URLSearchParams(dest.search);
  // Preserve campaign/UTM params from the original `/r/{code}` hit so
  // first-touch acquisition still fires after the redirect.
  request.nextUrl.searchParams.forEach((value, key) => {
    if (key === 'to' || key === 'ref') return;
    if (!params.has(key)) params.set(key, value);
  });
  if (!params.has('ref')) params.set('ref', code);
  url.search = params.toString() ? `?${params.toString()}` : '';
  return url;
}

interface ResolveBody {
  valid?: boolean;
  referral_code?: string | null;
  destination?: string;
}

async function resolveAgainstBackend(
  code: string,
  to: string | null
): Promise<ResolveBody | null> {
  const origin = backendApiOrigin();
  const target = new URL(`${origin}/v1/public/referral/${encodeURIComponent(code)}`);
  if (to) target.searchParams.set('to', to);
  try {
    const res = await fetch(target.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as ResolveBody | null;
  } catch {
    return null;
  }
}

/**
 * Handle `GET /r` and `GET /r/{code}`.
 *
 * Fail-open on a well-formed code when the API is unreachable: still set the
 * cookie and send the visitor into the landing flow. Signup `bind_referral`
 * is what actually attributes, and a dead API must not 404 a partner's
 * campaign. A backend `valid: false` is authoritative and does not set a cookie.
 */
export async function handlePartnerReferralRequest(
  request: NextRequest
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const noStore = {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };

  if (pathname === '/r' || pathname === '/r/') {
    const response = redirectToUnavailable(request);
    for (const [k, v] of Object.entries(noStore)) response.headers.set(k, v);
    return response;
  }

  const code = codeFromPath(pathname);
  if (!code) {
    return redirectToUnavailable(request);
  }

  const requestedTo = request.nextUrl.searchParams.get('to');
  const resolved = await resolveAgainstBackend(code, requestedTo);
  const secure = requestIsSecure(request);

  if (resolved && resolved.valid === false) {
    return redirectToUnavailable(request);
  }

  const canonical =
    normalizeReferralCode(resolved?.referral_code) ?? code;
  const destination = safeReferralDestination(
    resolved?.destination ?? requestedTo,
    REFERRAL_DEFAULT_DESTINATION
  );

  const response = NextResponse.redirect(
    landingUrl(request, destination, canonical),
    302
  );
  attachReferralCookies(response, canonical, secure);
  for (const [k, v] of Object.entries(noStore)) response.headers.set(k, v);
  return response;
}
