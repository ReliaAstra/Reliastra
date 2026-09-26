'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { PUBLIC_ROUTES } from '@/lib/routes';

/**
 * Error boundary for the question surface.
 *
 * It exists to turn an unreadable measurement API into a 5xx - the only
 * status that tells a crawler to retry a URL that stays indexed. Like the
 * record boundary it must never render something that looks like an answer:
 * no state word, no lead sentence, no composed facts.
 */
export default function QuestionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Digest only: never log a token, a URL with credentials, or the raw
    // error object from a public page.
    console.error('Question page failed to render', error.digest ?? '');
  }, [error]);

  return (
    <div className="ob obs min-h-[70vh] bg-[var(--ob-void)]">
      <div className="ob-container py-20 md:py-28">
        <p className="ob-label text-[var(--ob-signal)]">Measurement unavailable</p>
        <h1 className="ob-h1 mt-5 max-w-[24ch]">
          RELIASTRA could not read the measurements this answer is composed from.
        </h1>
        <p className="ob-lede mt-6 max-w-[62ch]">
          No answer is published from a failed read: an unavailable instrument is not the same
          fact as a down - or an up - endpoint. Retrying re-runs the server render.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="ob-btn ob-btn-signal">
            Retry
          </button>
          <Link href={PUBLIC_ROUTES.observatory} className="ob-btn ob-btn-outline">
            Browse tracked dependencies
          </Link>
        </div>
      </div>
    </div>
  );
}
