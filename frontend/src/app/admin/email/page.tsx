import type { Metadata } from 'next';
import { EmailCenterPage } from '@/components/admin/admin-email-center';

export const metadata: Metadata = {
  title: 'Email Center',
  description: 'Send operational and business emails from verified Reliastra sender identities.',
  robots: { index: false, follow: false, noarchive: true },
};

export default function EmailCenterRoute() {
  return <EmailCenterPage />;
}
