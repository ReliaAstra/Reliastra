import { cn } from '@/lib/utils';
import { DETECTION, OBSERVATION_LABEL, PROBE_INTERVAL_SECONDS } from '@/lib/methodology';

/**
 * The hero's product surface: one dependency, five probes, the confirmation,
 * and the record that follows.
 *
 * This is not a screenshot and not an illustration of a concept. It is the real
 * shape of the data - the fields are the columns on `check_results`, the rule
 * id is the one the detector actually fires, and the evidence line carries the
 * fields the artifact actually prints. Values are illustrative, and the panel
 * says so, because the alternative is a homepage that shows invented
 * measurements on a product whose entire argument is that measurements are
 * kept honestly.
 *
 * Rendering note: it is static markup. The only motion is a CSS animation on
 * the confirmation row and the record footer, staggered so the eye reads
 * probe → failure → confirmation → record in the order the system does. Both
 * animations collapse under `prefers-reduced-motion`.
 */

type Probe = {
  at: string;
  code: string;
  latency: string;
  verdict: 'up' | 'failed';
  detail?: string;
};

const PROBES: Probe[] = [
  { at: '09:51:00Z', code: '200', latency: '181 ms', verdict: 'up' },
  { at: '09:52:00Z', code: '200', latency: '184 ms', verdict: 'up' },
  { at: '09:53:00Z', code: '-', latency: '-', verdict: 'failed', detail: 'connect timeout' },
  { at: '09:54:00Z', code: '-', latency: '-', verdict: 'failed', detail: 'connect timeout' },
  { at: '09:55:00Z', code: '503', latency: '2 ms', verdict: 'failed', detail: 'service unavailable' },
];

function Row({ probe, index }: { probe: Probe; index: number }) {
  const failed = probe.verdict === 'failed';
  return (
    <li
      className={cn(
        'grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 border-t border-[var(--ob-line)] px-4 py-2.5 sm:px-5',
        failed && 'ob-ledger-fail'
      )}
      style={{ animationDelay: `${140 + index * 90}ms` }}
    >
      <time className="ob-mono text-[11.5px] text-[var(--ob-text-4)]">{probe.at}</time>
      <span className="min-w-0 truncate">
        <span
          className={cn(
            'ob-mono text-[11.5px]',
            failed ? 'text-[var(--ob-critical)]' : 'text-[var(--ob-healthy)]'
          )}
        >
          {failed ? 'failed' : 'up'}
        </span>
        {probe.detail && (
          <span className="ob-mono ml-3 text-[11.5px] text-[var(--ob-text-4)]">{probe.detail}</span>
        )}
      </span>
      <span className="ob-mono whitespace-nowrap text-right text-[11.5px] text-[var(--ob-text-3)]">
        {probe.code} <span className="text-[var(--ob-text-4)]">·</span> {probe.latency}
      </span>
    </li>
  );
}

export function ObservationLedger({ className }: { className?: string }) {
  return (
    <figure className={cn('ob-ledger', className)} data-illustrative="true">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--ob-line)] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="ob-dot ob-ledger-pulse" data-state="critical" />
          <span className="truncate text-[13px] font-medium text-[var(--ob-text)]">
            Payments API
          </span>
        </div>
        <span className="ob-label">every {PROBE_INTERVAL_SECONDS}s</span>
      </div>

      <ol aria-label="Observations recorded for this dependency" className="pb-1">
        {PROBES.map((probe, i) => (
          <Row key={probe.at} probe={probe} index={i} />
        ))}
      </ol>

      {/* The confirmation. The rule identifier is printed because that is what
          the incident stores, and because a reader who wants to check the
          method should be able to look up the exact rule that ran. */}
      <div
        className="ob-ledger-verdict border-t border-[var(--ob-line-2)] bg-[var(--ob-critical-wash)] px-5 py-4"
        style={{ animationDelay: '620ms' }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="ob-label text-[var(--ob-critical)]">Incident opened</p>
          <p className="ob-mono text-[11.5px] text-[var(--ob-text-4)]">
            {DETECTION.failureChecks} consecutive failures
          </p>
        </div>
        <p className="ob-mono mt-2 text-[12px] text-[var(--ob-text-2)]">
          {DETECTION.ruleId} · started 09:53:00Z · {OBSERVATION_LABEL}
        </p>
      </div>

      <div
        className="ob-ledger-record border-t border-[var(--ob-line)] px-5 py-4"
        style={{ animationDelay: '820ms' }}
      >
        <p className="ob-label mb-2.5">Evidence record</p>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {[
            ['report', 'ev_8Kd2xQ7m'],
            ['data hash', '3f9a…c41e'],
            ['methodology', 'v1.0'],
            ['retention', '365 days'],
          ].map(([term, value]) => (
            <div key={term} className="flex items-baseline justify-between gap-4">
              <dt className="ob-label">{term}</dt>
              <dd className="ob-mono text-[11.5px] text-[var(--ob-text-2)]">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <figcaption className="border-t border-[var(--ob-line)] px-5 py-3">
        <span className="ob-label">
          <span className="font-semibold text-[var(--ob-text-2)]">
            Example only — not a RELIASTRA observation.
          </span>{' '}
          Illustrative record · the timestamps, HTTP status codes, latency
          values and evidence IDs shown here are synthetic demonstration data,
          not measurements collected from a real dependency, and must not be
          read as a recorded incident.
        </span>
      </figcaption>
    </figure>
  );
}
