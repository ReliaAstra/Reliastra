'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { PUBLIC_ROUTES } from '@/lib/routes';

/**
 * Record-level error boundary.
 *
 * The one thing it must never do is degrade into something that looks like a
 * healthy record. No figures, no state word, no chart frame - a headline that
 * says the observation could not be read, and a retry that re-runs the server
 * render.
 */
export default function VendorRecordError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Digest only: never log a token, a URL with credentials, or the raw error
    // object from a public page.
    console.error('Observatory record failed to render', error.digest ?? '');
  }, [error]);

  return (
    <div className="ob obs min-h-[70vh] bg-[var(--ob-void)]">
      <div className="ob-container py-20 md:py-28">
        <p className="ob-label obs-label-crit">Observation unavailable</p>
        <h1 className="ob-h1 mt-5 max-w-[22ch]">This record could not be rendered.</h1>
        <p className="ob-lede mt-6 max-w-[62ch]">
          The measurement data for this dependency was not returned in a form this page can
          publish. Nothing is shown in its place: a reliability record that fills gaps with
          plausible values is worse than one that stops.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="ob-btn ob-btn-signal">
            Retry the observation
          </button>
          <Link href={PUBLIC_ROUTES.track} className="ob-btn ob-btn-outline">
            All tracked dependencies
          </Link>
          <Link href={PUBLIC_ROUTES.status} className="ob-btn ob-btn-outline">
            RELIASTRA platform status
          </Link>
        </div>
        {error.digest && (
          <p className="ob-small mt-10">Reference {error.digest}</p>
        )}
      </div>
    </div>
  );
}
