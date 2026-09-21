/**
 * The canonical origin of this site, and the rule that decides whether a given
 * origin may be indexed. Both live here because this module has no imports:
 * `lib/seo.ts`, `lib/indexability.ts` and `next.config.ts` all need them, and
 * a cycle between any two of those would leave one reading an uninitialised
 * binding.
 */
export const SITE_URL: string = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reliastra.com'
).replace(/\/$/, '');

/**
 * Hosts that are the canonical production site.
 *
 * MUST match the list inlined in `next.config.ts` (which cannot import app
 * code); `src/lib/__tests__/indexability.test.ts` asserts that it does.
 */
export const PRODUCTION_HOSTS: ReadonlySet<string> = new Set([
  'reliastra.com',
  'www.reliastra.com',
]);

/** The host part of a site URL, or `null` when it does not parse. */
export function hostOf(siteUrl: string): string | null {
  try {
    return new URL(siteUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Whether a deployment at `siteUrl` may be indexed.
 *
 * Indexable by default only on the canonical production host, because every
 * page publishes a canonical URL pointing there: indexing a preview, staging
 * or self-hosted origin publishes duplicates of the same dependency records
 * and splits the signal the real ones need. An explicit override exists
 * because a self-hosted deployment on its own domain is a legitimate thing to
 * want indexed, and because a staging host must be able to force itself off
 * even if someone points it at the production hostname.
 *
 * @param override the raw `NEXT_PUBLIC_SITE_INDEXABLE` value, if set.
 */
export function isIndexableSite(
  siteUrl: string = SITE_URL,
  override: string | undefined = process.env.NEXT_PUBLIC_SITE_INDEXABLE
): boolean {
  if (override === 'true') return true;
  if (override === 'false') return false;
  const host = hostOf(siteUrl);
  return host !== null && PRODUCTION_HOSTS.has(host);
}
