import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Security - How RELIASTRA protects your data',
  description:
    'Encryption, SSRF-safe probing, session controls, tenant isolation and evidence integrity: how RELIASTRA keeps your monitoring data yours.',
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
        lede="Encryption, SSRF-safe probing, tenant isolation, evidence integrity."
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
            Stored secrets such as request headers are encrypted at rest. Traffic is
            served over HTTPS. Card details are handled by the payment provider;
            RELIASTRA never stores card numbers.
          </p>
          <h2>Safe probing</h2>
          <p>
            Before any check request leaves, the target is resolved and validated
            against an SSRF policy that rejects private, loopback, link-local and
            metadata addresses. Blocked targets are recorded as configuration problems -
            never as vendor outages - and no request is sent.
          </p>
          <h2>Tenant isolation</h2>
          <p>
            Dependencies, incidents, evidence and credentials are scoped per account
            and enforced server-side: one account is one tenant in the data model, and
            no route accepts a tenant identifier from the client. Public observatory
            records describe public endpoints only - never a customer&apos;s endpoints,
            headers or credentials.
          </p>
          <h2>Evidence integrity</h2>
          <p>
            Generated records are checksummed and bound to the account that produced
            them. Verification is unauthenticated and confirms existence and integrity
            without disclosing private configuration. Audit-log entries cover
            security-relevant actions.
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
