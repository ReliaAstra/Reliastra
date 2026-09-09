import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo';
import { DocsSideNav } from '@/components/site/docs-side-nav';

export const metadata = buildMetadata({
  title: 'API docs - Programmatic access',
  description:
    'RELIASTRA API overview: versioned /v1 endpoints for dependencies, incidents, evidence and public vendor data. Available on Pro and above.',
  path: '/docs/api',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Docs', href: '/docs' },
  { name: 'API', href: '/docs/api' },
];

export default function ApiDocsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Docs', path: '/docs' },
          { name: 'API', path: '/docs/api' },
        ])}
      />
      <MarketingPage
        eyebrow="Docs · API"
        title="API: programmatic access"
        lede="Versioned /v1 endpoints for dependencies, incidents, evidence and public vendor data - for Pro organizations and above."
        breadcrumbs={crumbs}
        sideNav={<DocsSideNav activeHref="/docs/api" />}
        related={[
          { label: 'Monitoring docs', href: '/docs/monitoring', description: 'The resources the API manages.' },
          { label: 'Evidence docs', href: '/docs/evidence', description: 'Reports via UI and API.' },
          { label: 'Live vendor status', href: '/track', description: 'Public data the API also serves.' },
          { label: 'Security', href: '/security', description: 'Tokens, scopes, isolation.' },
        ]}
      >
        <Prose>
          <h2>Base and versioning</h2>
          <p>
            The API is versioned under <code>/v1</code>. The frontend proxies
            same-origin calls; direct integrations authenticate with bearer
            organization tokens. Breaking contract changes are recorded in the
            backend API changelog.
          </p>
          <h2>Capabilities</h2>
          <ul>
            <li><strong>Dependencies:</strong> create, list, update and remove monitored endpoints with regions and intervals.</li>
            <li><strong>Incidents:</strong> report your own incident windows for correlation against vendor observations.</li>
            <li><strong>Evidence:</strong> generate fault reports from retained telemetry and mint verification references.</li>
            <li><strong>Public vendors:</strong> rate-limited, cached catalog, per-vendor detail and public incidents - the same source that powers <a href="/track">Track</a>.</li>
          </ul>
          <h2>Auth and limits</h2>
          <p>
            Organization-scoped bearer tokens; plan limits (dependency count,
            intervals, retention, evidence and API flags) are enforced server-side.
            Authenticated customer and admin surfaces are never part of the public
            index - see <a href="/security">security</a>.
          </p>
          <h2>Interactive reference</h2>
          <p>
            The deployed API serves interactive references at <code>/api-docs</code>{' '}
            (Swagger UI) and <code>/api-redoc</code> (ReDoc) on the API host, with the
            machine-readable spec at <code>/openapi.json</code>. The apex{' '}
            <code>/docs/*</code> namespace is product documentation. For integration
            help write to{' '}
            <a href="mailto:support@reliastra.com">support@reliastra.com</a>.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
