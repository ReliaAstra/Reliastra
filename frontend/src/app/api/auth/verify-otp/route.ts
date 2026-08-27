import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

/** Submit the 6-digit signup code. Returns the session on success. */
export async function POST(req: NextRequest) {
  return proxyToBackend('/auth/verify-otp', req);
}

export async function OPTIONS(req: NextRequest) {
  return proxyToBackend('/auth/verify-otp', req);
}
