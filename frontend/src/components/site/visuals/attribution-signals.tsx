import {
  ATTRIBUTION_METHODOLOGY_VERSION,
  ATTRIBUTION_WEIGHTS,
  CLASSIFICATION_THRESHOLDS,
  SIGNAL_LABEL,
  classificationFor,
  confidenceFromSignals,
  type AttributionSignal,
} from '@/lib/product-contract';

/**
 * How the verdict is reached.
 *
 * The confidence score is not asserted here, it is computed: the same weighted
 * sum the engine runs, over illustrative signal values. That keeps the panel
 * honest in the way a hard-coded number would not be - if the weights change
 * in the backend, `product-contract.test.ts` fails and this figure moves with
 * them.
 *
 * Signals are normalised 0-1. The score is the weighted sum scaled to a
 * percentage. Thresholds decide the classification.
 */

/**
 * An illustrative signal set the deployed engine can actually produce.
 *
 * These were `temporal: 0.9` and `endpoint_overlap: 1` with the rest near 1,
 * which rendered 91.25% `vendor_failure`. That outcome was unreachable: the
 * temporal signal is binary (0 or 1) and, for a single dependency, `temporal`
 * is 0 - there is no second incident to corroborate. A panel that displays a
 * verdict the engine cannot produce teaches the reader the wrong thing about
 * what the number means.
 *
 * This set is a single dependency with a correlated endpoint, real latency
 * movement, one coherent error class and a healthy observer:
 *   0(0.20) + 1(0.25) + 0.90(0.225) + 0.85(0.1275) + 1(0.15) = 75.25
 * which is what clearing the `vendor_failure` bar actually takes. Note that
 * the corroborating endpoint correlation is doing the work: without it the
 * ceiling is 50.
 */
const SIGNALS: Record<AttributionSignal, number> = {
  temporal: 0,
  endpoint_overlap: 1,
  latency_correlation: 0.9,
  error_pattern: 0.85,
  infrastructure_baseline: 1,
};

/** Engine evaluation order; the weights are not sorted by size. */
const ORDER: AttributionSignal[] = [
  'endpoint_overlap',
  'latency_correlation',
  'temporal',
  'error_pattern',
  'infrastructure_baseline',
];

const SIGNAL_NOTE: Record<AttributionSignal, string> = {
  temporal: 'Other incidents open in the same 300s window',
  endpoint_overlap: 'Affected endpoints shared with the suspected dependency',
  latency_correlation: 'Latency movement against your error rate',
  error_pattern: 'Status codes returned by the dependency',
  infrastructure_baseline: 'Whether your own infrastructure was healthy',
};

export function AttributionSignals() {
  const confidence = confidenceFromSignals(SIGNALS);
  const classification = classificationFor(confidence);

  return (
    <div className="ob-attr">
      <div className="ob-attr-verdict">
        <div className="ob-attr-verdict-main">
          <span className="ob-label">Classification</span>
          <p className="ob-attr-classification">{classification}</p>
        </div>
        <div className="ob-attr-verdict-side">
          <div className="ob-attr-metric">
            <span className="ob-label">Confidence</span>
            <span className="ob-attr-score">{confidence.toFixed(2)}%</span>
          </div>
          <div className="ob-attr-metric">
            <span className="ob-label">Methodology</span>
            <span className="ob-attr-version">
              {ATTRIBUTION_METHODOLOGY_VERSION}
            </span>
          </div>
        </div>
      </div>

      {/*
        The threshold scale belongs here, on the aggregate score, and not on
        the per-signal bars below. A signal bar is a normalised 0-1 reading;
        the 50 and 75 thresholds apply to the weighted 0-100 total. Putting
        them on the same axis as a single signal would compare two different
        scales.
      */}
      <div className="ob-attr-scale">
        <div className="ob-attr-scale-track">
          <span
            className="ob-attr-scale-fill"
            style={{ width: `${Math.min(confidence, 100)}%` }}
          />
          <span
            aria-hidden
            className="ob-attr-scale-mark"
            style={{ left: `${CLASSIFICATION_THRESHOLDS.multi_cause}%` }}
          />
          <span
            aria-hidden
            className="ob-attr-scale-mark"
            style={{ left: `${CLASSIFICATION_THRESHOLDS.vendor_failure}%` }}
          />
        </div>
        {/*
          The threshold captions are centred on their marks. `multi_cause` at
          50% and `vendor_failure` at 75% of a narrow track collide with each
          other, and `vendor_failure` collides with the 100 end stop - both
          thresholds sit in the right half of the track. Each caption is
          therefore pinned to the left of its own mark instead of straddling
          it, which keeps every caption inside the track at any width.
        */}
        <div className="ob-attr-scale-labels">
          <span className="ob-attr-scale-zero">0</span>
          <span style={{ left: `${CLASSIFICATION_THRESHOLDS.multi_cause}%` }}>
            {CLASSIFICATION_THRESHOLDS.multi_cause} multi_cause
          </span>
          <span style={{ left: `${CLASSIFICATION_THRESHOLDS.vendor_failure}%` }}>
            {CLASSIFICATION_THRESHOLDS.vendor_failure} vendor_failure
          </span>
          <span className="ob-attr-scale-max">100</span>
        </div>
      </div>

      <ul className="ob-attr-list">
        {ORDER.map((signal) => {
          const value = SIGNALS[signal];
          const weight = ATTRIBUTION_WEIGHTS[signal];
          const contribution = value * weight * 100;

          return (
            <li key={signal} className="ob-attr-row">
              <div className="ob-attr-row-head">
                <span className="ob-attr-name">{SIGNAL_LABEL[signal]}</span>
                <span className="ob-attr-nums">
                  <span className="ob-attr-contrib">
                    +{contribution.toFixed(2)}
                  </span>
                  <span className="ob-attr-weight">
                    weight {weight.toFixed(2)}
                  </span>
                </span>
              </div>

              <div
                className="ob-attr-bar"
                role="img"
                aria-label={`${SIGNAL_LABEL[signal]}: ${value.toFixed(2)} of 1, weight ${weight.toFixed(2)}, contributes ${contribution.toFixed(2)} points`}
              >
                <span
                  className="ob-attr-fill"
                  style={{ width: `${value * 100}%` }}
                />
              </div>

              <p className="ob-attr-note">{SIGNAL_NOTE[signal]}</p>
            </li>
          );
        })}
      </ul>

      {/*
        Both thresholds are named in words here, not only as scale captions:
        the captions are withheld below 900px, and a reader on a phone still
        has to be able to see where the boundaries fall.
      */}
      <p className="ob-attr-foot">
        Deterministic. Signals are weighted, summed and rounded; the same inputs
        always produce the same score. A score of{' '}
        {CLASSIFICATION_THRESHOLDS.multi_cause} or more is{' '}
        <code>multi_cause</code>; {CLASSIFICATION_THRESHOLDS.vendor_failure} or
        more is <code>vendor_failure</code>. At {confidence.toFixed(2)} this
        clears the higher bar. Reaching it needs a second source of evidence:
        without the correlated endpoint here, one observation point watching one
        dependency tops out at 50, because a single probe failing twice is not
        evidence about whose fault an outage is. No model is involved in this
        decision.
      </p>
    </div>
  );
}
