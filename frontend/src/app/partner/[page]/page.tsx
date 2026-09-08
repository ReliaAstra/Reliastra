import { PartnerSession } from '@/components/partner/dashboard/partner-session';
import { PARTNER_DASHBOARD_PAGES } from '@/lib/routes';
import { notFound } from 'next/navigation';
import { PartnerPublicPage } from '@/components/partner/public/partner-page-view';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, buildMetadata } from '@/lib/seo';
import {
  PARTNER_INDEXABLE_SLUGS,
  PARTNER_ROUTE_SLUGS,
  isPartnerRouteSlug,
  partnerRouteUrl,
  type PartnerRouteSlug,
} from '@/lib/routes';
import type { PartnerPage } from '@/types/partner';

export function generateStaticParams() {
  return PARTNER_ROUTE_SLUGS.map((slug) => ({ page: slug }));
}

const TITLES: Record<string, { title: string; description: string }> = {
  earn: {
    title: 'Earn - Partner Network',
    description: 'How RELIASTRA partners earn recurring commissions for every referred subscription.',
  },
  'how-it-works': {
    title: 'How It Works - Partner Network',
    description: 'How the RELIASTRA Partner Network works: apply, refer, track, get paid.',
  },
  commission: {
    title: 'Commission - Partner Network',
    description: 'Commission structure, hold periods, payout minimums and reversals.',
  },
  faq: {
    title: 'FAQ - Partner Network',
    description:
      'Common questions about the RELIASTRA Partner Network: eligibility, attribution windows, commission and payouts.',
  },
  resources: {
    title: 'Resources - Partner Network',
    description:
      'Sales collateral, technical references and positioning material for RELIASTRA partners.',
  },
  login: {
    title: 'Partner sign in',
    description:
      'Sign in to the RELIASTRA Partner Network dashboard to track referrals, commission and payouts.',
  },
  signup: {
    title: 'Join as partner',
    description:
      'Apply to the RELIASTRA Partner Network and earn recurring commission on every subscription you refer.',
  },
  'forgot-password': {
    title: 'Reset partner password',
    description:
      'Request a password reset link for your RELIASTRA Partner Network account.',
  },
  support: {
    title: 'Partner support',
    description:
      'Contact RELIASTRA partner support about referrals, attribution, commission or payouts.',
  },
  privacy: {
    title: 'Partner privacy',
    description:
      'How referral, attribution and commission data is collected and handled in the RELIASTRA Partner Network.',
  },
  terms: {
    title: 'Partner terms',
    description:
      'The terms governing participation in the RELIASTRA Partner Network, including commission, hold periods and reversals.',
  },
};

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if ((PARTNER_DASHBOARD_PAGES as readonly string[]).includes(page)) return { title: 'Partner dashboard | RELIASTRA', robots: { index: false, follow: false } };
  if (!isPartnerRouteSlug(page)) return { title: 'Not found | RELIASTRA' };
  const copy = TITLES[page] ?? { title: 'Partner Network', description: 'The RELIASTRA Partner Network.' };
  const indexable = (PARTNER_INDEXABLE_SLUGS as readonly string[]).includes(page);
  return buildMetadata({
    title: copy.title,
    description: copy.description,
    path: partnerRouteUrl(page),
    noindex: !indexable,
  });
}

/**
 * Straightforward partner URLs: every public partner page (plus the program
 * legal pages) resolves at `/partner/<slug>`. Unknown slugs 404 - they never
 * silently render the home page, which would hide broken links.
 */
export default async function PartnerSlugPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if ((PARTNER_DASHBOARD_PAGES as readonly string[]).includes(page)) return <PartnerSession page={page as PartnerPage} />;
  if (!isPartnerRouteSlug(page)) notFound();

  const slug = page as PartnerRouteSlug;
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Partner Network', path: '/partner' },
          { name: slug, path: partnerRouteUrl(slug) },
        ])}
      />
      <PartnerPublicPage page={slug as PartnerPage} />
    </>
  );
}
