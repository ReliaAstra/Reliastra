import type { Metadata } from 'next';
import { DashboardProviders } from '@/components/dashboard/shell/providers';
import { AppShell } from '@/components/dashboard/shell/app-shell';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProviders>
      <AppShell>{children}</AppShell>
    </DashboardProviders>
  );
}
