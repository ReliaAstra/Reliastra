import { Container, Eyebrow } from '@/components/site/primitives';
import { AttributionSignals } from '@/components/site/visuals/attribution-signals';
import { ATTRIBUTION } from '@/lib/methodology';

/**
 * 04 · Incident attribution, rendered as the investigation it performs.
 *
 * The flow strip is the shape of the argument: an application incident, a
 * dependency signal, the aligned window, the classification, the record that
 * follows. The values on the strip are one illustrative incident and the
 * block names them as such; the classification thresholds are the real ones,
 * read from the methodology constants.
 */
const FLOW: {
  tag: string;
  value: string;
  sub: string;
  tone?: 'critical' | 'degraded';
}[] = [
  {
    tag: 'Application incident',
    value: 'Checkout API',
    sub: 'elevated 5xx · 09:53:00 - 10:09:00 UTC',
  },
  {
    tag: 'Dependency signal',
    value: 'payments-api',
    sub: 'connect timeout · 2 consecutive checks',
    tone: 'critical',
  },
  {
    tag: 'Correlated window',
    value: '00:16:00',
    sub: 'observation range, one interval apart',
  },
  {
    tag: 'Likely contributor',
    value: 'vendor_failure',
    sub: `rule ${ATTRIBUTION.vendorFailureAt}+ · methodology ${ATTRIBUTION.methodologyVersion}`,
    tone: 'degraded',
  },
  {
    tag: 'Evidence',
    value: 'ev_8Kd2xQ7m',
    sub: '19 observations · sha-256',
  },
];

export function AttributionScene() {
  return (
    <section
      id="attribution"
      aria-labelledby="attribution-title"
      className="border-t border-[var(--ob-line)] bg-[var(--ob-base)]"
    >
      <Container className="py-24 md:py-32 lg:py-36">
        <div className="flex flex-col gap-9 pb-14 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-7">
            <Eyebrow index="04">Attribute</Eyebrow>
            <h2 id="attribution-title" className="ob-scene-title max-w-[14ch]">
              From incident to named contributor.
            </h2>
          </div>
          <p className="ob-lede max-w-[40ch] lg:pb-1 lg:text-right">
            The investigation is arithmetic, printed with its weights: five
            signals, two thresholds, one versioned verdict.
          </p>
        </div>

        <ol className="ob-flow">
          {FLOW.map((step) => (
            <li key={step.tag} className="ob-flow-step">
              <div className="ob-flow-k">
                <span className="ob-flow-tag">{step.tag}</span>
              </div>
              <p className="ob-flow-v" data-tone={step.tone}>
                {step.value}
              </p>
              <p className="ob-flow-sub">{step.sub}</p>
            </li>
          ))}
        </ol>
        <p className="ob-label mt-3">
          One illustrative incident · shown to demonstrate the investigation,
          not a live reading
        </p>

        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-20">
          <AttributionSignals />
          <div className="flex flex-col gap-5 lg:pt-1">
            <p className="ob-label">Classification, in the open</p>
            {[
              ['vendor_failure', `confidence ${ATTRIBUTION.vendorFailureAt} or above`],
              [
                'multi_cause',
                `${ATTRIBUTION.multiCauseAt} to ${ATTRIBUTION.vendorFailureAt}`,
              ],
              [
                'infrastructure_issue',
                'below both thresholds, with RELIASTRA probes degraded',
              ],
              ['unknown', 'everything else · a result, not an error'],
            ].map(([name, when]) => (
              <div
                key={name}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-[var(--ob-line)] pt-4"
              >
                <span className="ob-mono text-[12.5px] text-[var(--ob-text)]">{name}</span>
                <span className="text-[12.5px] text-[var(--ob-text-4)]">{when}</span>
              </div>
            ))}
            <p className="ob-small mt-3 max-w-[54ch]">
              A score is an alignment between two timelines. It is not proof of
              causation, and no surface in this product describes it as one.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
