import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

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

  const noBody = req.method === 'GET' || req.method === 'HEAD';
  return proxyToBackend(joined, req, { noBody });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
