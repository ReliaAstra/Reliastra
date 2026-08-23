'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Menu } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { getPlan, isPaid, trialInfo } from '@/lib/dashboard/plans';
import { initials } from '@/lib/dashboard/format';
import { mockNotifications } from '@/lib/dashboard/mock';
import { useMemo, useState } from 'react';
import { timeAgo } from '@/lib/dashboard/format';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';

function crumbs(pathname: string): { label: string; href?: string }[] {
  const map: Record<string, string> = {
    dashboard: 'Dashboard',
    dependencies: 'Dependencies',
    incidents: 'Incidents',
    evidence: 'Evidence',
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
  const unread = useAppStore((s) => s.unreadCount);
  const setUnread = useAppStore((s) => s.setUnreadCount);
  const signOut = useAppStore((s) => s.signOut);
  const org = useAppStore((s) => s.org);
  const current = getPlan(plan?.plan);
  const trial = trialInfo(org?.created_at);
  const trail = useMemo(() => crumbs(pathname), [pathname]);
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-rs-border-subtle bg-rs-base px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setSidebar(true)}
          className="flex h-12 w-12 items-center justify-center text-rs-text-secondary md:hidden"
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
              <Link href={c.href} className="hover:text-rs-text-secondary">
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
            className="group hidden items-center gap-1.5 rounded-full border border-rs-brand/25 bg-rs-brand-subtle py-0.5 pl-2.5 pr-1.5 text-[11px] font-medium tracking-[0.02em] text-rs-brand sm:inline-flex"
          >
            PRO TRIAL
            <span
              className={cn(
                'rounded-full px-1.5 py-px font-mono text-[10px]',
                trial.daysLeft <= 3 ? 'bg-rs-down/15 text-rs-down' : 'bg-rs-brand/15'
              )}
            >
              {trial.daysLeft}d left
            </span>
          </button>
        )}
        {!isPaid(current.id) && !trial.active && (
          <button
            type="button"
            onClick={() => openUpgrade()}
            className="rounded-full border border-[rgba(37,99,235,0.2)] bg-rs-brand-subtle px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.05em] text-rs-brand"
          >
            Free
          </button>
        )}
        <ThemeToggle className="hidden sm:inline-flex" />
        <button
          type="button"
          onClick={() => setCommand(true)}
          className="hidden items-center md:inline-flex"
          aria-label="Open command palette"
        >
          <span className="rounded border border-rs-border px-1.5 py-0.5 font-mono text-[11px] text-rs-text-tertiary">
            ⌘K
          </span>
        </button>

        <div className="relative">
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => {
              setBellOpen((v) => !v);
              setUserOpen(false);
              setUnread(0);
            }}
            className="relative flex h-12 w-12 items-center justify-center text-rs-text-secondary"
          >
            <Bell size={20} />
            {unread > 0 && (
              <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-rs-down" />
            )}
            {unread > 9 && (
              <span className="absolute right-2 top-2 rounded-full bg-rs-down px-1 text-[9px] text-white">
                {unread}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 top-12 w-80 overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated">
              <div className="border-b border-rs-border-subtle px-4 py-2 text-xs font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                Notifications
              </div>
              {mockNotifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setBellOpen(false);
                    if (n.href) router.push(n.href);
                  }}
                  className="block w-full border-b border-rs-border-subtle px-4 py-3 text-left last:border-0 hover:bg-rs-hover"
                >
                  <div className="text-sm text-rs-text">{n.title}</div>
                  <div className="mt-1 text-xs text-rs-text-tertiary">{n.body}</div>
                  <div className="mt-1 text-xs text-rs-text-tertiary">{timeAgo(n.created_at)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            aria-label="Account menu"
            onClick={() => {
              setUserOpen((v) => !v);
              setBellOpen(false);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-rs-border bg-rs-hover text-xs font-medium text-rs-text"
          >
            {initials(user?.full_name, user?.email)}
          </button>
          {userOpen && (
            <div className="absolute right-0 top-10 w-48 overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated py-1">
              {[
                { label: 'Profile', href: '/settings' },
                { label: 'Organization', href: '/settings' },
                { label: 'Billing', href: '/settings/billing' },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setUserOpen(false)}
                  className="block px-3 py-2.5 text-sm text-rs-text hover:bg-rs-hover"
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
                className="block w-full px-3 py-2.5 text-left text-sm text-rs-text hover:bg-rs-hover"
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
