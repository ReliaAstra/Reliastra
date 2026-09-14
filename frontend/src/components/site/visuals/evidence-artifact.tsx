import {
  EVIDENCE_EXPIRY_DAYS,
  EVIDENCE_FOOTER_FIELDS,
  EVIDENCE_REPORT_PATH,
} from '@/lib/product-contract';

/**
 * The evidence artifact, as the backend actually generates it.
 *
 * Section headings and field labels are transcribed from
 * `backend/templates/evidence/default.html` and asserted against it by
 * `product-contract.test.ts`. The values are illustrative; the panel says so,
 * and the arithmetic between them is internally consistent:
 *
 *   window        09:12:41Z - 09:48:06Z = 2125 s = 35 min 25 s
 *   checks        36 measured, 6 failed, 0 blocked by policy
 *   availability  30 / 36 = 83.3333%
 *   degradation   100.0 - 83.3333 = 16.6667%
 *   downtime      2125 s x 16.6667% = 354.17 s = 5 min 54 s
 *
 * Formatting is copied from the document, not invented here: four-decimal
 * percentages, durations in words, timestamps as `14 Nov 2025, 09:12:41 UTC`,
 * enum values as labels ("Vendor failure", never `vendor_failure`), and the
 * finding stated before the tables that substantiate it. A panel that renders
 * `83.33%` where the report prints `83.3333%` would be a marketing picture of a
 * document rather than the document.
 *
 * It is drawn as a sheet of paper inside a dark page on purpose: this is the one
 * product surface that is a printed artifact handed to a counterparty, and the
 * mock should not look like a dashboard.
 */

const REPORT = {
  reference: 'RA-20251114-PAYMENTSAP-E0B13',
  preparedFor: 'Northwind Commerce Ltd',
  orgId: 'a41d6c02-3e88-4f17-9a25-7b6c0d1e5f92',
  recordState: 'Final · incident resolved',
  issued: '14 Nov 2025, 10:02:11 UTC',
  window: '14 Nov 2025, 09:12:41 UTC – 09:48:06 UTC',
  headline:
    'Major dependency event on payments-api - resolved: 83.33% measured availability over 35 min 25 s',
  finding: [
    '6 of 36 checks issued to https://api.payments.example/v1/charges failed inside a 35 min 25 s window beginning 14 Nov 2025, 09:12:41 UTC. Measured availability for the window is 83.3333%, computed from these checks only.',
    'The longest unbroken run of failed checks was 6, at 1 observation point. The detection rule that opened this incident was recorded as “Consecutive failed checks (single observation point)”.',
    'The attribution engine classified this as “Vendor failure” at 91.25% confidence under methodology v1.0. That classification describes what the timelines support, not fault or liability.',
    'Every observation here was issued from a single RELIASTRA observation point. Confirmation is by persistence of failure over 35 min 25 s, not by agreement between independent points, and no cross-verification is claimed.',
  ],
} as const;

const FIGURES = [
  {
    label: 'Incident window',
    value: '35 min 25 s',
    note: '14 Nov 2025, 09:12 → 09:48 UTC',
  },
  {
    label: 'Measured availability',
    value: '83.33%',
    note: '30 of 36 measured checks reached the target',
  },
  {
    label: 'Measured downtime',
    value: '5 min 54 s',
    note: 'inside a 35 min 25 s window, 6 failed check(s)',
  },
  {
    label: 'Attribution',
    value: 'Vendor failure',
    note: '91.25% confidence · v1.0',
  },
] as const;

const INCIDENT = {
  id: '0e7c1f38-9b2a-4d6e-8c51-2f4a7d9e0b13',
  dependency:
    'payments-api (https://api.payments.example/v1/charges)',
  severityStatus: 'Major / Resolved',
  startedAt: '14 Nov 2025, 09:12:41 UTC',
  resolvedAt: '14 Nov 2025, 09:48:06 UTC',
  measurementWindow: '14 Nov 2025, 09:12:41 UTC – 09:48:06 UTC · 2125 s',
  topology: 'Single observation point - 1 observation point recorded in this window (us-east)',
} as const;

const WINDOW = {
  checks: '36 (36 that reached the endpoint are the denominator)',
  up: '30',
  down: '6',
  blocked: '0',
  availability: '83.3333% over 36 measured checks',
  failureRun: '6 consecutive failed check(s)',
  latency:
    'mean 412.3 ms · p50 398.0 ms · p95 812.4 ms · min 121.0 ms · max 934.6 ms',
  firstLast: '14 Nov 2025, 09:12:41 UTC → 14 Nov 2025, 09:47:41 UTC',
} as const;

const SLA = {
  planned: '100.0% (0 s allowable inside this window)',
  measured: '83.3333%',
  impact: '16.6667% (target − measured, floored at zero)',
  downtime: '5 min 54 s (354.17 s, measured share of the window)',
  allowance: 'yes',
  basis: '6 of 36 measured checks failed inside the 2125 s window (1 observation point(s)).',
} as const;

const ATTRIBUTION = {
  classification: 'Vendor failure',
  confidence: '91.25%',
  methodology: 'v1.0',
} as const;

const FOOTER = {
  hash: '9f2c41b7e08ad35c6f19427ba5e8d0c3f471629ab8d5c30e1f7a4b62d9085a17',
  verificationId: 'rsl_ver_7Q4M2X8A3RK9TZ0B',
  signature: 'Signed · Ed25519, key 9f2c41ba77de3311',
} as const;

/**
 * A row of the depicted report.
 *
 * `<p>` rather than a heading, deliberately: these titles belong to the artifact
 * being shown, not to this page's outline. The component is embedded under an
 * `h2` on the homepage and under an `h1` on capability pages, so any fixed
 * heading level would be wrong in one of the two. The `<figure>` is named by its
 * `<figcaption>`, which is the correct relationship.
 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 border-t border-[#DFE4EB] py-1.5 first:border-t-0 sm:grid-cols-[minmax(120px,178px)_minmax(0,1fr)] sm:items-baseline">
      <span className="font-mono text-[9px] font-semibold tracking-[0.09em] text-[#5A6472] uppercase">
        {label}
      </span>
      <span className="font-mono text-[11.5px] break-words text-[#0B1220] [font-variant-numeric:tabular-nums]">
        {value}
      </span>
    </div>
  );
}

function ReportSection({
  n,
  title,
  note,
  children,
}: {
  n: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[#0B1220] pt-2 pb-4">
      <p className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-bold tracking-[-0.008em] text-[#0B1220]">
          {n}. {title}
        </span>
        {note ? (
          <span className="font-mono text-[8.5px] tracking-[0.09em] text-[#8A94A3] uppercase">
            {note}
          </span>
        ) : null}
      </p>
      <div>{children}</div>
    </div>
  );
}

/** A stand-in for the QR the real document prints. Decorative, never load-bearing. */
function QrMark() {
  const modules = 21;
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} fill="#0B1220" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="#0B1220" />
    </g>
  );
  const dots: React.ReactNode[] = [];
  for (let y = 0; y < modules; y += 1) {
    for (let x = 0; x < modules; x += 1) {
      const inFinder =
        (x < 8 && y < 8) || (x > modules - 9 && y < 8) || (x < 8 && y > modules - 9);
      if (inFinder) continue;
      // A deterministic pattern, not an encoded payload: the real report draws
      // this from `qrcode` over the verification URL. The number is shown as
      // text beside it, so nothing here is the only route to verification.
      if ((x * 7 + y * 11 + ((x * y) % 5)) % 3 === 0) {
        dots.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#0B1220" />);
      }
    }
  }
  return (
    <svg
      viewBox={`0 0 ${modules} ${modules}`}
      className="size-14 shrink-0"
      aria-hidden="true"
      role="presentation"
    >
      <rect width={modules} height={modules} fill="#fff" />
      {dots}
      {finder(0, 0)}
      {finder(modules - 7, 0)}
      {finder(0, modules - 7)}
    </svg>
  );
}

export function EvidenceArtifact() {
  return (
    <figure className="overflow-hidden rounded-[2px] border border-[#C6CFDB] bg-white text-[#0B1220] [font-variant-numeric:tabular-nums]">
      <figcaption className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-[#0B1220] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
              <rect
                x="0.75"
                y="0.75"
                width="22.5"
                height="22.5"
                fill="none"
                stroke="#0B1220"
                strokeOpacity="0.35"
                strokeWidth="1.5"
              />
              <path d="M4 16.5h16" stroke="#0B1220" strokeOpacity="0.3" strokeWidth="1.5" />
              <path d="M8 16.5V11" stroke="#0B1220" strokeOpacity="0.5" strokeWidth="1.5" />
              <path d="M16 16.5v-3" stroke="#0B1220" strokeOpacity="0.5" strokeWidth="1.5" />
              <path d="M12 16.5V6.5" stroke="#D9A441" strokeWidth="1.75" />
            </svg>
            <span className="text-[12px] font-bold tracking-[0.13em]">RELIASTRA</span>
            <span className="font-mono text-[9px] tracking-[0.09em] text-[#5A6472] uppercase">
              measurement record
            </span>
          </span>
          <span className="text-[11px] text-[#5A6472]">
            Prepared for {REPORT.preparedFor} · issued {REPORT.issued}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-right">
            <span className="block font-mono text-[8px] tracking-[0.13em] text-[#8A94A3] uppercase">
              Report reference
            </span>
            <span className="block font-mono text-[11px] font-semibold">{REPORT.reference}</span>
          </span>
          <span className="ob-vis-flag">Illustrative values</span>
        </div>
      </figcaption>

      <div className="px-4 pt-4 sm:px-6">
        <p className="font-mono text-[9px] tracking-[0.16em] text-[#A9761F] uppercase">
          Independently measured · signed record
        </p>
        <p className="mt-1 text-[19px] leading-tight font-bold tracking-[-0.02em]">
          payments-api
        </p>
        <p className="mt-1 max-w-[64ch] text-[12px] leading-relaxed text-[#3C4655]">
          {REPORT.headline}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#DFE4EB] pt-3 sm:grid-cols-4">
          {FIGURES.map((figure) => (
            <div key={figure.label}>
              <p className="font-mono text-[8.5px] font-semibold tracking-[0.11em] text-[#5A6472] uppercase">
                {figure.label}
              </p>
              <p className="mt-1 text-[15px] leading-none font-bold">{figure.value}</p>
              <p className="mt-1 text-[9.5px] leading-snug text-[#5A6472]">{figure.note}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 border border-[#C6CFDB] border-l-[3px] border-l-[#D9A441] px-3.5 pt-2.5 pb-1">
          <p className="font-mono text-[8.5px] font-bold tracking-[0.13em] text-[#5A6472] uppercase">
            What the record shows
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {REPORT.finding.map((sentence) => (
              <li key={sentence} className="list-disc text-[11px] leading-relaxed text-[#0B1220] [&::marker]:text-[#A9761F]">
                {sentence}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="px-4 pt-4 pb-2 sm:px-6">
        <ReportSection n="1" title="Incident Record" note={REPORT.recordState}>
          <Field label="Report Reference" value={REPORT.reference} />
          <Field label="Incident ID" value={INCIDENT.id} />
          <Field label="Organization" value={`${REPORT.preparedFor} (${REPORT.orgId})`} />
          <Field label="Monitored Dependency" value={INCIDENT.dependency} />
          <Field label="Severity / Status" value={INCIDENT.severityStatus} />
          <Field label="Started At (UTC)" value={INCIDENT.startedAt} />
          <Field label="Resolved At (UTC)" value={INCIDENT.resolvedAt} />
          <Field label="Measurement Window (UTC)" value={INCIDENT.measurementWindow} />
          <Field label="Observation Topology" value={INCIDENT.topology} />
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
          <Field label="Measured Availability In Window" value={SLA.measured} />
          <Field label="SLA Degradation Impact" value={SLA.impact} />
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

      <div className="border-t border-[#0B1220] px-4 py-3.5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <Field label={EVIDENCE_FOOTER_FIELDS[0]} value={`${FOOTER.hash.slice(0, 22)}…${FOOTER.hash.slice(-10)}`} />
            <Field label={EVIDENCE_FOOTER_FIELDS[2]} value={FOOTER.verificationId} />
            <Field label="Signature" value={FOOTER.signature} />
            <p className="mt-2 font-mono text-[10px] break-all text-[#0B1220] underline decoration-[#D9A441] decoration-2 underline-offset-2">
              {`https://reliastra.com${EVIDENCE_REPORT_PATH}/${FOOTER.verificationId}`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <QrMark />
            <span className="font-mono text-[8.5px] tracking-[0.08em] text-[#8A94A3] uppercase">
              printed as a scannable code
            </span>
          </div>
        </div>
        <p className="mt-3 max-w-[86ch] text-[10.5px] leading-relaxed text-[#5A6472]">
          Retained for {EVIDENCE_EXPIRY_DAYS} days, then deleted: only the hashes recorded at the
          verification address remain checkable. Sections 1, 3, 4 and 8 are shown; the full document
          carries eleven, including the observation appendix and this block in full. Headings,
          labels and formatting are the ones the generated report uses; the values are an example,
          not a recorded incident.
        </p>
      </div>
    </figure>
  );
}
