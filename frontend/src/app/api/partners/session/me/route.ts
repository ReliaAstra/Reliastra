import { proxyToBackend } from '@/lib/backend-proxy';
export async function GET(req: Request) { return proxyToBackend('/users/me', req, { noBody: true, session: 'partner' }); }
