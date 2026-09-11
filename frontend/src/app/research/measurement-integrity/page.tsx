import type { Metadata } from 'next';
import { SiteShell } from '@/components/site/site-shell';
import { ResearchCategoryPage } from '@/components/research/category-index';
import { canonicalUrl } from '@/lib/seo';
import { researchCategoryRoute } from '@/lib/routes';

const SLUG = 'measurement-integrity';
const PATH = researchCategoryRoute(SLUG);

export const metadata: Metadata = {
  title: 'Measurement integrity research - RELIASTRA',
  description:
    'What a reliability record actually measures and what it silently omits. Audits of published availability records, telemetry estimation defects, and the checks that expose a thin denominator - including RELIASTRA’s own public record.',
  alternates: { canonical: canonicalUrl(PATH) },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Measurement integrity - RELIASTRA Research',
    description:
      'Audits of published availability records and the telemetry defects that make them unauditable, with reproducible scripts and captured data.',
    url: canonicalUrl(PATH),
    type: 'website',
    siteName: 'RELIASTRA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Measurement integrity - RELIASTRA Research',
    description:
      'Availability records, their denominators, and the audits that expose them.',
  },
};

export default function MeasurementIntegrityCategoryPage() {
  return (
    <SiteShell>
      <ResearchCategoryPage slug={SLUG} />
    </SiteShell>
  );
}
