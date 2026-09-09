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
 *   24 h uptime (86400 - 2125) / 86400 = 97.54%
 *   degradation (100.0 - 97.54) / 100.0 = 2.46%
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
  regions: 'us-east, eu-west',
} as const;

const SLA = {
  planned: '100.0% (0s allowable outage)',
  measured: '97.54',
  impact: '2.46',
  quorum: 'YES (Confirmed across multiple independent regions)',
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
            Verified Independent Multi-Region Vendor Failure Evidence
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
          <Field label="Verification Regions" value={INCIDENT.regions} />
        </ReportSection>

        <ReportSection n="2" title="SLA Impact Calculation">
          <Field label="Planned Target Uptime" value={SLA.planned} />
          <Field label="Measured 24h Uptime" value={`${SLA.measured}%`} />
          <Field label="SLA Degradation Impact" value={`${SLA.impact}%`} />
          <Field label="Quorum Confirmed Failure" value={SLA.quorum} />
        </ReportSection>

        <ReportSection n="5" title="Deterministic Attribution">
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
            label={EVIDENCE_FOOTER_FIELDS[1]}
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
