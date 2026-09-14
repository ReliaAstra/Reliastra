import type { NextRequest } from 'next/server';

import { ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE } from '@/lib/admin-session-cookie';
import { verifyAdminToken } from '@/lib/admin-token-verify';
import {
  ANALYTICS_OPT_OUT_COOKIE,
  isInternalSurfacePath,
} from '@/lib/analytics-scope';

/** Path of the page beacon inside the `/api/v1/*` proxy. */
export const VISIT_ANALYTICS_PATH = '/public/analytics/visit';

export type VisitVerdict =
  | { action: 'forward' }
  | { action: 'drop'; reason: 'admin-session' | 'opt-out' | 'internal-path' };

/**
 * Server-side half of the self-exclusion for page views.
 *
 * The beacon in `components/analytics/visit-beacon.tsx` already declines to
 * report internal surfaces and opted-out browsers. That is not enough on its
 * own, for one specific reason: the admin session is an HttpOnly cookie, so
 * browser code cannot see it, and `/api/v1/*` forwards a small allowlist of
 * headers rather than the whole request - the backend never learns who the
 * visitor was. This module reads the cookies at the edge, where they exist,
 * and answers the only question that matters: should this visit reach
 * `an:pv:*` at all?
 *
 * Dropping here rather than filtering later means an admin's page views never
 * enter the counter, so they cannot skew a number that has to be retroactively
 * discounted.
 */
export function decideVisitRequest(req: NextRequest, path: string): VisitVerdict {
  if (path !== VISIT_ANALYTICS_PATH) return { action: 'forward' };

  const reported = req.nextUrl.searchParams.get('path');
  if (isInternalSurfacePath(reported)) return { action: 'drop', reason: 'internal-path' };

  const optOut = (req.cookies.get(ANALYTICS_OPT_OUT_COOKIE)?.value ?? '').trim().toLowerCase();
  if (optOut === '1' || optOut === 'true') return { action: 'drop', reason: 'opt-out' };

  // A verified admin session. Verification (not mere presence) is deliberate:
  // the exclusion is only trustworthy if a forged cookie cannot buy it, and an
  // expired-but-valid refresh cookie still means "this is the team".
  const access = req.cookies.get(ADMIN_ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(ADMIN_REFRESH_COOKIE)?.value;
  if (
    verifyAdminToken(access, 'admin_access') ||
    verifyAdminToken(refresh, 'admin_refresh')
  ) {
    return { action: 'drop', reason: 'admin-session' };
  }

  return { action: 'forward' };
}

/** Response a dropped beacon gets: identical to a recorded one from the browser's side. */
export function visitDroppedResponse(reason: string): Response {
  return new Response(null, {
    status: 204,
    headers: { 'X-Reliastra-Analytics': `excluded:${reason}` },
  });
}
