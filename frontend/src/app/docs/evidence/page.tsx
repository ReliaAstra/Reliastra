import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo';
import { DocsSideNav } from '@/components/site/docs-side-nav';

export const metadata = buildMetadata({
  title: 'Evidence docs - Generate, share, verify',
  description:
    'Generate External Dependency Fault Reports from retained telemetry: what they contain, how checksums bind them, and how verification works.',
  path: '/docs/evidence',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Docs', href: '/docs' },
  { name: 'Evidence', href: '/docs/evidence' },
];

export default function EvidenceDocsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Docs', path: '/docs' },
          { name: 'Evidence', path: '/docs/evidence' },
        ])}
      />
      <MarketingPage
        eyebrow="Docs · Evidence"
        title="Evidence: generate, share, verify"
        lede="Turn a failure window into a checksummed fault report your vendor, your postmortem and your contract can all reference."
        breadcrumbs={crumbs}
        sideNav={<DocsSideNav activeHref="/docs/evidence" />}
        related={[
          { label: 'SLA evidence', href: '/sla-evidence', description: 'The capability overview.' },
          { label: 'Incident evidence', href: '/incident-evidence', description: 'Attribution before compilation.' },
          { label: 'Monitoring docs', href: '/docs/monitoring', description: 'The telemetry reports are built from.' },
          { label: 'Fault report (glossary)', href: '/glossary/external-dependency-fault-report', description: 'What the artifact is.' },
        ]}
      >
        <Prose>
          <h2>When to generate</h2>
          <p>
            On detection or on demand: pick the dependency and the window (UTC).
            Reports compile from retained telemetry - per-region observations,
            quorum verdict, correlated customer impact - so generate before
            retention prunes the window (24h Free, 90 days Pro).
          </p>
          <h2>What a report contains</h2>
          <ul>
            <li>Dependency, window, severity, and methodology reference.</li>
            <li>Per-region timeline: latency, status codes, outcomes.</li>
            <li>Quorum verdict with confidence framing (correlation, not causation).</li>
            <li>Correlated incidents from your own history.</li>
            <li>Organization binding and SHA-256 checksum.</li>
          </ul>
          <h2>Sharing</h2>
          <p>
            Reports belong to the organization that generated them. They become
            public only through explicit share links or verification references the
            organization creates - token-scoped URLs that are deliberately excluded
            from the sitemap and carry noindex.
          </p>
          <h2>Verification</h2>
          <p>
            The public verification reference confirms a report exists and matches
            its checksum. It discloses no endpoints, headers, credentials or
            account details - integrity without exposure.
          </p>
          <h2>Scope honesty</h2>
          <p>
            A report documents observed behavior. It is not a legal determination
            of fault or a contractual credit; those remain governed by your vendor
            agreements. Bring the record - the contract decides the outcome.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
