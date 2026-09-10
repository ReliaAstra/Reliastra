import {
  CHECK_INTERVAL_SECONDS,
  DETECTION_FAILURE_CHECKS,
} from '@/lib/product-contract';

/**
 * One incident, told as a sequence, ending in the artifact.
 *
 * This is the fastest way to understand the product: an application sees
 * failures, RELIASTRA confirms them from outside the vendor's own reporting,
 * the detection rule is satisfied, the incident is attributed, the record is
 * written. Every step maps to a real backend behaviour:
 *
 *   - observations carry executed_at, latency_ms, status_code, is_up
 *   - a fault needs DETECTION_FAILURE_CHECKS consecutive failed checks
 *   - attribution returns a classification plus a confidence score
 *
 * The timestamps are illustrative and the panel says so.
 */

type Beat = {
  time: string;
  actor: 'application' | 'reliastra' | 'probe' | 'engine' | 'record';
  title: string;
  detail: string;
  /** Rendered in the right-hand column as monospace evidence. */
  data?: [string, string][];
  state?: 'healthy' | 'degraded' | 'critical';
};

const BEATS: Beat[] = [
  {
    time: '09:12:41',
    actor: 'application',
    title: 'Your application reports elevated failures',
    detail: 'Checkout error rate rises. Your own monitoring cannot tell you whose fault it is.',
    data: [
      ['error_rate', '4.8%'],
      ['source', 'your telemetry'],
    ],
    state: 'degraded',
  },
  {
    time: '09:13:02',
    actor: 'reliastra',
    title: 'RELIASTRA observes external degradation',
    detail: `A scheduled check against the same dependency, issued every ${CHECK_INTERVAL_SECONDS}s from infrastructure the vendor does not control. One failure is recorded, not declared.`,
    data: [
      ['region', 'us-east'],
      ['status_code', '503'],
      ['latency_ms', '4120'],
      ['is_up', 'false'],
    ],
    state: 'critical',
  },
  {
    time: '09:13:44',
    actor: 'probe',
    title: 'A second consecutive failure confirms the incident',
    detail: `Confirmation is by persistence of failure: ${DETECTION_FAILURE_CHECKS} consecutive failed checks are required, and this is the second. No agreement between independent points is claimed.`,
    data: [
      ['executed_at', '09:13:44'],
      ['status_code', '503'],
      ['latency_ms', '3870'],
      ['detector_confirmed', 'true'],
    ],
    state: 'critical',
  },
  {
    time: '09:15:10',
    actor: 'engine',
    title: 'Incident attributed to the external dependency',
    detail: 'Five weighted signals produce a reproducible confidence score. No model is involved.',
    data: [
      ['classification', 'vendor_failure'],
      ['confidence', '91.25'],
      ['methodology', 'v1.0'],
    ],
  },
  {
    time: '09:16:03',
    actor: 'record',
    title: 'Evidence record finalized',
    detail: 'The window, the detection rule, the retained observations and a SHA-256 checksum of the report.',
    data: [
      ['duration', '35m 25s'],
      ['observations', '142'],
      ['sha256', '9f2c…5a17'],
    ],
    state: 'healthy',
  },
];

const ACTOR_LABEL: Record<Beat['actor'], string> = {
  application: 'Your application',
  reliastra: 'RELIASTRA',
  probe: 'RELIASTRA',
  engine: 'Attribution engine',
  record: 'Evidence record',
};

export function IncidentTimeline() {
  return (
    <div className="ob-timeline">
      <p className="ob-vis-flag ob-timeline-flag">
        Illustrative incident · not a recorded event
      </p>

      <ol className="ob-timeline-list">
        {BEATS.map((beat, i) => (
          <li key={beat.time} className="ob-beat">
            <div className="ob-beat-rail" aria-hidden>
              <span className="ob-beat-dot" data-state={beat.state ?? 'unknown'} />
              {i < BEATS.length - 1 && <span className="ob-beat-line" />}
            </div>

            <div className="ob-beat-body">
              <div className="ob-beat-head">
                <span className="ob-beat-time">{beat.time}</span>
                <span className="ob-beat-actor">{ACTOR_LABEL[beat.actor]}</span>
              </div>

              {/* Not a heading: this component is embedded under an h2 on the
                  homepage and under an h1 on capability pages, so a fixed
                  heading level would be wrong in one of them. The list
                  semantics carry the structure. */}
              <p className="ob-beat-title">{beat.title}</p>
              <p className="ob-beat-detail">{beat.detail}</p>

              {beat.data && (
                <dl className="ob-beat-data">
                  {beat.data.map(([k, v]) => (
                    <div key={k} className="ob-beat-datum">
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
