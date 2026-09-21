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
 * The method, in three bands. Each band is one thing the product does for
 * you, said in a sentence a buyer repeats in a meeting, plus the technical
 * visual that proves the sentence. The visuals are the same server-rendered
 * figures the product pages use: illustrative values, real schema, marked
 * as such.
 *
 * Bands are sized as sections, not as chapters: no numbered spine, no
 * full-viewport minimum height, no uppercase poster titles.
 */

function Band({
  id,
  eyebrow,
  title,
  copy,
  visual,
  links,
  labelledBy,
}: {
  id: string;
  eyebrow: string;
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
      <Container className="grid content-center gap-12 py-20 md:py-24 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div className="flex flex-col gap-5">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id={labelledBy} className="ob-scene-title max-w-[22ch]">
            {title}
          </h2>
          <p className="ob-body-lg max-w-[52ch]">{copy}</p>
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
      eyebrow="Continuous observation"
      title="See what your dependencies are actually doing."
      copy={`Every endpoint you register is checked every ${PROBE_INTERVAL_SECONDS} seconds from infrastructure that is neither yours nor the vendor's. Each check writes a row you keep: timestamp, status, latency, verdict. ${OBSERVATION_LABEL} is the observation point today, and every record says so.`}
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
      eyebrow="Incident correlation"
      title="Their outage and your incident, on one timeline."
      copy={`Failed checks are replayed against your incident window. ${DETECTION.failureChecks} consecutive failures open an incident, ${DETECTION.recoveryChecks} consecutive successes close it, and the same rule identifier travels on every record, so anyone can see why an incident was called.`}
      visual={<IncidentTimeline />}
      links={[
        { href: DOCS_ROUTES.incidents, label: 'Incident model' },
        { href: DOCS_ROUTES.methodology, label: 'Detection rule' },
      ]}
    />
  );
}

export function ProveBand() {
  return (
    <Band
      id="evidence"
      labelledBy="evidence-title"
      eyebrow="Verifiable evidence"
      title="Evidence that still verifies after the incident closes."
      copy={`A resolved incident becomes a signed record: the window, every observation inside it, the availability arithmetic, the attribution verdict, and a SHA-256 checksum over the payload. Retained ${EVIDENCE.retentionDays} days, verifiable by anyone, no account required.`}
      visual={<EvidenceArtifact />}
      links={[
        { href: PUBLIC_ROUTES.productEvidence, label: 'Inside a record' },
        { href: DOCS_ROUTES.verification, label: 'Verify one' },
      ]}
    />
  );
}
