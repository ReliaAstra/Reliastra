import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Product - External Dependency Intelligence platform',
  description:
    'How RELIASTRA works: multi-region dependency checks, quorum-confirmed incidents, deterministic attribution, and verifiable SLA evidence - in one platform.',
  path: '/product',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Product', href: '/product' },
];

export default function ProductPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Product', path: '/product' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl('/product'),
            url: canonicalUrl('/product'),
            name: 'Product - External Dependency Intelligence platform',
            description:
              'How RELIASTRA monitors dependencies, attributes incidents, and generates SLA evidence.',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
          },
        ]}
      />
      <MarketingPage
        eyebrow="Product"
        title="The platform that watches your vendors"
        lede="Independent monitoring of the external APIs your product depends on. Failures correlated with your incidents. Evidence of what happened."
        breadcrumbs={crumbs}
        related={[
          { label: 'External Dependency Intelligence', href: '/external-dependency-intelligence', description: 'The category RELIASTRA defines and owns.' },
          { label: 'Dependency monitoring', href: '/dependency-monitoring', description: 'How checks, regions and quorum work.' },
          { label: 'SLA evidence', href: '/sla-evidence', description: 'From observations to credit-ready reports.' },
          { label: 'Live vendor status', href: '/track', description: 'Independent posture for public vendors.' },
        ]}
      >
        <Prose>
          <h2>Who this is for</h2>
          <p>
            SaaS teams whose product breaks when a payment, auth, messaging, AI or cloud API
            degrades - and agencies that operate customer infrastructure and need to show
            clients exactly which dependency failed. If your incident reviews ever end with
            “we think it was the vendor,” this is the record that replaces “we think.”
          </p>
          <h2>What problem it solves</h2>
          <p>
            Your own monitoring reports that <em>your</em> service is failing. It cannot say
            whether the cause is your code or a provider three hops away whose status page
            still reads “operational.” That ambiguity decides where engineers look first,
            what gets rolled back, and whether an SLA claim succeeds.
          </p>
          <h2>How it works</h2>
          <h3>1. Monitor every dependency directly</h3>
          <p>
            Add any HTTP endpoint. One scheduler dispatches one check task per dependency
            per region through a message broker to workers - never inside the API process,
            so a busy dashboard cannot delay a probe. Every result carries its region,
            timestamp, latency, status code and outcome. See{' '}
            <a href="/dependency-monitoring">dependency monitoring</a> and{' '}
            <a href="/docs/monitoring">monitoring docs</a>.
          </p>
          <h3>2. Declare incidents by quorum, not by single failure</h3>
          <p>
            A single failed request is never an incident. Declaration requires failures
            across more than one region inside a short window; recovery requires
            consecutive successes. The same evidence produces the same verdict everywhere.
          </p>
          <h3>3. Attribute with a deterministic engine</h3>
          <p>
            Your incident history and the dependency’s observation history share one
            timeline. The correlation engine reports overlap with confidence levels -{' '}
            <a href="/incident-evidence">incident evidence</a>, never claimed causation.
          </p>
          <h3>4. Generate evidence you can submit</h3>
          <p>
            Timestamped, checksummed fault reports bind the observation window to your
            organization. A public verification reference confirms existence and integrity
            without disclosing endpoints or credentials. See{' '}
            <a href="/sla-evidence">SLA evidence</a> and <a href="/docs/evidence">evidence docs</a>.
          </p>
          <h2>What data supports it</h2>
          <p>
            Live aggregated posture for public vendors on <a href="/track">Track</a>,
            the published <a href="/research/how-reliastra-measures-vendor-reliability">measurement methodology</a>,
            and the <a href="/research/reliastra-research-agenda">research agenda</a> that
            states what we will and will not publish.
          </p>
          <h2>What to do next</h2>
          <p>
            <a href="/signup">Start free</a> (3 dependencies, 1-minute checks), read the{' '}
            <a href="/docs/quickstart">quickstart</a>, or compare{' '}
            <a href="/pricing">plans</a>.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
