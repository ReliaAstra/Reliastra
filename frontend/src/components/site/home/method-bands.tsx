import { Container, Eyebrow } from '@/components/site/primitives';
import { LatencyChart } from '@/components/site/visuals/latency-chart';
import { IncidentTimeline } from '@/components/site/visuals/incident-timeline';
import { EvidenceArtifact } from '@/components/site/visuals/evidence-artifact';
import { SceneLinks } from './scenes';
import {
  DETECTION,
  EVIDENCE,
  OBSERVATION_LABEL,
  PROBE_INTERVAL_SECONDS,
} from '@/lib/methodology';
import { DOCS_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';

/**
 * The method, in three large editorial bands. Each band is one verb the
 * product performs, one short explanation, and one technical visual that
 * shows the working. The visuals are the same server-rendered figures the
 * product pages use: illustrative values, real schema, marked as such.
 */

function Band({
  id,
  index,
  verb,
  title,
  copy,
  visual,
  links,
  labelledBy,
}: {
  id: string;
  index: string;
  verb: string;
  title: string;
  copy: string;
  visual: React.ReactNode;
  links?: { href: string; label: string }[];
  labelledBy: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className="relative overflow-hidden border-t border-[var(--ob-line)] bg-[var(--ob-void)]"
    >
      <Container className="grid min-h-[70vh] content-center gap-14 py-24 md:py-32 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:gap-20">
        <div className="flex flex-col gap-7">
          <Eyebrow index={index}>{verb}</Eyebrow>
          <h2 id={labelledBy} className="ob-scene-title max-w-[12ch]">
            {title}
          </h2>
          <p className="ob-body-lg max-w-[48ch]">{copy}</p>
          {links && <SceneLinks items={links} />}
        </div>
        <div className="ob-band-visual lg:pt-4">{visual}</div>
      </Container>
    </section>
  );
}

export function ObserveBand() {
  return (
    <Band
      id="observation"
      labelledBy="observation-title"
      index="02"
      verb="Observe"
      title="Independent checks, outside your network and the vendor's."
      copy={`Probes run every ${PROBE_INTERVAL_SECONDS} seconds from infrastructure that is neither yours nor the vendor's, and every probe leaves a row: timestamp, status, latency, verdict. ${OBSERVATION_LABEL} is the single observation point today, printed on the records it produces.`}
      visual={<LatencyChart />}
      links={[
        { href: DOCS_ROUTES.monitoring, label: 'Monitoring docs' },
        { href: DOCS_ROUTES.configuration, label: 'Configuration' },
      ]}
    />
  );
}

export function CorrelateBand() {
  return (
    <Band
      id="correlation"
      labelledBy="correlation-title"
      index="03"
      verb="Correlate"
      title="Dependency behaviour, aligned with your incident window."
      copy={`Failing checks are replayed against the strict clock of the observations: ${DETECTION.failureChecks} consecutive failures open the incident, ${DETECTION.recoveryChecks} consecutive successes resolve it, and the rule identifier travels with the record. One dropped probe is recorded, not declared.`}
      visual={<IncidentTimeline />}
      links={[
        { href: DOCS_ROUTES.incidents, label: 'Incident model' },
        { href: DOCS_ROUTES.methodology, label: 'The detection rule' },
      ]}
    />
  );
}

export function ProveBand() {
  return (
    <Band
      id="evidence"
      labelledBy="evidence-title"
      index="05"
      verb="Prove"
      title="Timestamped evidence that survives the incident."
      copy={`A resolved incident becomes an artifact: the window, every observation inside it, the arithmetic behind the availability figures, the attribution verdict with its version, and a SHA-256 checksum over the payload. Written once, retained ${EVIDENCE.retentionDays} days, verifiable by a third party with no account.`}
      visual={<EvidenceArtifact />}
      links={[
        { href: PUBLIC_ROUTES.productEvidence, label: 'Inside a record' },
        { href: DOCS_ROUTES.verification, label: 'Verify one' },
      ]}
    />
  );
}
