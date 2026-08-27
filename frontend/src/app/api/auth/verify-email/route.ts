import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

/** Verify an email using the token from a magic-link email. */
export async function POST(req: NextRequest) {
  return proxyToBackend('/auth/verify-email', req);
}

export async function OPTIONS(req: NextRequest) {
  return proxyToBackend('/auth/verify-email', req);
}
