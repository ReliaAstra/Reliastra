import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'SLA Evidence & Outage Proof',
  description:
    'Turn vendor outages into timestamped, checksummed SLA evidence: independent multi-region observations, correlated impact, and credit-ready fault reports.',
  path: '/sla-evidence',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'SLA evidence', href: '/sla-evidence' },
];

export default function SlaEvidencePage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'SLA evidence', path: '/sla-evidence' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl('/sla-evidence'),
            url: canonicalUrl('/sla-evidence'),
            name: 'SLA Evidence & Outage Proof',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
          },
        ]}
      />
      <MarketingPage
        eyebrow="Capability"
        title="SLA evidence & outage proof"
        lede="When a vendor fails, bring a timestamped, independently measured record to the credit conversation - not screenshots."
        breadcrumbs={crumbs}
        related={[
          { label: 'Incident evidence', href: '/incident-evidence', description: 'Attribution: was it you or the vendor?' },
          { label: 'Evidence docs', href: '/docs/evidence', description: 'Generate, share and verify reports.' },
          { label: 'SLA evidence (glossary)', href: '/glossary/sla-evidence', description: 'The canonical definition.' },
          { label: 'Pricing', href: '/pricing', description: 'Evidence generation is a Pro capability.' },
        ]}
      >
        <Prose>
          <h2>Who this is for</h2>
          <p>
            Anyone who pays for a vendor SLA - SaaS operators, platform teams, agencies
            billing clients for reliability - and has learned that claiming credits with
            “the site was down for a while” goes nowhere.
          </p>
          <h2>Why vendors honor structured evidence</h2>
          <p>
            Credit decisions belong to the vendor and your contract. What changes the
            outcome is the quality of the record: per-minute observations from regions
            the vendor does not control, an exact degradation window in UTC, correlated
            customer impact, and a checksum binding the report to your organization.
          </p>
          <h2>What a report contains</h2>
          <ul>
            <li>Dependency, failure window (UTC), and severity.</li>
            <li>Per-region observation timeline: latency, status codes, outcomes.</li>
            <li>Quorum verdict and methodology reference.</li>
            <li>Correlated customer impact from your incident history.</li>
            <li>Computed credit figure under your plan’s SLA clause.</li>
            <li>SHA-256 checksum and public verification reference.</li>
          </ul>
          <h2>What verification discloses - and what it never does</h2>
          <p>
            The public verification endpoint confirms a report exists and matches its
            checksum. It never discloses endpoints, headers, credentials or account
            details. Reports belong to the organization that generated them and are
            exposed publicly only through explicit share links.
          </p>
          <h2>Honest scope</h2>
          <p>
            Evidence documents observed behavior; it is not by itself a legal
            determination of fault or a contractual credit - those remain governed by
            your agreements. RELIASTRA reports correlation and leaves causation to the
            engineers reading the timeline.
          </p>
          <h2>What to do next</h2>
          <p>
            Read the <a href="/docs/evidence">evidence docs</a>, see{' '}
            <a href="/incident-evidence">how attribution works</a>, or{' '}
            <a href="/pricing">upgrade to Pro</a> to generate reports.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
