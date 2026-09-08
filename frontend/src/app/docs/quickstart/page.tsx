import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Quickstart - First check in minutes',
  description:
    'Create an organization, add your first dependency, and read your first observations. The fastest path to independent vendor evidence.',
  path: '/docs/quickstart',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Docs', href: '/docs' },
  { name: 'Quickstart', href: '/docs/quickstart' },
];

export default function QuickstartPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Docs', path: '/docs' },
            { name: 'Quickstart', path: '/docs/quickstart' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: 'RELIASTRA quickstart: first dependency check',
            description: 'From organization to first observation in minutes.',
            step: [
              { '@type': 'HowToStep', name: 'Create an organization', text: 'Sign up; a 14-day Pro trial starts automatically, no card required.' },
              { '@type': 'HowToStep', name: 'Add a dependency', text: 'Paste an endpoint URL you are authorized to monitor, pick regions and interval.' },
              { '@type': 'HowToStep', name: 'Read observations', text: 'Checks start on the next tick; latency, status and outcome appear per region.' },
              { '@type': 'HowToStep', name: 'Report an incident to correlate', text: 'Log your own incident window to compare against vendor observations.' },
            ],
          },
        ]}
      />
      <MarketingPage
        eyebrow="Docs · Quickstart"
        title="First check in minutes"
        lede="From signup to independent observations: four steps, no credit card, nothing to install."
        breadcrumbs={crumbs}
        related={[
          { label: 'Monitoring docs', href: '/docs/monitoring', description: 'Regions, intervals, states in depth.' },
          { label: 'Evidence docs', href: '/docs/evidence', description: 'Turn observations into reports.' },
          { label: 'Pricing', href: '/pricing', description: 'What the trial includes.' },
        ]}
      >
        <Prose>
          <h2>1. Create an organization</h2>
          <p>
            <a href="/signup">Sign up</a>. A 14-day Pro trial starts automatically -
            every feature, every region, no card. Verify your email when prompted;
            unverified addresses cannot hold a session.
          </p>
          <h2>2. Add a dependency</h2>
          <p>
            Paste an endpoint URL you are authorized to test, choose the HTTP method
            and expected response, pick regions and a check interval (Free: 1 minute;
            Pro: down to 15 seconds). Only monitor systems you own or operate - see{' '}
            <a href="/terms">acceptable use</a>.
          </p>
          <h2>3. Read your first observations</h2>
          <p>
            Checks start on the next scheduler tick. Each observation records timestamp,
            region, latency, status code and outcome. Disagreeing regions are
            information, not noise: they separate vendor-wide failure from path problems.
          </p>
          <h2>4. Correlate your first incident</h2>
          <p>
            When your service degrades, log the incident window and compare it against
            the dependency timeline. Overlap across regions is the attribution signal -
            see <a href="/incident-evidence">incident evidence</a>.
          </p>
          <h2>Next</h2>
          <p>
            Configure alerting in <a href="/docs/monitoring">monitoring</a>, then learn
            to <a href="/docs/evidence">generate evidence</a> when a vendor fails.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
