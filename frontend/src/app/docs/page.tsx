import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';
import { DocsSideNav } from '@/components/site/docs-side-nav';

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
  { label: 'Monitoring', href: '/docs/monitoring', description: 'Endpoints, observation points, intervals, states.' },
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
        lede="Add a dependency, read its telemetry, attribute an incident, compile the evidence."
        breadcrumbs={crumbs}
        sideNav={<DocsSideNav activeHref="/docs" />}
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
        <ul className="mt-2 grid gap-x-12 sm:grid-cols-2">
          {GUIDES.map((g) => (
            <li key={g.href}>
              <a
                href={g.href}
                className="group flex flex-col gap-1.5 border-t border-[var(--ob-line)] py-5 transition-colors hover:border-[var(--ob-line-3)]"
              >
                <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                  {g.label}
                </span>
                <span className="text-[13px] leading-[1.6] text-[var(--ob-text-4)]">
                  {g.description}
                </span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <Prose>
            <h2>Concepts first?</h2>
            <p>
              The <a href="/glossary">glossary</a> defines External Dependency
              Intelligence, incident attribution, SLA evidence and telemetry - each
              with problem, example and RELIASTRA’s approach.
            </p>
          </Prose>
        </div>
      </MarketingPage>
    </>
  );
}
