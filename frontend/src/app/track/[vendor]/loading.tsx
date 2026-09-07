import { ObservatoryShell } from '@/components/observatory/primitives';

/**
 * Route-level loading state.
 *
 * A measurement record cannot show a spinner in the middle of a chart frame:
 * that reads as "the service is fine, the page is slow". It states what the
 * system is doing instead, and reserves the space the record will occupy so
 * nothing jumps when the data lands.
 */
export default function VendorRecordLoading() {
  return (
    <ObservatoryShell>
      <div className="ob-container py-16 md:py-24">
        <p className="ob-label obs-label-signal">Initialising observation</p>
        <div className="mt-8 flex flex-col gap-6">
          <div className="h-[64px] w-[min(560px,80%)] bg-[var(--ob-base)] md:h-[112px]" />
          <div className="h-4 w-[min(420px,70%)] bg-[var(--ob-base)]" />
        </div>
        <p className="mt-10 max-w-[62ch] text-[13.5px] leading-[1.7] text-[var(--ob-text-3)]">
          Requesting the current observation, the aggregated windows and the incident history from
          the measurement API. No figure is drawn until it has been read - this page never shows a
          placeholder value.
        </p>
        <div className="mt-14 grid gap-px border-t border-[var(--ob-line)] pt-8 sm:grid-cols-4">
          {['Region', 'Latency', 'Status', 'Observed'].map((h) => (
            <div key={h} className="flex flex-col gap-3">
              <span className="ob-label">{h}</span>
              <span className="h-3 w-16 bg-[var(--ob-base)]" />
            </div>
          ))}
        </div>
      </div>
    </ObservatoryShell>
  );
}
