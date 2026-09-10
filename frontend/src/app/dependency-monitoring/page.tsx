import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';
import { DependencyTopology } from '@/components/site/visuals/dependency-topology';
import { LatencyChart } from '@/components/site/visuals/latency-chart';

export const metadata = buildMetadata({
  title: 'Third-Party Dependency Monitoring',
  description:
    'Monitor any third-party API on a fixed interval with deterministically confirmed incidents. How RELIASTRA checks, what it records, and what it refuses to call an outage.',
  path: '/dependency-monitoring',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Dependency monitoring', href: '/dependency-monitoring' },
];

export default function DependencyMonitoringPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Dependency monitoring', path: '/dependency-monitoring' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl('/dependency-monitoring'),
            url: canonicalUrl('/dependency-monitoring'),
            name: 'Third-Party Dependency Monitoring',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
          },
        ]}
      />
      <MarketingPage
        eyebrow="Capability"
        title="Third-party dependency monitoring"
        lede="Any HTTP endpoint, checked on a fixed interval from infrastructure the vendor does not control. Incidents declared by a deterministic rule, not by guesswork."
        breadcrumbs={crumbs}
        visual={
          <div className="flex flex-col gap-12">
            <DependencyTopology />
            <LatencyChart />
          </div>
        }
        visualCaption="Illustrative values. Timestamps, status codes, latency and the detection rule are the ones the product records and applies."
        related={[
          { label: 'Live vendor status', href: '/track', description: 'Aggregated posture for public vendors.' },
          { label: 'Monitoring docs', href: '/docs/monitoring', description: 'Configure checks, observation points and intervals.' },
          { label: 'Measurement methodology', href: '/research/how-reliastra-measures-vendor-reliability', description: 'Scheduling, detection rules, states, limitations.' },
          { label: 'Dependency telemetry', href: '/glossary/dependency-telemetry', description: 'What every probe records.' },
        ]}
      >
        <Prose>
          <h2>Who this is for</h2>
          <p>
            Teams whose product depends on external APIs, SaaS webhooks, auth providers or
            cloud endpoints - and who currently learn about vendor degradation from users,
            not from monitoring.
          </p>
          <h2>What it covers</h2>
          <p>
            API dependency monitoring, SaaS dependency monitoring, external API monitoring
            and dependency performance monitoring are the same practice at different
            scopes: request the endpoint like your product does, record what happened,
            and require the failure to persist before alerting.
          </p>
          <h2>How checks run</h2>
          <ul>
            <li><strong>Scheduled, not sampled on demand:</strong> one task per dependency per configured observation label per interval, via broker to workers.</li>
            <li><strong>Outside the vendor:</strong> every check resolves and connects from RELIASTRA infrastructure, and every result carries the label it ran under.</li>
            <li><strong>Deterministic verdicts:</strong> a fixed number of consecutive failures declares an incident; consecutive successes clear it. The same inputs always produce the same decision.</li>
            <li><strong>Validated targets:</strong> SSRF policy rejects private/loopback/link-local/metadata addresses - recorded as policy blocks, never as vendor outages.</li>
            <li><strong>Explicit states:</strong> target problems, infrastructure problems and transitional states are distinct, because they have different owners.</li>
          </ul>
          <h2>What a missed probe means</h2>
          <p>
            If the scheduler, broker or a worker is unavailable, checks do not run - and
            the system reports that. A missed probe is never backfilled with a synthesised
            result. An observation that did not happen must never appear in a history you
            intend to rely on.
          </p>
          <h2>Plan limits (enforced server-side)</h2>
          <ul>
            <li><strong>Free:</strong> 3 dependencies · 1-minute checks · 24-hour retention · email alerts.</li>
            <li><strong>Pro:</strong> 50 dependencies · 15-second checks · 90-day retention · Slack + API + attribution + evidence.</li>
            <li><strong>Enterprise:</strong> custom scale, client isolation, white-label reporting.</li>
          </ul>
          <h2>What to do next</h2>
          <p>
            Follow the <a href="/docs/quickstart">quickstart</a>, browse{' '}
            <a href="/track">live vendor posture</a>, or see how observations become{' '}
            <a href="/incident-evidence">attributed incidents</a>.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
