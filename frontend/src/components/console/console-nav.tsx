'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { useHealth, useIncidents } from '@/lib/dashboard/queries';
import { getPlan, isPaid } from '@/lib/dashboard/plans';
import { consoleNavGroups } from '@/lib/agency/navigation';
import { Wordmark } from '@/components/site/wordmark';
import { toState } from './primitives';
import { cn } from '@/lib/utils';

const PRIMARY = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dependencies', label: 'Dependencies' },
  { href: '/incidents', label: 'Incidents' },
  { href: '/evidence', label: 'Evidence' },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + '/');
}

export function SystemStatus({ compact = false }: { compact?: boolean }) {
  const { data: health, isLoading, isError } = useHealth();
  const { data: incidents } = useIncidents('open', 50);

  if (isLoading) {
    return <div className="rs-skeleton h-9 w-full" aria-label="Loading system status" />;
  }
  if (isError || !health) {
    return (
      <p className="text-[12.5px] leading-snug text-rs-text-tertiary">
        System status unavailable. The measurement network could not be reached.
      </p>
    );
  }

  const total = health.length;
  const ok = health.filter((d) => toState(d.current_status) === 'ok').length;
  const warn = health.filter((d) => toState(d.current_status) === 'warn').length;
  const crit = health.filter((d) => toState(d.current_status) === 'crit').length;
  const idle = health.filter((d) => toState(d.current_status) === 'idle').length;
  const open = incidents?.length ?? 0;

  const items = [
    { n: ok, word: 'operational', state: 'ok' as const, dot: 'rs-status-dot-up' },
    { n: warn, word: 'degraded', state: 'warn' as const, dot: 'rs-status-dot-degraded' },
    { n: crit, word: 'down', state: 'crit' as const, dot: 'rs-status-dot-down' },
    { n: idle, word: 'unknown', state: 'idle' as const, dot: 'rs-status-dot-unknown' },
  ].filter((i) => i.n > 0);

  return (
    <div className={cn(compact ? 'flex items-center gap-4' : 'space-y-2')}>
      {!compact && (
        <p className="rs-label">
          System status · {total} monitored
        </p>
      )}
      <ul className={cn('flex flex-wrap items-center', compact ? 'gap-3.5' : 'gap-x-3.5 gap-y-1.5')}>
        {items.map((i) => (
          <li key={i.word} className="inline-flex items-center gap-1.5 text-[12px] text-rs-text-secondary">
            <span className={cn('rs-status-dot rs-status-dot-sm', i.dot)} aria-hidden />
            <span className="rs-mono tabular-nums text-rs-text">{i.n}</span>
            <span className="text-rs-text-tertiary">{i.word}</span>
          </li>
        ))}
        {open > 0 && (
          <li className="inline-flex items-center gap-1.5 text-[12px] text-rs-down">
            <span className="rs-status-dot rs-status-dot-sm rs-status-dot-down rs-pulse-down" aria-hidden />
            <span className="rs-mono tabular-nums">{open}</span>
            <span>open incident{open === 1 ? '' : 's'}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const isActive = useIsActive();
  const org = useAppStore((s) => s.org);
  const plan = useAppStore((s) => s.plan);
  const groups = consoleNavGroups(org, plan);

  return (
    <nav aria-label="Console" className="flex flex-col gap-5">
      {groups.map((group) => {
        const items = group.items;
        if (!items.length) return null;
        return (
          <div key={group.label || 'root'}>
            {group.label && <p className="rs-label mb-1.5 px-5">{group.label}</p>}
            <ul>
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative mx-2 flex h-10 items-center rounded-[10px] px-3 text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2',
                        active
                          ? 'bg-rs-hover font-medium text-rs-text'
                          : 'text-rs-text-tertiary hover:bg-rs-hover hover:text-rs-text-secondary'
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-rs-brand"
                        />
                      )}
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <div>
        <p className="rs-label mb-1.5 px-5">Reference</p>
        <ul>
          {[
            { href: '/research', label: 'Research' },
            { href: '/docs', label: 'Documentation' },
          ].map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onNavigate}
                className="mx-2 flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-[13.5px] text-rs-text-tertiary transition-colors hover:bg-rs-hover hover:text-rs-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2"
              >
                {item.label}
                <span aria-hidden className="text-rs-text-tertiary">
                  ↗
                </span>
                <span className="sr-only">(opens the public site in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function PlanLine() {
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const current = getPlan(plan?.effective_plan ?? plan?.plan);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-rs-border-subtle px-3 py-3">
      <span className="rs-label">{current.name} plan</span>
      {isPaid(current.id) ? (
        <Link
          href="/settings/billing"
          className="text-[11px] text-rs-text-tertiary hover:text-rs-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
        >
          Manage
        </Link>
      ) : (
        <button type="button" onClick={() => openUpgrade()} className="rs-button rs-button-secondary rs-button-sm">
          Upgrade
        </button>
      )}
    </div>
  );
}

export function ConsoleRail() {
  return (
    <aside className="rs-sidebar fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col border-r border-rs-border-subtle bg-rs-base lg:flex">
      <div className="border-b border-rs-border-subtle px-3 py-4">
        <Link href="/dashboard" aria-label="RELIASTRA console" className="mb-4 inline-block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus">
          <Wordmark size="sm" />
        </Link>
        <SystemStatus />
      </div>
      <div className="rs-scrollbar flex-1 overflow-y-auto py-4">
        <NavList />
      </div>
      <PlanLine />
    </aside>
  );
}

export function ConsoleMobileBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-rs-border-subtle bg-rs-base lg:hidden">
        <div className="flex h-[56px] items-center justify-between gap-3 px-4">
          <Link href="/dashboard" aria-label="RELIASTRA console" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus">
            <Wordmark size="sm" />
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="rs-menu"
            onClick={() => setOpen((v) => !v)}
            className="rs-button rs-button-secondary rs-button-sm"
          >
            Menu
          </button>
        </div>
        <div className="rs-scrollbar overflow-x-auto border-t border-rs-border-subtle px-4 py-2">
          <SystemStatus compact />
        </div>
        <nav aria-label="Primary" className="rs-scrollbar flex overflow-x-auto border-t border-rs-border-subtle">
          {PRIMARY.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 shrink-0 items-center border-b-2 px-5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
                  active
                    ? 'border-rs-brand text-rs-text'
                    : 'border-transparent text-rs-text-tertiary'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div
        id="rs-menu"
        hidden={!open}
        className="fixed inset-0 z-50 flex flex-col bg-rs-base lg:hidden"
      >
        <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-rs-border-subtle px-4">
          <Wordmark size="sm" />
          <button type="button" onClick={() => setOpen(false)} className="rs-button rs-button-secondary rs-button-sm">
            Close
          </button>
        </div>
        <div className="rs-scrollbar flex-1 overflow-y-auto py-5">
          <NavList onNavigate={() => setOpen(false)} />
        </div>
        <PlanLine />
      </div>
    </>
  );
}
