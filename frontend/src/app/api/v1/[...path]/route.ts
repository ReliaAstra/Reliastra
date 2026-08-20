import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const joined = '/' + path.join('/');
  const noBody = req.method === 'GET' || req.method === 'HEAD';
  return proxyToBackend(joined, req, { noBody });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
