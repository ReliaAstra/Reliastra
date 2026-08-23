'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { TopBar } from './top-bar';
import { MobileSidebar, Sidebar } from './sidebar';
import { CommandPalette } from './command-palette';
import { HelpButton } from './help-button';
import { EvidenceGateModal, UpgradeModal } from './upgrade-modal';
import { OnboardingChecklist } from './onboarding';
import { AddDependencyPanel } from './add-dependency';
import { AppErrorBoundary } from './error-boundary';

export function AppShell({ children }: { children: ReactNode }) {
  const online = useAppStore((s) => s.online);
  const pathname = usePathname();
  const pushRecent = useAppStore((s) => s.pushRecent);

  useEffect(() => {
    const labels: Record<string, string> = {
      '/dashboard': 'Dashboard',
      '/dependencies': 'Dependencies',
      '/incidents': 'Incidents',
      '/evidence': 'Evidence',
      '/settings': 'Settings',
      '/settings/billing': 'Billing',
    };
    const label = labels[pathname] || pathname.split('/').filter(Boolean).slice(-1)[0];
    if (label) pushRecent({ href: pathname, label });
  }, [pathname, pushRecent]);

  return (
    <AppErrorBoundary>
      <div className="rs-app min-h-screen bg-rs-base text-rs-text">
        {!online && (
          <div className="fixed inset-x-0 top-14 z-[45] border-b border-rs-degraded/30 bg-rs-degraded/10 px-6 py-2 text-center text-sm text-rs-degraded">
            You are offline. Actions will retry when the connection returns.
          </div>
        )}
        <TopBar />
        <Sidebar />
        <MobileSidebar />
        <main className="min-h-[calc(100vh-56px)] bg-rs-base p-4 pt-[72px] md:ml-16 md:p-8 md:pt-[88px] lg:ml-60">
          <div className="rs-content max-w-6xl rs-fade-in">{children}</div>
        </main>
        <HelpButton />
        <CommandPalette />
        <UpgradeModal />
        <EvidenceGateModal />
        <AddDependencyPanel />
        <OnboardingChecklist />
      </div>
    </AppErrorBoundary>
  );
}
