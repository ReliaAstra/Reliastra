import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';
import { decideVisitRequest, visitDroppedResponse } from '@/lib/analytics-gate';

async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const joined = '/' + path.join('/');

  // Defense in depth: the admin control plane is ONLY reachable through the
  // dedicated `/api/admin/*` cookie-gated proxy. This generic `v1` catch-all
  // (used by customer/partner surfaces) must never forward into `/v1/admin`.
  if (path[0]?.toLowerCase() === 'admin') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Admin API is not available on this surface.' } },
      { status: 403 }
    );
  }

  // The page beacon is the one call here that must not be forwarded blindly:
  // it is the sole source of the admin "Pageviews" counter, and the team's own
  // browsing has to stay out of it. See lib/analytics-gate.ts for why this
  // decision lives at the edge instead of in the browser or in the backend.
  const verdict = decideVisitRequest(req, joined);
  if (verdict.action === 'drop') {
    return visitDroppedResponse(verdict.reason);
  }

  const noBody = req.method === 'GET' || req.method === 'HEAD';
  return proxyToBackend(joined, req, { noBody });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
