import type { Metadata } from 'next';
import { DashboardProviders } from '@/components/dashboard/shell/providers';
import { ConsoleShell } from '@/components/console/console-shell';

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false, noarchive: true },
};

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProviders>
      <ConsoleShell>{children}</ConsoleShell>
    </DashboardProviders>
  );
}
