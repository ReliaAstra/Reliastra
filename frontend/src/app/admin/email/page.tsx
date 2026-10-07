import type { Metadata } from 'next';
import { EmailCenterPage } from '@/components/admin/admin-email-center';

export const metadata: Metadata = {
  title: 'Email Center',
  description: 'Design reusable outreach templates and send operational email from verified identities.',
  robots: { index: false, follow: false, noarchive: true },
};

export default function EmailCenterRoute() {
  return <EmailCenterPage />;
}
