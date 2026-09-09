import { NextRequest } from 'next/server';
import { handlePartnerReferralRequest } from '@/lib/partner-referral-http';

/**
 * Canonical partner referral URL: `https://reliastra.com/r/{code}`.
 *
 * Production Caddy sends `/r/*` to Next.js (the public site). This route is
 * the resolver that was missing — without it, every partner link rendered
 * the generic HTTP 404 "Signal lost" page.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  _ctx: { params: Promise<{ code: string }> }
) {
  return handlePartnerReferralRequest(request);
}

export async function HEAD(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) {
  const response = await GET(request, ctx);
  return new Response(null, { status: response.status, headers: response.headers });
}
