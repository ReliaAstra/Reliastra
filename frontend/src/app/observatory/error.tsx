'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { PUBLIC_ROUTES } from '@/lib/routes';

/**
 * Index-level error boundary for `/observatory`.
 *
 * It exists because the index now throws when the catalog cannot be read, and
 * throwing is deliberate: this boundary turns that into a 5xx, which is the
 * only response that tells a crawler "come back later", and under ISR the last
 * good render keeps serving while the failure is logged. The alternative -
 * rendering an empty index at 200 - publishes the false statement that the
 * observatory has no dependencies, on a page that is canonical, sitemap-listed
 * and `index, follow`.
 *
 * The one thing this must never do is look like a populated index. No counts,
 * no rows, no state words: nothing here may be read as a measurement.
 */
export default function ObservatoryIndexError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Digest only: never log a token, a URL with credentials, or the raw error
    // object from a public page.
    console.error('Observatory index failed to render', error.digest ?? '');
  }, [error]);

  return (
    <div className="ob obs min-h-[70vh] bg-[var(--ob-void)]">
      <div className="ob-container py-20 md:py-28">
        <p className="ob-label obs-label-crit">Catalog unavailable</p>
        <h1 className="ob-h1 mt-5 max-w-[22ch]">The dependency index could not be read.</h1>
        <p className="ob-lede mt-6 max-w-[62ch]">
          RELIASTRA could not retrieve the list of dependencies under observation, so this index
          is not publishing one. No cached list and no partial list is shown in its place: an
          index that quietly drops records reads as a withdrawal, and a count of zero would be a
          claim about the observatory that nothing here measured.
        </p>
        <p className="ob-body mt-6 max-w-[62ch]">
          Individual records may still render from their own last successful read. This is a
          failure to read RELIASTRA&apos;s own catalog, not a report about any vendor.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="ob-btn ob-btn-signal">
            Retry the catalog
          </button>
          <Link href={PUBLIC_ROUTES.status} className="ob-btn ob-btn-outline">
            RELIASTRA platform status
          </Link>
          <Link href={PUBLIC_ROUTES.home} className="ob-btn ob-btn-outline">
            Home
          </Link>
        </div>
        {error.digest && <p className="ob-small mt-10">Reference {error.digest}</p>}
      </div>
    </div>
  );
}
