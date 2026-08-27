import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

/**
 * Complete a password reset with the token from the reset email.
 * `partner-api.resetPassword()` already called this path — the route was
 * missing, so every reset attempt hit a 404.
 */
export async function POST(req: NextRequest) {
  return proxyToBackend('/auth/reset-password', req);
}

export async function OPTIONS(req: NextRequest) {
  return proxyToBackend('/auth/reset-password', req);
}
