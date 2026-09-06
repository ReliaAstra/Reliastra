import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Monitoring docs — Checks, regions, states',
  description:
    'Configure RELIASTRA dependency monitoring: endpoints, regions, intervals, quorum incidents, the nine-state taxonomy, and retention.',
  path: '/docs/monitoring',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Docs', href: '/docs' },
  { name: 'Monitoring', href: '/docs/monitoring' },
];

export default function MonitoringDocsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Docs', path: '/docs' },
          { name: 'Monitoring', path: '/docs/monitoring' },
        ])}
      />
      <MarketingPage
        eyebrow="Docs · Monitoring"
        title="Monitoring: checks, regions, states"
        lede="How to configure dependencies and read what the network reports — including the states that mean “we could not run the probe.”"
        breadcrumbs={crumbs}
        related={[
          { label: 'Quickstart', href: '/docs/quickstart', description: 'First check in minutes.' },
          { label: 'Evidence docs', href: '/docs/evidence', description: 'From observations to reports.' },
          { label: 'Measurement methodology', href: '/research/how-reliastra-measures-vendor-reliability', description: 'The method behind the behavior.' },
          { label: 'Dependency monitoring', href: '/dependency-monitoring', description: 'The capability overview.' },
        ]}
      >
        <Prose>
          <h2>Adding a dependency</h2>
          <p>
            Each dependency is an endpoint you are authorized to test: URL, HTTP
            method, headers and the expected response. Targets resolve and validate
            against the SSRF policy before any request leaves — private, loopback,
            link-local and metadata addresses are rejected and recorded as policy
            blocks, never as vendor outages.
          </p>
          <h2>Regions and intervals</h2>
          <p>
            One scheduler dispatches one task per dependency per region per interval
            through a message broker to workers. Free: 1-minute checks. Pro: down to
            15 seconds. Each region resolves and connects independently, and every
            stored result carries its origin region.
          </p>
          <h2>Incidents need quorum</h2>
          <p>
            A single failed request is never an incident. Declaration requires
            failures across more than one region inside a short correlation window;
            recovery requires consecutive successes. The window and region count are
            fixed so the same evidence produces the same verdict everywhere.
          </p>
          <h2>The state taxonomy</h2>
          <ul>
            <li><strong>Target problems:</strong> the probe reached the vendor and it failed, or the target was policy-blocked.</li>
            <li><strong>Infrastructure problems:</strong> dispatch failed or the scheduler was not proven alive — no probe could have run.</li>
            <li><strong>Transitional:</strong> never checked, awaiting schedule, queued, or executing.</li>
          </ul>
          <p>
            A timeout, a policy block, a worker outage and a dead scheduler are four
            distinct states with four different owners. An empty chart never silently
            means “vendor down.”
          </p>
          <h2>Retention</h2>
          <p>
            Check history retention follows the plan — 24 hours on Free, up to 90 days
            on Pro, custom on Enterprise — pruned by scheduled jobs, never kept
            indefinitely or backfilled when probes are missed.
          </p>
          <h2>Next</h2>
          <p>
            When a vendor fails, <a href="/docs/evidence">generate the evidence</a>;
            to automate, see the <a href="/docs/api">API docs</a>.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
