import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';
import { IncidentTimeline } from '@/components/site/visuals/incident-timeline';
import { AttributionSignals } from '@/components/site/visuals/attribution-signals';

export const metadata = buildMetadata({
  title: 'Incident Evidence & Outage Attribution',
  description:
    'Prove whether an incident originated from your infrastructure or an external provider: correlated timelines, the detection record, and deterministic attribution.',
  path: '/incident-evidence',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Incident evidence', href: '/incident-evidence' },
];

export default function IncidentEvidencePage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Incident evidence', path: '/incident-evidence' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl('/incident-evidence'),
            url: canonicalUrl('/incident-evidence'),
            name: 'Incident Evidence & Outage Attribution',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
          },
        ]}
      />
      <MarketingPage
        eyebrow="Capability"
        title="Incident evidence & outage attribution"
        lede="Your site went down. Was it you, or your vendors? Correlated timelines answer, with a stated confidence."
        breadcrumbs={crumbs}
        visual={
          <div className="flex flex-col gap-12">
            <IncidentTimeline />
            <AttributionSignals />
          </div>
        }
        visualCaption="Illustrative incident. Timestamps, latency values and signal scores are an example, not a recorded event; the fields, classifications and weights are the ones the product uses."
        related={[
          { label: 'SLA evidence', href: '/sla-evidence', description: 'From attribution to credit-ready reports.' },
          { label: 'Incident attribution (glossary)', href: '/glossary/incident-attribution', description: 'The canonical definition.' },
          { label: 'The Dependency Gap', href: '/research/the-dependency-gap', description: 'Why both outage kinds look identical.' },
          { label: 'Live vendor status', href: '/track', description: 'Independent posture during incident windows.' },
        ]}
      >
        <Prose>
          <h2>Who this is for</h2>
          <p>
            On-call engineers, incident commanders and platform teams who need to route
            an active incident to the right owner in minutes - your codebase or a
            specific vendor - and defend that routing in the postmortem.
          </p>
          <h2>The core problem</h2>
          <p>
            An outage you caused and an outage your vendor caused look identical from
            inside your own monitoring. Both present as your service failing. Opening
            two tabs - your dashboard and the vendor’s status page - is weaker than it
            feels: the status page is human-written, approximate, and owned by the
            counterparty.
          </p>
          <h2>How attribution works</h2>
          <ul>
            <li><strong>Shared timeline:</strong> your incident window and the dependency’s independent observations on one axis.</li>
            <li><strong>Deterministic verdicts:</strong> persistent failure across consecutive checks confirms vendor-side degradation, and the confirmation rule is recorded in the artifact itself.</li>
            <li><strong>Confidence levels:</strong> the engine reports how strongly the timelines overlap - never a bare “vendor did it.”</li>
            <li><strong>No causation claims:</strong> correlated failure is strong evidence for where to look first, not proof of cause.</li>
          </ul>
          <h2>Practical example</h2>
          <p>
            Checkout errors spike 14:02–14:19. The payment dependency shows timeouts from
            two regions across the same window; your database and queue telemetry stay
            flat. Attribution routes the incident to the vendor, the deploy rollback is
            stood down, and the fault report attaches to the vendor ticket.
          </p>
          <h2>What to do next</h2>
          <p>
            Read <a href="/research/the-dependency-gap">the Dependency Gap</a>, configure{' '}
            <a href="/docs/monitoring">monitoring</a>, or{' '}
            <a href="/sla-evidence">compile the evidence</a>.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
