import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

/** Request a fresh signup code (throttled per IP and per account). */
export async function POST(req: NextRequest) {
  return proxyToBackend('/auth/resend-otp', req);
}

export async function OPTIONS(req: NextRequest) {
  return proxyToBackend('/auth/resend-otp', req);
}
