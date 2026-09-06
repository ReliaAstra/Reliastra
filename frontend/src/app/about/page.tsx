import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl, organizationJsonLd } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'About — Why RELIASTRA exists',
  description:
    'RELIASTRA exists to answer one question reliably: was it you, or your vendors? The story behind External Dependency Intelligence.',
  path: '/about',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'About', href: '/about' },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'About', path: '/about' },
          ]),
        ]}
      />
      <MarketingPage
        eyebrow="Company"
        title="Was it you, or your vendors?"
        lede="RELIASTRA exists because that question decides incidents, postmortems and SLA conversations — and no existing tool answered it with evidence."
        breadcrumbs={crumbs}
        related={[
          { label: 'Research agenda', href: '/research/reliastra-research-agenda', description: 'What we publish and what we refuse to.' },
          { label: 'The Dependency Gap', href: '/research/the-dependency-gap', description: 'The problem that motivated the product.' },
          { label: 'Contact', href: '/contact', description: 'Talk to the team.' },
          { label: 'Live vendor status', href: '/track', description: 'The public face of the measurement network.' },
        ]}
      >
        <Prose>
          <h2>The observation</h2>
          <p>
            Every serious outage review contains the same unresolved argument: the
            vendor’s status page says “operational,” your dashboard says “failing,” and
            nobody kept a third record. The team with the better record wins the
            argument — and until now, that record did not exist.
          </p>
          <h2>What we build</h2>
          <p>
            An independent measurement network for third-party dependencies, a
            deterministic attribution engine that refuses to claim more than the
            timelines support, and evidence artifacts that survive the incident —
            checksummed, verifiable, and owned by the organization that generated them.
          </p>
          <h2>What we will not do</h2>
          <ul>
            <li>Publish vendor rankings without window, sample size and methodology.</li>
            <li>Present synthetic data as observations or backfill missed probes.</li>
            <li>Claim causation from correlation.</li>
            <li>Expose customer endpoints or credentials on any public surface.</li>
          </ul>
          <p>
            These commitments are stated publicly in the{' '}
            <a href="/research/reliastra-research-agenda">research agenda</a>.
          </p>
          <h2>Contact</h2>
          <p>
            Support: support@reliastra.com · Sales: sales@reliastra.com ·{' '}
            <a href="/contact">Contact page</a> · GitHub:{' '}
            <a href="https://github.com/ReliaAstra">ReliaAstra</a>.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
