import {
  EVIDENCE_EXPIRY_DAYS,
  EVIDENCE_FOOTER_FIELDS,
} from '@/lib/product-contract';

/**
 * The evidence artifact, as the backend actually generates it.
 *
 * Section headings and field labels are transcribed from
 * `backend/templates/evidence/default.html` and asserted against it by
 * `product-contract.test.ts`. The values are illustrative; the panel says so,
 * and the arithmetic between them is internally consistent:
 *
 *   window      09:12:41Z - 09:48:06Z = 2125 s
 *   checks      36 measured in the window, 6 failed, 0 blocked
 *   availability 30 / 36 = 83.3333%
 *   degradation  100.0 - 83.3333 = 16.6667%
 *   downtime     2125 s x 16.6667% = 354 s
 *
 * Every figure is computed from the incident window, exactly as the real
 * report computes it - there is no rolling 24-hour number here, because the
 * real report does not present one as the incident measurement either.
 *
 * A demonstration panel whose numbers do not agree with each other is worse
 * than no panel, because a technical buyer checks them.
 */

const INCIDENT = {
  id: '0e7c1f38-9b2a-4d6e-8c51-2f4a7d9e0b13',
  orgId: 'a41d6c02-3e88-4f17-9a25-7b6c0d1e5f92',
  dependency: 'payments-api (https://api.payments.example/v1/charges)',
  severity: 'MAJOR',
  status: 'RESOLVED',
  startedAt: '2025-11-14 09:12:41+00:00',
  resolvedAt: '2025-11-14 09:48:06+00:00',
  window: '2025-11-14 09:12:41 \u2192 09:48:06 (2125s)',
  topology: 'Single observation point \u2014 1 point recorded (us-east)',
} as const;

const DETECTION = {
  rule: 'Consecutive failed checks (single observation point)',
  identifier: 'single.consecutive_failures',
  confirmed: 'CONFIRMED by consecutive failed checks (single observation point)',
  basis: '2 consecutive failed checks (2 required)',
} as const;

const WINDOW = {
  checks: '36 (36 reached the target)',
  up: '30',
  down: '6',
  blocked: '0',
  availability: '83.3333%',
  failureRun: '6 consecutive failed check(s)',
  latency: 'avg 412.3 \u00b7 p50 398.0 \u00b7 p95 812.4 \u00b7 min 121.0 \u00b7 max 934.6',
  firstLast: '2025-11-14 09:12:41 \u2192 2025-11-14 09:47:41',
} as const;

const SLA = {
  planned: '100.0% (0s allowable outage)',
  measured: '83.3333',
  impact: '16.6667',
  downtime: '354s of 2125s',
  allowance: 'YES',
  basis: '6 of 36 measured checks failed inside the 2125s window (1 observation point)',
} as const;

const ATTRIBUTION = {
  classification: 'vendor_failure',
  confidence: '91.25%',
  methodology: 'v1.0',
} as const;

const FOOTER = {
  hash: '9f2c41b7e08ad35c6f19427ba5e8d0c3f471629ab8d5c30e1f7a4b62d9085a17',
  verificationId: 'rsl_ver_7Q4M2X8A3RK9TZ0B',
} as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="ob-vis-row">
      <dt className="ob-vis-k">{label}</dt>
      <dd className="ob-vis-v">{value}</dd>
    </div>
  );
}

/**
 * A section of the depicted report.
 *
 * Deliberately not a heading: these titles belong to the artifact being
 * shown, not to the page's own outline. This component is embedded under an
 * `h2` on the homepage and under an `h1` on capability pages, so any fixed
 * heading level would be wrong in one of the two and would break the
 * document outline for assistive tech. The enclosing `<figure>` is named by
 * its `<figcaption>`, which is the correct relationship.
 */
function ReportSection({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ob-vis-block">
      <p className="ob-vis-block-title">
        <span aria-hidden className="ob-vis-block-n">
          {n}
        </span>
        {title}
      </p>
      <dl className="ob-vis-dl">{children}</dl>
    </div>
  );
}

export function EvidenceArtifact() {
  return (
    <figure className="ob-artifact">
      <figcaption className="ob-artifact-head">
        <div className="flex flex-col gap-1">
          <span className="ob-artifact-title">
            RELIASTRA EXTERNAL SLA EVIDENCE REPORT
          </span>
          <span className="ob-artifact-sub">
            Detector-Confirmed Vendor Failure Evidence
          </span>
        </div>
        <span className="ob-vis-flag">Illustrative values</span>
      </figcaption>

      <div className="ob-artifact-body">
        <ReportSection n="1" title="Incident Metadata">
          <Field label="Incident ID" value={INCIDENT.id} />
          <Field label="Organization ID" value={INCIDENT.orgId} />
          <Field label="Monitored Dependency" value={INCIDENT.dependency} />
          <Field
            label="Severity / Status"
            value={`${INCIDENT.severity} / ${INCIDENT.status}`}
          />
          <Field label="Started At (UTC)" value={INCIDENT.startedAt} />
          <Field label="Resolved At (UTC)" value={INCIDENT.resolvedAt} />
          <Field label="Measurement Window (UTC)" value={INCIDENT.window} />
          <Field label="Observation Topology" value={INCIDENT.topology} />
        </ReportSection>

        <ReportSection n="2" title="Detection Record">
          <Field label="Detection Rule" value={DETECTION.rule} />
          <Field label="Rule Identifier" value={DETECTION.identifier} />
          <Field label="Detector Confirmation" value={DETECTION.confirmed} />
          <Field label="Basis" value={DETECTION.basis} />
        </ReportSection>

        <ReportSection n="3" title="Incident Window Measurements">
          <Field label="Checks In Window" value={WINDOW.checks} />
          <Field label="Successful Checks" value={WINDOW.up} />
          <Field label="Failed Checks" value={WINDOW.down} />
          <Field label="Blocked Checks (Excluded)" value={WINDOW.blocked} />
          <Field label="Measured Availability" value={WINDOW.availability} />
          <Field label="Longest Failure Run" value={WINDOW.failureRun} />
          <Field label="Latency (ms)" value={WINDOW.latency} />
          <Field label="First / Last Observation" value={WINDOW.firstLast} />
        </ReportSection>

        <ReportSection n="4" title="SLA Impact Calculation">
          <Field label="Planned Target Uptime" value={SLA.planned} />
          <Field label="Measured Availability In Window" value={`${SLA.measured}%`} />
          <Field label="SLA Degradation Impact" value={`${SLA.impact}%`} />
          <Field label="Measured Downtime" value={SLA.downtime} />
          <Field label="Allowance Exceeded" value={SLA.allowance} />
          <Field label="Calculation Basis" value={SLA.basis} />
        </ReportSection>

        <ReportSection n="8" title="Deterministic Attribution">
          <Field label="Classification" value={ATTRIBUTION.classification} />
          <Field label="Confidence Score" value={ATTRIBUTION.confidence} />
          <Field label="Methodology" value={ATTRIBUTION.methodology} />
        </ReportSection>
      </div>

      <div className="ob-artifact-foot">
        <dl className="ob-vis-dl">
          <Field
            label={EVIDENCE_FOOTER_FIELDS[0]}
            value={`${FOOTER.hash.slice(0, 16)}…${FOOTER.hash.slice(-8)}`}
          />
          <Field
            label={EVIDENCE_FOOTER_FIELDS[2]}
            value={FOOTER.verificationId}
          />
        </dl>
        <p className="ob-artifact-note">
          Retained for {EVIDENCE_EXPIRY_DAYS} days. Section headings and field
          labels are the ones the generated report uses; the values are an
          example, not a recorded incident.
        </p>
      </div>
    </figure>
  );
}
