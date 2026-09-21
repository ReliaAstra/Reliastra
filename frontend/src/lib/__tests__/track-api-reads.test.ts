import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchTrackedVendorsAll,
  fetchVendorRecord,
  readCatalog,
  readCatalogForDiscovery,
  readVendorDetail,
  readVendorRecord,
  resetDiscoveryCatalog,
  RecordUnreadableError,
  TrackApiError,
  type RecordRead,
} from '@/lib/track-api';

/**
 * The read contract every public observatory page depends on.
 *
 * The defect these tests exist to prevent is a single collapsed distinction:
 * "the API said this record does not exist" and "the API did not answer" used
 * to produce the same value, so one transient failure emitted `noindex` on a
 * canonical, sitemap-listed record and served it at HTTP 200 with no data on
 * it. A crawler cannot unlearn either of those.
 */

const VENDOR_DETAIL = {
  id: 'b1f0a5c2-0000-4000-8000-000000000001',
  vendor_name: 'openai',
  display_name: 'OpenAI',
  category: 'ai',
  is_public: true,
  recent_status: 'operational',
  latency_ms: 120,
  status_code: 200,
  last_check_at: '2026-09-20T12:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-09-20T12:00:00Z',
  endpoints: [
    {
      id: 'e1',
      endpoint_url: 'https://status.openai.com',
      regions: ['us-east'],
      health_status: 'healthy',
      is_active: true,
      last_check_at: '2026-09-20T12:00:00Z',
    },
  ],
};

const CATALOG_PAGE = {
  items: [VENDOR_DETAIL],
  next_cursor: null,
  has_more: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Record every fetch so the transport options can be asserted, not assumed. */
let calls: Array<{ url: string; init: RequestInit }> = [];

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  calls = [];
  const fetchMock = vi.fn(async (input: any, init: any = {}) => {
    const url = typeof input === 'string' ? input : String(input.url);
    calls.push({ url, init });
    return handler(url, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  resetDiscoveryCatalog();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('a read states which of three things happened', () => {
  it('reports ok when the API answers', async () => {
    stubFetch(() => jsonResponse(VENDOR_DETAIL));

    const read = await readVendorDetail('openai');

    expect(read.kind).toBe('ok');
    if (read.kind === 'ok') expect(read.value.display_name).toBe('OpenAI');
  });

  it('reports missing only on a 404', async () => {
    stubFetch(() => jsonResponse({ detail: 'not found' }, 404));

    expect(await readVendorDetail('nope')).toEqual({ kind: 'missing' });
  });

  it.each([500, 502, 503, 504])(
    'reports unreadable, not missing, on a %i',
    async (status) => {
      stubFetch(() => jsonResponse({ detail: 'upstream' }, status));

      const read = await readVendorDetail('openai');

      expect(read).toEqual({ kind: 'unreadable', reason: 'http' });
    }
  );

  it('reports unreadable on a 429 - being throttled is not being absent', async () => {
    // This is the case that made the site withdraw its own records: the public
    // vendor budget is shared, so a busy crawler could 429 the server's own
    // read of a record that exists.
    stubFetch(() => jsonResponse({ detail: 'rate limited' }, 429));

    expect(await readVendorDetail('openai')).toEqual({
      kind: 'unreadable',
      reason: 'http',
    });
  });

  it('reports unreadable on a timeout', async () => {
    stubFetch(() => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      });
    });

    expect(await readVendorDetail('openai')).toEqual({
      kind: 'unreadable',
      reason: 'timeout',
    });
  });

  it('reports unreadable when the connection fails', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });

    expect(await readVendorDetail('openai')).toEqual({
      kind: 'unreadable',
      reason: 'network',
    });
  });

  it('reports unreadable when a 200 carries a body that is not JSON', async () => {
    stubFetch(
      () =>
        new Response('<html>gateway</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
    );

    expect(await readVendorDetail('openai')).toEqual({
      kind: 'unreadable',
      reason: 'malformed',
    });
  });

  it('propagates the detail read through the whole record', async () => {
    stubFetch((url) =>
      url.includes('/incidents/public') || url.includes('/metrics') || url.includes('/timeline')
        ? jsonResponse([])
        : jsonResponse({ detail: 'nope' }, 404)
    );

    const read = await readVendorRecord('nope');

    expect(read).toEqual({ kind: 'missing' });
  });

  it('throws a RecordUnreadableError, never a 404, from the legacy wrapper', async () => {
    /**
     * Both the wrapper and the error class come from the static import, on
     * purpose. The `afterEach` resets the module registry, so a dynamic
     * `await import()` here would return a second instance of the module whose
     * `RecordUnreadableError` is a different class object - and `instanceof`
     * against the imported one would fail while the behaviour was correct.
     */
    stubFetch(() => jsonResponse({ detail: 'upstream' }, 503));

    await expect(fetchVendorRecord('openai')).rejects.toBeInstanceOf(RecordUnreadableError);
  });
});

describe('the transport is cacheable and bounded', () => {
  it('never opts out of caching on a public read', async () => {
    stubFetch(() => jsonResponse(VENDOR_DETAIL));

    await readVendorDetail('openai');

    expect(calls).toHaveLength(1);
    const init = calls[0].init as Record<string, unknown>;
    // A single `no-store` fetch forces the whole route to render dynamically,
    // which makes the pages' `export const revalidate` inert and sends every
    // crawler hit straight through to the API.
    expect(init.cache).toBeUndefined();
    const next = init.next as { revalidate?: number; tags?: string[] } | undefined;
    expect(next?.revalidate).toBeGreaterThan(0);
    expect(next?.tags).toContain('observatory');
    expect(next?.tags?.some((tag) => tag.startsWith('vendor:openai'))).toBe(true);
  });

  it('contains no cache opt-out anywhere in the module source', () => {
    const source = readFileSync(resolve(__dirname, '../track-api.ts'), 'utf8');
    expect(source).not.toMatch(/cache:\s*['"]no-store['"]/);
    expect(source).not.toMatch(/cache:\s*['"]no-cache['"]/);
  });

  it('aborts a hung upstream instead of waiting on it', async () => {
    stubFetch(() => jsonResponse(VENDOR_DETAIL));

    await readVendorDetail('openai');

    const signal = (calls[0].init as RequestInit).signal;
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('presents the reader token when one is configured', async () => {
    vi.resetModules();
    vi.stubEnv('RELIASTRA_READER_TOKEN', 'reader-secret');
    const module = await import('@/lib/track-api');
    stubFetch(() => jsonResponse(VENDOR_DETAIL));

    await module.readVendorDetail('openai');

    const headers = (calls[0].init as RequestInit).headers as Record<string, string>;
    expect(headers['x-reliastra-reader']).toBe('reader-secret');
  });

  it('sends no reader header when none is configured', async () => {
    stubFetch(() => jsonResponse(VENDOR_DETAIL));

    await readVendorDetail('openai');

    const headers = (calls[0].init as RequestInit).headers as Record<string, string>;
    expect(headers['x-reliastra-reader']).toBeUndefined();
  });
});

describe('the record composition does not spend calls it cannot use', () => {
  it('never requests the public /incidents endpoint, which is empty by design', async () => {
    stubFetch((url) => {
      if (url.endsWith('/vendors/openai')) return jsonResponse(VENDOR_DETAIL);
      if (url.includes('/metrics')) return jsonResponse({ vendor_name: 'openai', metrics: {} });
      if (url.includes('/incidents/public')) return jsonResponse([]);
      if (url.includes('/timeline')) {
        return jsonResponse({
          vendor_name: 'openai',
          window: '1h',
          resolution: '1m',
          region: 'us-east',
          from: '2026-09-20T11:00:00Z',
          to: '2026-09-20T12:00:00Z',
          current: { timestamp: '2026-09-20T12:00:00Z', latency_ms: 1, status_code: 200, is_up: true },
          points: [],
        });
      }
      return jsonResponse({}, 404);
    });

    const read: RecordRead<unknown> = await readVendorRecord('openai');

    expect(read.kind).toBe('ok');
    // `/vendors/{name}/incidents` returns `[]` unconditionally in the backend,
    // so requesting it only consumed budget from a limiter every reader shares.
    expect(calls.some((c) => /\/vendors\/openai\/incidents(\?|$)/.test(c.url))).toBe(false);
    expect(calls.some((c) => c.url.includes('/incidents/public'))).toBe(true);
  });
});

describe('catalog discovery walks every page instead of truncating', () => {
  it('follows cursors to the end of the catalog', async () => {
    const second = { ...VENDOR_DETAIL, vendor_name: 'anthropic', display_name: 'Anthropic' };
    stubFetch((url) => {
      if (url.includes('cursor=')) {
        return jsonResponse({ items: [second], next_cursor: null, has_more: false });
      }
      return jsonResponse({ items: [VENDOR_DETAIL], next_cursor: 'abc', has_more: true });
    });

    const items = await fetchTrackedVendorsAll({ pageSize: 1 });

    expect(items.map((i) => i.vendor_name)).toEqual(['openai', 'anthropic']);
    expect(calls).toHaveLength(2);
  });

  it('stops when a cursor stops advancing', async () => {
    // A backend that returns the same cursor forever must not loop the sitemap.
    stubFetch(() => jsonResponse({ items: [VENDOR_DETAIL], next_cursor: 'same', has_more: true }));

    const items = await fetchTrackedVendorsAll({ pageSize: 1, maxPages: 3 });

    expect(calls).toHaveLength(2); // page 1, then the repeat of the same cursor
    expect(items).toHaveLength(1);
  });

  it('reports an unreadable catalog as unreadable', async () => {
    stubFetch(() => jsonResponse({ detail: 'upstream' }, 503));

    expect(await readCatalog()).toEqual({ kind: 'unreadable', reason: 'http' });
  });
});

describe('a failed catalog read does not withdraw every record URL', () => {
  it('serves the last good list, marked stale, after a failure', async () => {
    let fail = false;
    stubFetch(() => (fail ? jsonResponse({ detail: 'upstream' }, 503) : jsonResponse(CATALOG_PAGE)));

    const first = await readCatalogForDiscovery();
    expect(first.stale).toBe(false);
    expect(first.vendors).toHaveLength(1);

    fail = true;
    const second = await readCatalogForDiscovery();

    expect(second.stale).toBe(true);
    expect(second.vendors).toHaveLength(1);
    expect(second.readAt).toBeInstanceOf(Date);
  });

  it('throws when there is no last good list to fall back to', async () => {
    // Cold process plus a dead API: the sitemap must fail loudly rather than
    // publish a document that silently omits every dependency record.
    stubFetch(() => jsonResponse({ detail: 'upstream' }, 503));

    await expect(readCatalogForDiscovery()).rejects.toBeInstanceOf(TrackApiError);
  });

  it('replaces the last good list once the catalog is readable again', async () => {
    const anthropic = { ...VENDOR_DETAIL, vendor_name: 'anthropic', display_name: 'Anthropic' };
    // One catalog, then an outage, then a different catalog: the stale copy
    // must not outlive the recovery.
    const responses: Array<() => Response> = [
      () => jsonResponse({ items: [VENDOR_DETAIL], next_cursor: null, has_more: false }),
      () => jsonResponse({ detail: 'upstream' }, 503),
      () => jsonResponse({ items: [anthropic], next_cursor: null, has_more: false }),
    ];
    let call = 0;
    stubFetch(() => responses[Math.min(call++, responses.length - 1)]());

    expect((await readCatalogForDiscovery()).vendors.map((v) => v.vendor_name)).toEqual(['openai']);

    const stale = await readCatalogForDiscovery();
    expect(stale.stale).toBe(true);
    expect(stale.vendors.map((v) => v.vendor_name)).toEqual(['openai']);

    const recovered = await readCatalogForDiscovery();
    expect(recovered.stale).toBe(false);
    expect(recovered.vendors.map((v) => v.vendor_name)).toEqual(['anthropic']);
  });
});
