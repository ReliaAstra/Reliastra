'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Route-level failure.
 *
 * Technical, specific and actionable - and deliberately free of the backend's
 * own message, which can carry internal detail a customer must never see. The
 * digest is shown because it is the only thing support can correlate against.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfacing the message in the console (not the UI) keeps it available to
    // an engineer with devtools open without leaking it into the page.
    console.error('[console] route error', error);
  }, [error]);

  return (
    <div className="obc-section">
      <div
        role="alert"
        className="max-w-2xl border border-[var(--obc-crit)]/35 bg-[var(--obc-crit-wash)] px-5 py-5"
      >
        <p className="obc-label text-[#E58C85]">Console view unavailable</p>
        <p className="obc-body mt-3">
          This screen failed to render. Monitoring, incident detection and evidence generation run
          on the backend and are unaffected. No observation was missed.
        </p>
        {error.digest && (
          <p className="obc-mono mt-3 text-[var(--obc-text-4)]">reference {error.digest}</p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="obc-btn obc-btn-primary" onClick={() => reset()}>
            Retry
          </button>
          <Link href="/dashboard" className="obc-btn">
            Overview
          </Link>
          <Link href="/support" className="obc-btn">
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}
