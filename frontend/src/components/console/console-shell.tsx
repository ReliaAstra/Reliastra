'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { ConsoleRail, ConsoleMobileBar } from './console-nav';
import { ConsoleTopBar } from './console-topbar';
import { CommandPalette } from '../dashboard/shell/command-palette';
import { EvidenceGateModal, UpgradeModal } from '../dashboard/shell/upgrade-modal';
import { AddDependencyPanel } from '../dashboard/shell/add-dependency';
import { AppErrorBoundary } from '../dashboard/shell/error-boundary';

const SEQUENCE_ROUTES = ['/onboarding'];

export function ConsoleShell({ children }: { children: ReactNode }) {
  const online = useAppStore((s) => s.online);
  const pathname = usePathname();
  const pushRecent = useAppStore((s) => s.pushRecent);
  const isSequence = SEQUENCE_ROUTES.includes(pathname);

  useEffect(() => {
    const labels: Record<string, string> = {
      '/dashboard': 'Overview',
      '/dependencies': 'Dependencies',
      '/incidents': 'Incidents',
      '/evidence': 'Evidence',
      '/settings': 'Settings',
      '/settings/billing': 'Billing',
      '/settings/notifications': 'Notifications',
    };
    const label = labels[pathname] || pathname.split('/').filter(Boolean).slice(-1)[0];
    if (label) pushRecent({ href: pathname, label });
  }, [pathname, pushRecent]);

  if (isSequence) {
    return (
      <AppErrorBoundary>
        {children}
        <UpgradeModal />
      </AppErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary>
      <div className="rs-app min-h-screen bg-rs-base text-rs-text antialiased">
        <a
          href="#rs-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:border focus:border-rs-brand focus:bg-rs-elevated focus:px-3 focus:py-2 focus:text-[12px] focus:text-rs-text focus:outline-none"
        >
          Skip to content
        </a>

        <ConsoleRail />
        <ConsoleMobileBar />

        <div className="lg:pl-[240px]">
          <ConsoleTopBar />
          {!online && (
            <div
              role="status"
              className="border-b border-rs-degraded/30 bg-rs-degraded-bg px-6 py-2 text-[12px] text-rs-degraded"
            >
              Offline. Showing the last values retrieved. Actions will retry when the connection returns.
            </div>
          )}
          <main id="rs-main" className="rs-main">
            <div className="rs-content">
              {children}
            </div>
          </main>
        </div>

        <CommandPalette />
        <UpgradeModal />
        <EvidenceGateModal />
        <AddDependencyPanel />
      </div>
    </AppErrorBoundary>
  );
}
