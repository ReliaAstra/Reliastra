import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'External Dependency Intelligence',
  description:
    'What External Dependency Intelligence is: independently observed knowledge about third-party services - and why it replaces vendor status pages as the record of what happened.',
  path: '/external-dependency-intelligence',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'External Dependency Intelligence', href: '/external-dependency-intelligence' },
];

export default function EdiPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'External Dependency Intelligence', path: '/external-dependency-intelligence' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl('/external-dependency-intelligence'),
            url: canonicalUrl('/external-dependency-intelligence'),
            name: 'External Dependency Intelligence',
            description:
              'The category: independent, timestamped knowledge about third-party dependencies.',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
          },
        ]}
      />
      <MarketingPage
        eyebrow="Category"
        title="External Dependency Intelligence"
        lede="Independently observed, timestamped knowledge about the third-party services your infrastructure depends on - the record that answers “was it us or them?”"
        breadcrumbs={crumbs}
        related={[
          { label: 'Dependency monitoring', href: '/dependency-monitoring', description: 'How the observations are produced.' },
          { label: 'Incident attribution', href: '/incident-evidence', description: 'How observations become answers.' },
          { label: 'Concept definition', href: '/glossary/external-dependency-intelligence', description: 'The canonical glossary entry.' },
          { label: 'The Dependency Gap', href: '/research/the-dependency-gap', description: 'Why the gap exists and what closes it.' },
        ]}
      >
        <Prose>
          <h2>Definition</h2>
          <p>
            <strong>External Dependency Intelligence</strong> is the continuous observation of
            third-party APIs and services - from outside both your stack and the vendor’s -
            turned into attributable, timestamped records of behavior. Status pages describe
            intent; intelligence describes behavior.
          </p>
          <h2>Why it matters</h2>
          <p>
            Modern products are compositions of vendors: payments, auth, messaging, AI
            inference, cloud primitives. A monitoring system that watches only your own
            services has a blind spot shaped exactly like your dependency graph. When
            checkout fails, the alert says checkout is failing - not whether the cause is
            your deploy or the provider’s outage.
          </p>
          <h2>How it differs from uptime monitoring</h2>
          <ul>
            <li><strong>Subject:</strong> uptime monitoring watches your services; dependency intelligence watches your vendors.</li>
            <li><strong>Origin:</strong> probes run from independent regions on infrastructure the vendor does not control.</li>
            <li><strong>Verdict:</strong> quorum across regions, not a single failed request.</li>
            <li><strong>Artifact:</strong> checksummed fault reports, not screenshots.</li>
          </ul>
          <h2>How RELIASTRA produces it</h2>
          <p>
            Fixed-interval checks per dependency per region, every result stored with region
            and timestamp, quorum-confirmed incidents, deterministic correlation against
            your own incident history, and verifiable <a href="/sla-evidence">SLA evidence</a>.
            The full method is published in{' '}
            <a href="/research/how-reliastra-measures-vendor-reliability">how RELIASTRA measures vendor reliability</a> -
            including the cases we deliberately refuse to call an outage.
          </p>
          <h2>Practical example</h2>
          <p>
            At 14:02 your error rate spikes. Regional probes show the payment API timing out
            from two regions over the same window while your database latency is flat. The
            investigation starts at the vendor, the rollback is cancelled, and the credit
            conversation opens with a timestamped record instead of a theory.
          </p>
          <h2>What to do next</h2>
          <p>
            See it live on <a href="/track">Track</a>, understand{' '}
            <a href="/dependency-monitoring">dependency monitoring</a>, or{' '}
            <a href="/product">how the platform fits together</a>.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
