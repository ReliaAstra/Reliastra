import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo';
import { DocsSideNav } from '@/components/site/docs-side-nav';

export const metadata = buildMetadata({
  title: 'Monitoring docs - Checks, observation points, states',
  description:
    'Configure RELIASTRA dependency monitoring: endpoints, observation points, intervals, deterministic incident rules, the nine-state taxonomy, and retention.',
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
        title="Monitoring: checks, observation points, states"
        lede="How to configure dependencies and read what the network reports - including the states that mean “we could not run the probe.”"
        breadcrumbs={crumbs}
        sideNav={<DocsSideNav activeHref="/docs/monitoring" />}
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
            against the SSRF policy before any request leaves - private, loopback,
            link-local and metadata addresses are rejected and recorded as policy
            blocks, never as vendor outages.
          </p>
          <h2>Observation points and intervals</h2>
          <p>
            One scheduler dispatches one task per dependency per configured
            observation label per interval through a message broker to workers.
            Free: 1-minute checks. Pro: down to 15 seconds. Each scheduled check
            resolves and connects on its own, and every stored result carries the
            label it ran under. RELIASTRA currently operates a single observation
            point, so those labels are scheduling slots on one worker rather than
            independent geographic vantage points - the console says so rather
            than implying a fleet.
          </p>
          <h2>Incidents need persistence</h2>
          <p>
            A single failed request is never an incident. Declaration requires a
            fixed number of consecutive failed checks; recovery requires
            consecutive successes. The thresholds are configuration, not
            heuristics: there is no timing guess, no randomness and no vote
            between regions, so the same evidence produces the same verdict
            everywhere. The rule that fired is recorded on the incident and
            reproduced in the evidence report.
          </p>
          <h2>The state taxonomy</h2>
          <ul>
            <li><strong>Target problems:</strong> the probe reached the vendor and it failed, or the target was policy-blocked.</li>
            <li><strong>Infrastructure problems:</strong> dispatch failed or the scheduler was not proven alive - no probe could have run.</li>
            <li><strong>Transitional:</strong> never checked, awaiting schedule, queued, or executing.</li>
          </ul>
          <p>
            A timeout, a policy block, a worker outage and a dead scheduler are four
            distinct states with four different owners. An empty chart never silently
            means “vendor down.”
          </p>
          <h2>Retention</h2>
          <p>
            Check history retention follows the plan - 24 hours on Free, up to 90 days
            on Pro, custom on Enterprise - pruned by scheduled jobs, never kept
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
