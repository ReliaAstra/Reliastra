import { hostOf, isIndexableSite, SITE_URL } from '@/lib/site-url';

/**
 * Whether *this deployment* may be indexed.
 *
 * Every page on this site publishes `index, follow` and a canonical URL
 * pointing at the production origin, and the sitemap advertises the production
 * record set. That is correct for production and wrong for every other
 * deployment of the same image: a preview, a staging host, a review build and
 * a self-hosted instance all served indexable pages with production
 * canonicals, so a crawler that found one was being told to index a duplicate
 * of the real site.
 *
 * The rule itself lives in `lib/site-url.ts` (`isIndexableSite`) because
 * `next.config.ts` applies the same gate as an `X-Robots-Tag` response header
 * and cannot import app code. Configure it with:
 *
 *   NEXT_PUBLIC_SITE_INDEXABLE=true    index this deployment whatever its host
 *   NEXT_PUBLIC_SITE_INDEXABLE=false   never index this deployment
 *   (unset)                            index only the canonical production host
 *
 * `NEXT_PUBLIC_` is deliberate: the value has to reach metadata that is
 * rendered into HTML. It carries no secret.
 */

/** Evaluated once per server start; the value cannot change at runtime. */
export const SITE_INDEXABLE: boolean = isIndexableSite(SITE_URL);

/** The host this deployment believes it is, for logs and diagnostics. */
export const SITE_HOST: string | null = hostOf(SITE_URL);

/**
 * The robots directive to put in a page's metadata.
 *
 * On a non-indexable deployment every page becomes `noindex, nofollow,
 * noarchive` regardless of what it asked for. Any page that sets its own
 * robots metadata - the observatory records do, and so does every page whose
 * metadata is a static object rather than a `buildMetadata` call - must go
 * through this function, or it opts this deployment back into the index.
 */
export function robotsDirective(preferred: {
  index: boolean;
  follow: boolean;
}): { index: boolean; follow: boolean; noarchive?: boolean } {
  if (!SITE_INDEXABLE) return { index: false, follow: false, noarchive: true };
  return { index: preferred.index, follow: preferred.follow };
}
