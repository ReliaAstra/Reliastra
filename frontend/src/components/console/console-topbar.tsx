'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { getPlan } from '@/lib/dashboard/plans';
import { initials } from '@/lib/dashboard/format';
import { useInbox, useMarkInboxRead } from '@/lib/dashboard/queries';
import { timeAgo } from '@/lib/dashboard/format';
import { cn } from '@/lib/utils';

const LABELS: Record<string, string> = {
  dashboard: 'Overview',
  dependencies: 'Dependencies',
  incidents: 'Incidents',
  evidence: 'Evidence',
  onboarding: 'Configuration',
  settings: 'Settings',
  billing: 'Billing',
  notifications: 'Notifications',
  support: 'Support',
};

function useTrail() {
  const pathname = usePathname();
  const parts = pathname.split('/').filter(Boolean);
  const out: { label: string; href?: string }[] = [];
  let acc = '';
  const COLLECTIONS = new Set(['dependencies', 'incidents', 'evidence', 'clients']);
  parts.forEach((part, i) => {
    acc += '/' + part;
    const last = i === parts.length - 1;
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
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, none unread'}
        onClick={() => setOpen((v) => !v)}
        className="rs-button rs-button-secondary rs-button-sm"
      >
        Alerts
        {unread > 0 && (
          <span className="ml-0.5 rs-mono tabular-nums text-rs-brand" aria-hidden>
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="rs-card absolute right-0 top-9 z-50 w-[min(380px,calc(100vw-32px))] overflow-hidden p-0 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-between border-b border-rs-border-subtle px-3 py-2.5">
              <p className="rs-label">Alerts</p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markRead.mutate(undefined)}
                  className="text-[11px] text-rs-text-tertiary hover:text-rs-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
                >
                  Mark all read
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-3 py-5 text-[12px] text-rs-text-tertiary">
                No alerts. Notifications appear here when a dependency changes state or an evidence record is generated.
              </p>
            ) : (
              <ul className="rs-scrollbar max-h-[60vh] overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id} className="border-b border-rs-border-subtle last:border-b-0">
                    <Link
                      href={n.action_url ?? '/dashboard'}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2.5 hover:bg-rs-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rs-focus"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className={cn(
                            'text-[12.5px]',
                            n.is_read ? 'text-rs-text-tertiary' : 'font-medium text-rs-text'
                          )}
                        >
                          {n.title}
                        </span>
                        <span className="rs-mono shrink-0 text-[10px] text-rs-text-tertiary">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-rs-text-tertiary">
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
        className="flex h-8 w-8 items-center justify-center rounded-full border border-rs-border bg-rs-elevated text-[11px] font-medium text-rs-text-secondary hover:border-rs-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
      >
        {initials(user?.full_name, user?.email)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="rs-card absolute right-0 top-9 z-50 w-56 overflow-hidden p-0 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
            <div className="border-b border-rs-border-subtle px-3 py-2.5">
              <p className="truncate text-[12.5px] text-rs-text">{org?.name ?? user?.full_name}</p>
              <p className="rs-mono truncate text-[10.5px] text-rs-text-tertiary">{user?.email}</p>
            </div>
            {[
              { label: 'Settings', href: '/settings' },
              { label: 'Billing', href: '/settings/billing' },
            ].map((i) => (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-[12.5px] text-rs-text-secondary hover:bg-rs-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rs-focus"
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
              className="block w-full border-t border-rs-border-subtle px-3 py-2 text-left text-[12.5px] text-rs-text-secondary hover:bg-rs-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rs-focus"
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
  const evaluating = (plan?.is_evaluation_active ?? plan?.is_trial_active) === true;
  const daysLeft = plan?.evaluation_days_remaining ?? plan?.trial_days_remaining ?? 0;

  return (
    <header className="rs-topbar sticky top-0 z-30 hidden h-[56px] items-center justify-between gap-4 border-b border-rs-border-subtle bg-rs-base px-6 lg:flex">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-[12px]">
          {trail.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden className="text-rs-text-tertiary">
                  /
                </span>
              )}
              {c.href ? (
                <Link href={c.href} className="text-rs-text-tertiary hover:text-rs-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus">
                  {c.label}
                </Link>
              ) : (
                <span className="text-rs-text-secondary" aria-current="page">
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex items-center gap-2.5">
        {evaluating && daysLeft > 0 && (
          <button
            type="button"
            onClick={() => openUpgrade('trial')}
            className="rs-button rs-button-secondary rs-button-sm"
          >
            Evaluation
            <span className="rs-mono tabular-nums text-rs-brand">{daysLeft}d</span>
          </button>
        )}
        {!evaluating && current.id === 'free' && (
          <button type="button" onClick={() => openUpgrade()} className="rs-button rs-button-secondary rs-button-sm">
            Free plan · Upgrade
          </button>
        )}
        <Inbox />
        <Account />
      </div>
    </header>
  );
}
