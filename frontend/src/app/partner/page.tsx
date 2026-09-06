import { PartnerPublicPage } from '@/components/partner/public/partner-page-view';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Partner Network — Earn recurring revenue',
  description:
    'Join the RELIASTRA Partner Network: refer SaaS teams and agencies, earn recurring commissions, and track referrals, earnings and payouts.',
  path: '/partner',
});

/**
 * `/partner` — the Partner Network home at a straightforward URL.
 * Server-rendered via the shared partner chrome, so the content is in the
 * initial HTML; interactivity (auth, dashboard) hydrates on top.
 */
export default function PartnerHomePage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Partner Network', path: '/partner' },
        ])}
      />
      <PartnerPublicPage page="home" />
    </>
  );
}
