'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { getPlan } from '@/lib/dashboard/plans';
import { initials } from '@/lib/dashboard/format';
import { useClients, useInbox, useMarkInboxRead } from '@/lib/dashboard/queries';
import { timeAgo } from '@/lib/dashboard/format';
import { cn } from '@/lib/utils';

/**
 * Console top bar.
 *
 * Deliberately thin. The previous bar carried two separate bells (an
 * "attention" popover listing open incidents and a notification inbox), a
 * theme toggle, a command-palette hint, a trial pill and an avatar menu - * five competing affordances in a 56px strip. Open incidents now live in the
 * global system status where they belong, the theme toggle is gone because
 * the product is single-theme, and what remains is: where am I, what is new,
 * who am I.
 */

const LABELS: Record<string, string> = {
  dashboard: 'Overview',
  dependencies: 'Dependencies',
  incidents: 'Incidents',
  evidence: 'Evidence',
  clients: 'Client environments',
  onboarding: 'Configuration',
  reports: 'Reports',
  settings: 'Settings',
  billing: 'Billing',
  support: 'Support',
};

function useTrail() {
  const pathname = usePathname();
  const parts = pathname.split('/').filter(Boolean);
  const out: { label: string; href?: string }[] = [];
  let acc = '';
  // Anything nested under one of these collections is a record id.
  const COLLECTIONS = new Set(['dependencies', 'incidents', 'evidence', 'clients']);
  parts.forEach((part, i) => {
    acc += '/' + part;
    const last = i === parts.length - 1;
    // Record identifiers are shown by the page itself, which knows the human
    // name (INC-2481, the dependency's name). Repeating a raw id in the
    // breadcrumb tells the user nothing.
    const isId = !LABELS[part] && (COLLECTIONS.has(parts[i - 1] ?? '') || /[0-9]/.test(part));
    out.push({ label: isId ? 'Record' : (LABELS[part] ?? part), href: last ? undefined : acc });
  });
  return out;
}

function Inbox() {
  const [open, setOpen] = useState(false);
  const { data } = useInbox();
  const markRead = useMarkInboxRead();
  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, none unread'
        }
        onClick={() => setOpen((v) => !v)}
        className="obc-btn obc-btn-sm"
      >
        Alerts
        {unread > 0 && (
          <span
            className="ml-0.5 font-[family-name:var(--ob-font-mono)] tabular-nums text-[var(--obc-signal)]"
            aria-hidden
          >
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 w-[min(380px,calc(100vw-32px))] border border-[var(--obc-line-2)] bg-[var(--obc-base)]">
            <div className="flex items-center justify-between border-b border-[var(--obc-line)] px-3 py-2">
              <p className="obc-label">Alerts</p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markRead.mutate(undefined)}
                  className="text-[11px] text-[var(--obc-text-4)] hover:text-[var(--obc-signal)]"
                >
                  Mark all read
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-3 py-5 text-[12px] text-[var(--obc-text-4)]">
                No alerts. Notifications appear here when a dependency changes
                state or an evidence record is generated.
              </p>
            ) : (
              <ul className="obc-scroll max-h-[60vh] overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id} className="border-b border-[var(--obc-line)] last:border-b-0">
                    <Link
                      href={n.action_url ?? '/dashboard'}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2.5 hover:bg-[var(--obc-raised)]"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className={cn(
                            'text-[12.5px]',
                            n.is_read
                              ? 'text-[var(--obc-text-3)]'
                              : 'font-medium text-[var(--obc-text)]'
                          )}
                        >
                          {n.title}
                        </span>
                        <span className="obc-mono shrink-0 text-[10px] text-[var(--obc-text-4)]">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--obc-text-4)]">
                        {n.body}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Client scope.
 *
 * Agency operators work in two different scopes and must never be unsure
 * which one they are in: AGENCY means every client, CLIENT means one. The
 * indicator states the current scope in words, and switching is a real
 * navigation - there is no invisible filter that silently changes what the
 * other pages mean.
 *
 * It renders only for organizations the backend flagged `has_agency_mode`.
 */
function ClientScope() {
  const org = useAppStore((s) => s.org);
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const agency = Boolean(org?.has_agency_mode);
  const clients = useClients(agency);

  if (!agency) return null;

  const match = pathname.match(/^\/clients\/([^/]+)/);
  const activeId = match && match[1] !== 'onboarding' ? match[1] : null;
  const active = clients.data?.find((c) => c.id === activeId) ?? null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 items-center gap-2 border border-[var(--obc-line-2)] px-2.5 text-[12px] text-[var(--obc-text-2)] hover:border-[var(--obc-line-3)]"
      >
        <span className="obc-label">{activeId ? 'Client' : 'Agency'}</span>
        <span className="max-w-[180px] truncate text-[var(--obc-text)]">
          {activeId ? (active?.name ?? 'Environment') : (org?.name ?? 'All clients')}
        </span>
        <span aria-hidden className="text-[var(--obc-text-4)]">
          ▾
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute left-0 top-9 z-50 w-64 border border-[var(--obc-line-2)] bg-[var(--obc-base)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push('/clients');
              }}
              className="block w-full border-b border-[var(--obc-line)] px-3 py-2.5 text-left"
            >
              <span className="obc-label">Agency scope</span>
              <span className="mt-0.5 block truncate text-[12.5px] text-[var(--obc-text)]">
                All client environments
              </span>
            </button>
            <div className="max-h-[300px] overflow-y-auto">
              {(clients.data ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/clients/${c.id}`);
                  }}
                  className={cn(
                    'block w-full px-3 py-2 text-left text-[12.5px] hover:bg-[var(--obc-raised)]',
                    c.id === activeId
                      ? 'text-[var(--obc-text)]'
                      : 'text-[var(--obc-text-2)]'
                  )}
                >
                  {c.name}
                  {c.id === activeId && <span className="sr-only"> (current scope)</span>}
                </button>
              ))}
              {!clients.data?.length && (
                <p className="px-3 py-2.5 text-[12px] text-[var(--obc-text-4)]">
                  No client environments yet.
                </p>
              )}
            </div>
            <Link
              href="/clients/onboarding"
              onClick={() => setOpen(false)}
              className="block border-t border-[var(--obc-line)] px-3 py-2 text-[12.5px] text-[var(--obc-text-2)] hover:bg-[var(--obc-raised)]"
            >
              Add client environment
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Account() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const org = useAppStore((s) => s.org);
  const signOut = useAppStore((s) => s.signOut);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center border border-[var(--obc-line-2)] text-[10.5px] font-medium text-[var(--obc-text-2)] hover:border-[var(--obc-line-3)]"
      >
        {initials(user?.full_name, user?.email)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 w-56 border border-[var(--obc-line-2)] bg-[var(--obc-base)]">
            <div className="border-b border-[var(--obc-line)] px-3 py-2.5">
              <p className="truncate text-[12.5px] text-[var(--obc-text)]">
                {org?.name ?? user?.full_name}
              </p>
              <p className="obc-mono truncate text-[10.5px] text-[var(--obc-text-4)]">
                {user?.email}
              </p>
            </div>
            {[
              { label: 'Settings', href: '/settings' },
              { label: 'Billing', href: '/settings/billing' },
            ].map((i) => (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-[12.5px] text-[var(--obc-text-2)] hover:bg-[var(--obc-raised)]"
              >
                {i.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                signOut();
                router.replace('/login');
              }}
              className="block w-full border-t border-[var(--obc-line)] px-3 py-2 text-left text-[12.5px] text-[var(--obc-text-2)] hover:bg-[var(--obc-raised)]"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ConsoleTopBar() {
  const trail = useTrail();
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const current = getPlan(plan?.effective_plan ?? plan?.plan);
  // Evaluation state is a backend fact; the client never computes eligibility.
  const evaluating = (plan?.is_evaluation_active ?? plan?.is_trial_active) === true;
  const daysLeft = plan?.evaluation_days_remaining ?? plan?.trial_days_remaining ?? 0;

  return (
    <header className="sticky top-0 z-30 hidden h-[var(--obc-bar)] items-center justify-between gap-4 border-b border-[var(--obc-line)] bg-[var(--obc-void)] px-[var(--obc-gutter)] lg:flex">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-[12px]">
          {trail.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden className="text-[var(--obc-text-4)]">
                  /
                </span>
              )}
              {c.href ? (
                <Link href={c.href} className="text-[var(--obc-text-4)] hover:text-[var(--obc-text-2)]">
                  {c.label}
                </Link>
              ) : (
                <span className="text-[var(--obc-text-2)]" aria-current="page">
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex items-center gap-2.5">
        <ClientScope />
        {evaluating && daysLeft > 0 && (
          <button
            type="button"
            onClick={() => openUpgrade('trial')}
            className="obc-btn obc-btn-sm"
          >
            Evaluation
            <span className="font-[family-name:var(--ob-font-mono)] tabular-nums text-[var(--obc-signal)]">
              {daysLeft}d
            </span>
          </button>
        )}
        {!evaluating && current.id === 'free' && (
          <button type="button" onClick={() => openUpgrade()} className="obc-btn obc-btn-sm">
            Free plan · Upgrade
          </button>
        )}
        <Inbox />
        <Account />
      </div>
    </header>
  );
}
