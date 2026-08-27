'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { getPlan, isPaid, trialInfo } from '@/lib/dashboard/plans';
import { initials } from '@/lib/dashboard/format';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';

function crumbs(pathname: string): { label: string; href?: string }[] {
  const map: Record<string, string> = {
    dashboard: 'Dashboard',
    dependencies: 'Dependencies',
    incidents: 'Incidents',
    evidence: 'Evidence',
    clients: 'Clients',
    settings: 'Settings',
    billing: 'Billing',
  };
  const parts = pathname.split('/').filter(Boolean);
  const out: { label: string; href?: string }[] = [];
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    acc += '/' + parts[i];
    const last = i === parts.length - 1;
    const pretty =
      map[parts[i]] ||
      (parts[i].startsWith('bbbb') ? 'INC-1842' : parts[i].length > 12 ? parts[i].slice(0, 8).toUpperCase() : parts[i]);
    out.push({ label: pretty, href: last ? undefined : acc });
  }
  if (out.length === 1 && out[0].label === 'Dashboard') return [];
  return out;
}

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const setCommand = useAppStore((s) => s.setCommandOpen);
  const setSidebar = useAppStore((s) => s.setSidebarOpen);
  const signOut = useAppStore((s) => s.signOut);
  const org = useAppStore((s) => s.org);
  const current = getPlan(plan?.plan);
  const trial = trialInfo(org?.created_at);
  const trail = useMemo(() => crumbs(pathname), [pathname]);
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  return (
    <header className="rs-topbar fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-rs-border-subtle bg-rs-base px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setSidebar(true)}
          className="flex h-12 w-12 items-center justify-center text-rs-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2 md:hidden"
        >
          <Menu size={20} />
        </button>
        <Link href="/dashboard" className="text-lg font-semibold tracking-[-0.02em] text-rs-text">
          Reliastra
        </Link>
      </div>

      <nav className="hidden text-sm text-rs-text-tertiary md:block" aria-label="Breadcrumb">
        {trail.map((c, i) => (
          <span key={`${c.label}-${i}`}>
            {i > 0 && <span className="mx-1 text-rs-border"> / </span>}
            {c.href ? (
              <Link href={c.href} className="hover:text-rs-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus">
                {c.label}
              </Link>
            ) : (
              <span className="text-rs-text">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-2 sm:gap-3">
        {trial.active && (
          <button
            type="button"
            onClick={() => openUpgrade('trial')}
            title="Your 14-day Professional trial — all features unlocked"
            className="rs-trial-pill group hidden items-center gap-1.5 py-0.5 pl-2.5 pr-1.5 text-[11px] font-medium tracking-[0.02em] sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2"
          >
            PRO TRIAL
            <span
              className="rs-countdown-chip"
              data-urgent={trial.daysLeft <= 3}
            >
              {trial.daysLeft}d left
            </span>
          </button>
        )}
        {!isPaid(current.id) && !trial.active && (
          <button
            type="button"
            onClick={() => openUpgrade()}
            className="rounded-full border border-[rgba(37,99,235,0.2)] bg-rs-brand-subtle px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.05em] text-rs-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
          >
            Free
          </button>
        )}
        <ThemeToggle className="hidden sm:inline-flex" />
        <button
          type="button"
          onClick={() => setCommand(true)}
          className="hidden items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus md:inline-flex"
          aria-label="Open command palette"
        >
          <span className="rounded border border-rs-border px-1.5 py-0.5 font-mono text-[11px] text-rs-text-tertiary">
            ⌘K
          </span>
        </button>

        <NotificationBell
          open={bellOpen}
          onOpenChange={(next) => {
            setBellOpen(next);
            if (next) setUserOpen(false);
          }}
        />

        <div className="relative">
          <button
            type="button"
            aria-label="Account menu"
            onClick={() => {
              setUserOpen((v) => !v);
              setBellOpen(false);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-rs-border bg-rs-hover text-xs font-medium text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2"
          >
            {initials(user?.full_name, user?.email)}
          </button>
          {userOpen && (
            <div className="absolute right-0 top-10 w-48 overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated py-1 shadow-rs-popover">
              {[
                { label: 'Profile', href: '/settings' },
                { label: 'Organization', href: '/settings' },
                { label: 'Billing', href: '/settings/billing' },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setUserOpen(false)}
                  className="block px-3 py-2.5 text-sm text-rs-text hover:bg-rs-hover transition-colors duration-150"
                >
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  setUserOpen(false);
                  signOut();
                  router.push('/dashboard');
                }}
                className="block w-full px-3 py-2.5 text-left text-sm text-rs-text hover:bg-rs-hover transition-colors duration-150"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
