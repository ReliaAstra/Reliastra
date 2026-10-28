import type { Metadata } from 'next';
import { ProspectAiPage } from '@/components/admin/admin-prospect-ai';

export const metadata: Metadata = {
  title: 'Prospect AI',
  description: 'Import prospect research reports and generate AI first-touch outreach drafts for review.',
  robots: { index: false, follow: false, noarchive: true },
};

export default function ProspectAiRoute() {
  return <ProspectAiPage />;
}
