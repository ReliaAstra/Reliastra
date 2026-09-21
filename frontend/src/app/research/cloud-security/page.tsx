import type { Metadata } from 'next';
import { SiteShell } from '@/components/site/site-shell';
import { ResearchCategoryPage } from '@/components/research/category-index';
import { canonicalUrl, DISCOVERY_ALTERNATES } from '@/lib/seo';
import { researchCategoryRoute } from '@/lib/routes';
import { robotsDirective } from '@/lib/indexability';

const SLUG = 'cloud-security';
const PATH = researchCategoryRoute(SLUG);

export const metadata: Metadata = {
  title: 'Cloud & AI infrastructure security research - RELIASTRA',
  description:
    'Trust boundaries, failure domains and attack surface in architectures that depend on cloud control planes and hosted model APIs. Architecture analysis for cloud security and AI infrastructure engineers.',
  alternates: { canonical: canonicalUrl(PATH), ...DISCOVERY_ALTERNATES },
  robots: robotsDirective({ index: true, follow: true }),
  openGraph: {
    title: 'Cloud & AI infrastructure security - RELIASTRA Research',
    description:
      'Trust boundaries and failure domains across third-party cloud and model-API dependencies.',
    url: canonicalUrl(PATH),
    type: 'website',
    siteName: 'RELIASTRA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cloud & AI infrastructure security - RELIASTRA Research',
    description:
      'Trust boundaries and failure domains across third-party cloud and model-API dependencies.',
  },
};

export default function CloudSecurityCategoryPage() {
  return (
    <SiteShell>
      <ResearchCategoryPage slug={SLUG} />
    </SiteShell>
  );
}
