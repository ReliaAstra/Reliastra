import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Documentation',
  description:
    'RELIASTRA docs: quickstart, dependency monitoring, incident attribution, SLA evidence, and API reference. Indexable guides for developers and operators.',
  path: '/docs',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Docs', href: '/docs' },
];

const GUIDES = [
  { label: 'Quickstart', href: '/docs/quickstart', description: 'First dependency check in minutes.' },
  { label: 'Monitoring', href: '/docs/monitoring', description: 'Endpoints, regions, intervals, states.' },
  { label: 'Evidence', href: '/docs/evidence', description: 'Generate, share and verify fault reports.' },
  { label: 'API', href: '/docs/api', description: 'Programmatic access on Pro and above.' },
];

export default function DocsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Docs', path: '/docs' },
        ])}
      />
      <MarketingPage
        eyebrow="Documentation"
        title="Documentation"
        lede="Guides for the whole lifecycle: add a dependency, understand its telemetry, attribute an incident, and compile the evidence."
        breadcrumbs={crumbs}
        related={[
          ...GUIDES,
          { label: 'Measurement methodology', href: '/research/how-reliastra-measures-vendor-reliability', description: 'The method behind every figure.' },
          { label: 'Glossary', href: '/glossary', description: 'Definitions of every core term.' },
        ]}
      >
        <Prose>
          <h2>Start here</h2>
          <p>
            New to RELIASTRA? The <a href="/docs/quickstart">quickstart</a> takes you
            from organization to first observation in minutes. It assumes nothing
            beyond a URL you are authorized to monitor.
          </p>
          <h2>Guides</h2>
        </Prose>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {GUIDES.map((g) => (
            <li key={g.href}>
              <a
                href={g.href}
                className="block rounded-xl border border-zinc-200 p-4 transition-colors hover:border-cyan-600 dark:border-white/10 dark:hover:border-cyan-400"
              >
                <span className="text-sm font-semibold text-cyan-700 dark:text-cyan-400">{g.label}</span>
                <span className="mt-1 block text-xs text-zinc-500">{g.description}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <Prose>
            <h2>Concepts first?</h2>
            <p>
              The <a href="/glossary">glossary</a> defines External Dependency
              Intelligence, incident attribution, SLA evidence and telemetry — each
              with problem, example and RELIASTRA’s approach.
            </p>
          </Prose>
        </div>
      </MarketingPage>
    </>
  );
}
