import { connection } from 'next/server';

/**
 * Mark the calling route as rendered at request time, never baked at build time.
 *
 * `next build` prerenders every route that has no request-time dependency, and
 * the build environment has no measurement API to read. For the public surfaces
 * that read it, a prerender is never harmless:
 *
 *  - Where the read throws - `/observatory`, `sitemap.xml` - it fails the build.
 *    Throwing is the intended runtime behaviour (a 5xx tells a crawler to retry
 *    and, under ISR, the last good render keeps serving), so the build must not
 *    be the place that discovers the API is missing.
 *  - Where the read is caught - the homepage index section, the research hub,
 *    `llms.txt` - the build succeeds and bakes the *failure state* into the
 *    deployment artifact. The homepage then says "the measurement API cannot be
 *    reached" to every visitor until the next deploy, and `llms.txt` hands a
 *    model a document that says the catalog could not be read. A cached lie is
 *    worse than no cache: it is served confidently, at scale, and it looks like
 *    a statement about the world rather than about one build.
 *
 * `connection()` is the documented way to stop prerendering at a given line
 * without using a request-time API like `headers()` or `cookies()`, neither of
 * which these routes have any business reading.
 *
 * It is deliberately **not** `export const dynamic = 'force-dynamic'`. That
 * would also stop prerendering, but Next defines it as setting
 * `{ cache: 'no-store', next: { revalidate: 0 } }` on every fetch in the route -
 * it would discard the Data Cache these routes depend on and put the whole
 * upstream fan-out (a catalog walk, and for a record page up to five more reads)
 * back on every request path. Caching for these surfaces lives one layer down,
 * on the reads themselves: see `CACHE POLICIES` in `lib/track-api.ts`.
 *
 * Wrap it rather than calling `connection()` inline so this reasoning has one
 * home and the five routes that need it cannot drift apart. Next resolves the
 * signal at runtime, so the indirection is visible to it.
 */
export async function renderAtRequestTime(): Promise<void> {
  await connection();
}
