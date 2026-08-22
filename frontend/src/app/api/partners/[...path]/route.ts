import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

/**
 * Catch-all proxy for the backend's `/v1/partners/*` namespace.
 *
 * The partner dashboard grew a number of endpoints (notifications, preferences,
 * the support desk) and a hand-written route file per path is pure overhead.
 * Static sibling routes (e.g. `/api/partners/dashboard`) still take precedence
 * over this catch-all; anything else lands here. Segments are encoded before
 * forwarding so a browser cannot escape the `/v1/partners` namespace.
 */
async function proxyPartnerRequest(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;

  const safePath = path
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  if (!safePath) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'A partner API path is required.' } },
      { status: 400 }
    );
  }

  return proxyToBackend(`/partners/${safePath}`, req);
}

export async function GET(req: NextRequest, context: RouteContext) {
  return proxyPartnerRequest(req, context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  return proxyPartnerRequest(req, context);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  return proxyPartnerRequest(req, context);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return proxyPartnerRequest(req, context);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return proxyPartnerRequest(req, context);
}
