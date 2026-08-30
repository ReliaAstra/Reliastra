import { NextRequest, NextResponse } from 'next/server';
import {
  handleAdminLogin,
  handleAdminLogout,
  handleAdminRefresh,
  proxyAdminToBackend,
} from '@/lib/admin-backend-proxy';

export const runtime = 'nodejs';

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

  const requestId = req.headers.get('x-request-id');

  // Dedicated admin authentication endpoints. `/auth/login` is the only
  // endpoint that works without an existing admin session — it exchanges the
  // operator credentials for HttpOnly admin cookies (the raw tokens never
  // reach the browser). Everything else is handled by the cookie-gated proxy.
  const authPath = path.join('/');

  if (req.method === 'POST' && authPath === 'auth/login') {
    return handleAdminLogin(req, requestId);
  }
  if (req.method === 'POST' && authPath === 'auth/logout') {
    return handleAdminLogout(req);
  }
  if (req.method === 'POST' && authPath === 'auth/refresh') {
    // Explicit refresh is available for completeness; the proxy also rotates
    // transparently. The refresh token is read from the HttpOnly cookie.
    return handleAdminRefresh(req);
  }

  const query = new URL(req.url).searchParams.toString();
  return proxyAdminToBackend(`/admin/${safePath}${query ? `?${query}` : ''}`, req);
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
