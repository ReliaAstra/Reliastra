'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[console] route error', error);
  }, [error]);

  return (
    <div className="rs-section-spacing">
      <div
        role="alert"
        className="rs-card max-w-2xl border-rs-down/20 bg-rs-down-bg px-5 py-5"
      >
        <p className="rs-label text-rs-down">Console view unavailable</p>
        <p className="rs-body mt-3 text-rs-text-secondary">
          This screen failed to render. Monitoring, incident detection and evidence generation run
          on the backend and are unaffected. No observation was missed.
        </p>
        {error.digest && (
          <p className="rs-mono mt-3 text-rs-text-tertiary">reference {error.digest}</p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="rs-button rs-button-primary rs-button-sm" onClick={() => reset()}>
            Retry
          </button>
          <Link href="/dashboard" className="rs-button rs-button-secondary rs-button-sm">
            Overview
          </Link>
          <Link href="/support" className="rs-button rs-button-secondary rs-button-sm">
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}
