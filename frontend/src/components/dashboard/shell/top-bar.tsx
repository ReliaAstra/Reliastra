'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell, Menu, TriangleAlert } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { effectivePlan } from '@/lib/dashboard/plans';
import { initials, timeAgo } from '@/lib/dashboard/format';
import { api } from '@/lib/dashboard/api';
import { useClients } from '@/lib/dashboard/queries';
import { useEffect, useMemo, useState } from 'react';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';

function crumbs(pathname: string, clients?: Array<{ id: string; name: string }>): { label: string; href?: string }[] {
  const map: Record<string, string> = {
    dashboard: 'Dashboard',
    dependencies: 'Dependencies',
    incidents: 'Incidents',
    evidence: 'Evidence',
    clients: 'Agency',
    onboarding: 'Onboarding',
    settings: 'Settings',
    billing: 'Billing',
    support: 'Support',
  };
  const parts = pathname.split('/').filter(Boolean);
  const out: { label: string; href?: string }[] = [];
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    acc += '/' + part;
    const last = i === parts.length - 1;
    
    // Check if it's a client ID
    if (/^[0-9a-f-]{8,}$/i.test(part) && parts[i - 1] === 'clients' && clients) {
      const matchClient = clients.find((c) => c.id === part);
      const label = matchClient ? matchClient.name : 'Client Workspace';
      out.push({ label, href: last ? undefined : acc });
      continue;
    }
    
    // Skip other UUID segments on detail pages
    if (/^[0-9a-f-]{8,}$/i.test(part) && part.includes('-')) continue;

    const pretty = map[part] || part;
    out.push({ label: pretty, href: last ? undefined : acc });
  }
  if (out.length === 1 && out[0].label === 'Dashboard') return [];
  return out;
}

/**
 * Attention feed — real open incidents from the backend. There is no
 * fabricated notification stream in the customer console: what needs
 * attention IS the open incident list.
 */
function AttentionBell() {
  const router = useRouter();
  const setUnread = useAppStore((s) => s.setUnreadCount);
  const [open, setOpen] = useState(false);

  const { data: openIncidents } = useQuery({
    queryKey: ['attention', 'open-incidents'],
    queryFn: () => api.incidents({ status: 'open', limit: 8 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const items = useMemo(() => openIncidents ?? [], [openIncidents]);
  const count = items.length;

  useEffect(() => {
    setUnread(count);
  }, [count, setUnread]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={count > 0 ? `${count} open incidents need attention` : 'No open incidents'}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-12 w-12 items-center justify-center text-rs-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2"
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-rs-down" />
        )}
        {count > 9 && (
          <span className="absolute right-2 top-2 rounded-full bg-rs-down px-1 text-[9px] text-white">
            {count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated shadow-rs-popover">
            <div className="flex items-center justify-between border-b border-rs-border-subtle px-4 py-2">
              <span className="text-xs font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                Needs attention
              </span>
              <Link href="/incidents?status=open" onClick={() => setOpen(false)} className="text-[11px] text-rs-brand hover:underline">
                View all
              </Link>
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-rs-text-tertiary">
                No open incidents. Everything is quiet.
              </p>
            ) : (
              items.slice(0, 5).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/incidents/${n.id}`);
                  }}
                  className="flex w-full items-start gap-2.5 border-b border-rs-border-subtle px-4 py-3 text-left last:border-0 hover:bg-rs-hover transition-colors duration-150"
                >
                  <TriangleAlert size={14} className="mt-0.5 shrink-0 text-rs-degraded" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-rs-text">
                      {n.title || n.display_id || n.root_cause?.slice(0, 60) || 'Open incident'}
                    </span>
                    <span className="mt-0.5 block text-xs text-rs-text-tertiary">
                      {timeAgo(n.started_at)} · {n.severity}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
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
  const current = effectivePlan(plan);
  const agencyEnabled = current.id === 'enterprise';
  const { data: clients } = useClients(agencyEnabled);
  // Evaluation state comes straight from the backend's authoritative fields (server time).
  const trialActive = (plan?.is_evaluation_active ?? plan?.is_trial_active) === true;
  const daysLeft = plan?.evaluation_days_remaining ?? plan?.trial_days_remaining ?? 0;
  const trail = useMemo(() => crumbs(pathname, clients), [pathname, clients]);
  const [userOpen, setUserOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  const handleSignOut = () => {
    setUserOpen(false);
    signOut();
    router.replace('/login');
  };

  return (
    <header className="rs-topbar fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-rs-border-subtle bg-rs-base px-4 sm:px-6">
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
        {trialActive && (
          <button
            type="button"
            onClick={() => openUpgrade('trial')}
            title="14-day full-access evaluation — every capability unlocked (server time)"
            className="rs-trial-pill group hidden items-center gap-1.5 py-0.5 pl-2.5 pr-1.5 text-[11px] font-medium tracking-[0.02em] sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2"
          >
            PRO TRIAL
            <span className="rs-countdown-chip" data-urgent={daysLeft <= 3}>
              {daysLeft}d left
            </span>
          </button>
        )}
        {!trialActive && current.id === 'free' && (
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

        <AttentionBell />
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
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-rs-border bg-rs-hover text-xs font-medium text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2"
          >
            {initials(user?.full_name, user?.email)}
          </button>
          {userOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserOpen(false)} aria-hidden />
              <div className="absolute right-0 top-10 z-50 w-48 overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated py-1 shadow-rs-popover">
                <div className="border-b border-rs-border-subtle px-3 pb-2 pt-1">
                  <p className="truncate text-xs font-medium text-rs-text">{org?.name ?? user?.full_name}</p>
                  <p className="truncate text-[11px] text-rs-text-tertiary">{user?.email}</p>
                </div>
                {[
                  { label: 'Settings', href: '/settings' },
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
                  onClick={handleSignOut}
                  className="block w-full px-3 py-2.5 text-left text-sm text-rs-text hover:bg-rs-hover transition-colors duration-150"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
