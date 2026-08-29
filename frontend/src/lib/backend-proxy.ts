const BACKEND_URL =
  process.env.RELIASTRA_API_URL?.replace(/\/$/, '') ||
  'https://api.reliastra.com';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Organization-ID, Reliastra-Organization, X-Request-ID, Idempotency-Key, X-Requested-With',
  'Access-Control-Allow-Credentials': 'true',
};

export async function proxyToBackend(
  path: string,
  req: Request,
  options?: {
    /** Override the HTTP method */
    method?: string;
    /** Omit the request body (e.g. for GET) */
    noBody?: boolean;
  }
): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  const incoming = new URL(req.url);
  const url = `${BACKEND_URL}/v1${path}${incoming.search}`;
  const method = options?.method || req.method;

  const headers: Record<string, string> = {};

  // Forward authorization and request-tracing / idempotency context.
  const authHeader = req.headers.get('authorization');
  if (authHeader) headers['Authorization'] = authHeader;
  const requestId = req.headers.get('x-request-id');
  if (requestId) headers['X-Request-ID'] = requestId;
  const idempotencyKey = req.headers.get('idempotency-key');
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  // Tenant context must be forwarded on EVERY method: the backend resolves
  // the organization exclusively via these headers, and org-scoped GETs
  // (dependencies, incidents, dashboard, ...) fail without them.
  for (const name of ['x-organization-id', 'reliastra-organization']) {
    const value = req.headers.get(name);
    if (value) {
      headers[name.toLowerCase() === 'x-organization-id' ? 'X-Organization-ID' : 'Reliastra-Organization'] = value;
    }
  }

  // Forward content-type for requests with body
  if (!options?.noBody && method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    // 30s hard timeout so a hung upstream never leaves the UI in a
    // skeleton forever; the proxy returns a structured 502 the UI can retry.
    signal: AbortSignal.timeout(30_000),
  };

  if (!options?.noBody && method !== 'GET' && method !== 'HEAD') {
    fetchOptions.body = await req.text();
  }

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch {
    // Keep proxy failures in the same normalized shape as backend errors so
    // independently rendered dashboard sections can show a useful retry state
    // instead of receiving a framework-level 500 response.
    return new Response(
      JSON.stringify({
        error: {
          code: 'BACKEND_UNAVAILABLE',
          message: 'RELIASTRA API is temporarily unavailable. Please retry.',
          details: [],
        },
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
      }
    );
  }

  // Return the response as-is to the client with CORS headers
  const responseHeaders = new Headers();
  responseHeaders.set('Content-Type', res.headers.get('Content-Type') || 'application/json');
  const responseRequestId = res.headers.get('X-Request-ID');
  if (responseRequestId) responseHeaders.set('X-Request-ID', responseRequestId);
  // Add CORS headers for outbound verification
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(k, v);
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}
