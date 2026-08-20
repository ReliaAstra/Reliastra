import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyAdminRequest(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;

  // Keep this proxy deliberately scoped to the backend's `/v1/admin/*`
  // namespace. Route segments are encoded before being forwarded so a browser
  // cannot use the catch-all handler to escape into a different backend path.
  const safePath = path
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  if (!safePath) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'An admin API path is required.' } },
      { status: 400 }
    );
  }

  const query = new URL(req.url).searchParams.toString();
  return proxyToBackend(`/admin/${safePath}${query ? `?${query}` : ''}`, req);
}

export async function GET(req: NextRequest, context: RouteContext) {
  return proxyAdminRequest(req, context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  return proxyAdminRequest(req, context);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return proxyAdminRequest(req, context);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  return proxyAdminRequest(req, context);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return proxyAdminRequest(req, context);
}
