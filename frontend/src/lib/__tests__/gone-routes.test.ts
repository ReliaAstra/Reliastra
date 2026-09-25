import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GONE_ROUTES } from '@/lib/routes';

/**
 * Retired-with-410 URLs keep their promise.
 *
 * `GONE_ROUTES` is the single table of URLs that are permanently gone with no
 * replacement. This test pins it to the served behavior in two ways:
 *
 *  1. Every entry has a `route.ts` handler at its path (so the table cannot
 *     list a URL that silently 404s instead of 410ing).
 *  2. The handler actually returns 410 with a `noindex` directive, so a crawler
 *     is told - at the transport layer, not just in the body - to drop it.
 *
 * A 410 that is only a 404, or a 410 that omits the noindex header, is the
 * drift this exists to catch: the first re-adds a soft-404, the second leaves a
 * retired URL eligible to be re-indexed from a cached copy.
 */
describe('gone routes', () => {
  it('retires /agencies (old agency/MSP positioning) with no replacement', () => {
    expect(Object.values(GONE_ROUTES)).toContain('/agencies');
  });

  it('backs every gone route with a route.ts handler', () => {
    for (const path of Object.values(GONE_ROUTES)) {
      const handler = join(process.cwd(), 'src/app', path, 'route.ts');
      expect(existsSync(handler), `${path} needs a route.ts returning 410`).toBe(true);
    }
  });

  it('serves /agencies as 410 with noindex', async () => {
    const { GET } = await import('@/app/agencies/route');
    const res = await GET();
    expect(res.status).toBe(410);
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
  });
});
