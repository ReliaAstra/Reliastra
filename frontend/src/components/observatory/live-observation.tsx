'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * The live element of the record.
 *
 * What makes this page feel alive is not decoration, it is that the elapsed
 * time since the last observation is *true right now*. So:
 *
 *  - The observation timestamp itself is server-rendered. Nothing important
 *    waits for hydration.
 *  - After mount, a 1s interval advances the "T+" counter and the cadence
 *    hairline, which fills across the interval at which observations have
 *    actually been arriving (derived from the timeline's own bucket density,
 *    not a configured constant we cannot see from a public endpoint).
 *  - When the counter passes the expected cadence the component asks the
 *    server for fresh data (`router.refresh()`), so a new observation appears
 *    without a manual reload. Refresh only runs while the tab is visible, and
 *    never more than once every 30 seconds.
 *
 * The counter is `null` until mount: rendering an elapsed time on the server
 * and a different one in the browser is a hydration mismatch, and this is a
 * page about measurement accuracy.
 */
export function LiveObservation({
  timestamp,
  cadenceSeconds,
  className,
}: {
  /** ISO timestamp of the most recent observation, or null when there is none. */
  timestamp: string | null;
  /** Observed interval between observations, in seconds, when derivable. */
  cadenceSeconds: number | null;
  className?: string;
}) {
  const router = useRouter();
  const [elapsedSec, setElapsedSec] = useState<number | null>(null);
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (!timestamp) return;
    const base = new Date(timestamp).getTime();
    if (Number.isNaN(base)) return;

    const tick = () => {
      const secs = Math.max(0, Math.floor((Date.now() - base) / 1000));
      setElapsedSec(secs);

      const due = cadenceSeconds ? cadenceSeconds + 5 : 60;
      const now = Date.now();
      if (
        secs >= due &&
        now - lastRefresh.current > 30_000 &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible'
      ) {
        lastRefresh.current = now;
        router.refresh();
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [timestamp, cadenceSeconds, router]);

  const progress =
    elapsedSec === null || !cadenceSeconds
      ? 0
      : Math.min(100, (elapsedSec / cadenceSeconds) * 100);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-6">
        <span className="ob-label">Observation cadence</span>
        <span
          className="obs-num obs-num-sm text-[var(--ob-text-3)]"
          aria-live="off"
          suppressHydrationWarning
        >
          {!timestamp ? (
            <span className="obs-void">no observation</span>
          ) : elapsedSec === null ? (
            <span className="obs-void">measuring</span>
          ) : (
            <>T+{formatElapsed(elapsedSec)}</>
          )}
        </span>
      </div>
      <span className="obs-cadence" aria-hidden>
        <i style={{ width: `${progress}%` }} />
      </span>
      <p className="ob-small">
        {!timestamp ? (
          <>
            No observation has been recorded yet, so there is no elapsed time to count and no
            interval to measure against.
          </>
        ) : cadenceSeconds ? (
          <>
            Observations have been arriving about every{' '}
            <span className="obs-num obs-num-sm">{formatCadence(cadenceSeconds)}</span> in this
            window. The bar advances against that interval.
          </>
        ) : (
          <>
            The observation interval cannot be derived from the current window, so no expected
            interval is shown.
          </>
        )}
      </p>
      <span className="sr-only" role="status">
        {!timestamp
          ? 'No observation has been recorded for this dependency.'
          : elapsedSec === null
          ? 'Elapsed time since the last observation is being measured.'
          : `Last observation was ${formatElapsed(elapsedSec)} ago.`}
      </span>
    </div>
  );
}

function formatElapsed(total: number): string {
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

function formatCadence(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`;
  const m = seconds / 60;
  if (m < 90) return `${m.toFixed(m < 10 ? 1 : 0)}m`;
  return `${(m / 60).toFixed(1)}h`;
}
