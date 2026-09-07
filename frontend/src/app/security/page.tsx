import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Security - How RELIASTRA protects your data',
  description:
    'Encryption, SSRF-safe probing, session controls, organization isolation, and evidence integrity: how RELIASTRA keeps monitoring data yours.',
  path: '/security',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Security', href: '/security' },
];

export default function SecurityPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Security', path: '/security' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl('/security'),
            url: canonicalUrl('/security'),
            name: 'Security - How RELIASTRA protects your data',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
          },
        ]}
      />
      <MarketingPage
        eyebrow="Trust"
        title="Security: your monitoring data stays yours"
        lede="Encryption everywhere, SSRF-safe probing, organization isolation, and evidence integrity - the controls behind an evidence platform."
        breadcrumbs={crumbs}
        related={[
          { label: 'Privacy Policy', href: '/privacy', description: 'What we collect and why.' },
          { label: 'Terms of Service', href: '/terms', description: 'Acceptable use and liability.' },
          { label: 'Evidence docs', href: '/docs/evidence', description: 'Checksums, binding, verification.' },
          { label: 'Contact', href: '/contact', description: 'Report a security concern.' },
        ]}
      >
        <Prose>
          <h2>Encryption</h2>
          <p>
            All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Card
            details are handled by our payment provider; RELIASTRA never stores full
            card numbers.
          </p>
          <h2>Safe probing</h2>
          <p>
            Before any check request leaves, the target is resolved and validated
            against an SSRF policy that rejects private, loopback, link-local and
            metadata addresses. Blocked targets are recorded as configuration problems -
            never as vendor outages - and no request is sent.
          </p>
          <h2>Isolation</h2>
          <p>
            Organizations are strictly isolated: dependencies, incidents, evidence and
            credentials are scoped per organization and enforced server-side. Public
            Track pages show aggregated posture for vendors made public only - never
            customer endpoints, headers or credentials.
          </p>
          <h2>Evidence integrity</h2>
          <p>
            Generated reports are checksummed and bound to the producing organization.
            Public verification confirms existence and integrity without disclosing
            private configuration. Audit-log entries cover security-relevant actions.
          </p>
          <h2>Sessions and access</h2>
          <p>
            Short-lived access tokens with rotation, HttpOnly admin session cookies, and
            rate limiting on authentication and public endpoints. The admin control
            plane is a separate security domain with its own credentials.
          </p>
          <h2>What to do next</h2>
          <p>
            Read the <a href="/privacy">Privacy Policy</a>, review{' '}
            <a href="/terms">Terms</a>, or <a href="/contact">contact us</a> with
            security questions at support@reliastra.com.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
