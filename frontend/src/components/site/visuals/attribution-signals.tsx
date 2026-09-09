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

const SIGNALS: Record<AttributionSignal, number> = {
  temporal: 0.9,
  endpoint_overlap: 1,
  latency_correlation: 0.85,
  error_pattern: 0.8,
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
        <div className="ob-attr-scale-labels">
          <span>0</span>
          <span
            style={{ left: `${CLASSIFICATION_THRESHOLDS.multi_cause}%` }}
          >
            {CLASSIFICATION_THRESHOLDS.multi_cause} multi_cause
          </span>
          <span
            style={{ left: `${CLASSIFICATION_THRESHOLDS.vendor_failure}%` }}
          >
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
        clears the higher bar. No model is involved in this decision.
      </p>
    </div>
  );
}
