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

/**
 * The authenticated shell.
 *
 * Layout is a fixed rail plus a fluid work area - no max-width cap on the
 * content. The previous shell clamped every page to `max-w-6xl`, which on a
 * 1920px operations display left roughly a third of the screen empty while
 * the dependency table truncated endpoint URLs. An operations console should
 * use the monitor it was given.
 *
 * The floating help bubble and the theme toggle are gone: a circular chat
 * button hovering over live telemetry is decoration, and the product is
 * single-theme by design.
 */
/**
 * Configuration sequences render their own focused shell. They are still
 * authenticated routes inside this group (so they keep the providers, the
 * session guard and the error boundary), but they must not be wrapped in the
 * console rail: during setup the rail points at surfaces that have no data in
 * them yet.
 */
const SEQUENCE_ROUTES = ['/onboarding', '/clients/onboarding'];

export function ConsoleShell({ children }: { children: ReactNode }) {
  const online = useAppStore((s) => s.online);
  const pathname = usePathname();
  const pushRecent = useAppStore((s) => s.pushRecent);
  const isSequence = SEQUENCE_ROUTES.includes(pathname);

  useEffect(() => {
    const labels: Record<string, string> = {
      '/dashboard': 'Overview',
      '/organization': 'Organization',
      '/clients': 'Client environments',
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
      <div className="obc min-h-screen">
        <a
          href="#obc-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:border focus:border-[var(--obc-signal)] focus:bg-[var(--obc-void)] focus:px-3 focus:py-2 focus:text-[12px] focus:text-[var(--obc-text)]"
        >
          Skip to content
        </a>

        <ConsoleRail />
        <ConsoleMobileBar />

        <div className="lg:pl-[var(--obc-rail)]">
          <ConsoleTopBar />
          {!online && (
            <div
              role="status"
              className="border-b border-[var(--obc-warn)]/30 bg-[var(--obc-warn-wash)] px-[var(--obc-gutter)] py-2 text-[12px] text-[#E3BE7A]"
            >
              Offline. Showing the last values retrieved.
              Actions will retry when the connection returns.
            </div>
          )}
          <main id="obc-main" className="obc-page">
            {children}
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
