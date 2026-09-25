import { afterEach, describe, expect, it, vi } from 'vitest';

import { readCategories, readCategory } from '@/lib/track-api';

/**
 * The category read contract, mirroring the vendor record contract: the
 * taxonomy reader must keep "the API said this category does not exist",
 * "the API answered" and "the API did not answer" as three distinguishable
 * outcomes, because the URL segment resolver turns them into 404, render
 * and 5xx respectively.
 */

const CATEGORY_LIST = {
  categories: [
    {
      slug: 'payments',
      name: 'Payments',
      description: 'Payment processors and billing platforms.',
      display_order: 20,
      vendor_count: 5,
    },
  ],
};

const CATEGORY_DETAIL = {
  ...CATEGORY_LIST.categories[0],
  vendors: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : String(input.url);
      return handler(url);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('category reads', () => {
  it('returns ok with the taxonomy when the API answers', async () => {
    stubFetch(() => jsonResponse(CATEGORY_LIST));
    const read = await readCategories();
    expect(read.kind).toBe('ok');
    if (read.kind === 'ok') {
      expect(read.value.categories[0].slug).toBe('payments');
      expect(read.value.categories[0].vendor_count).toBe(5);
    }
  });

  it('returns ok with the category detail at the expected path', async () => {
    let requested = '';
    stubFetch((url) => {
      requested = url;
      return jsonResponse(CATEGORY_DETAIL);
    });
    const read = await readCategory('Payments');
    expect(read.kind).toBe('ok');
    // Slugs are lowercased and at the literal categories route, not the
    // vendor route: /v1/vendors/categories/payments.
    expect(requested).toContain('/v1/vendors/categories/payments');
    if (read.kind === 'ok') expect(read.value.slug).toBe('payments');
  });

  it('distinguishes a definite 404 as missing, not unreadable', async () => {
    stubFetch(() => jsonResponse({ detail: 'not found' }, 404));
    const read = await readCategory('ai');
    expect(read.kind).toBe('missing');
  });

  it('distinguishes a dead upstream as unreadable, not missing', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    const read = await readCategories();
    expect(read.kind).toBe('unreadable');
  });

  it('distinguishes a 5xx upstream as unreadable, not missing', async () => {
    stubFetch(() => jsonResponse({ detail: 'boom' }, 500));
    const read = await readCategory('payments');
    expect(read.kind).toBe('unreadable');
  });
});
