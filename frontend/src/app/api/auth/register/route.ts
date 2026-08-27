import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

/**
 * Signup proxy. The partner signup form posts to `/api/auth/register`, so this
 * route must exist alongside the `/api/auth/signup` alias — both forward to the
 * backend's `POST /v1/auth/register`.
 */
export async function POST(req: NextRequest) {
  return proxyToBackend('/auth/register', req);
}

export async function OPTIONS(req: NextRequest) {
  return proxyToBackend('/auth/register', req);
}
