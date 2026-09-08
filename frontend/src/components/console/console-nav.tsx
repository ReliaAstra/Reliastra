'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { useHealth, useIncidents } from '@/lib/dashboard/queries';
import { getPlan, isPaid } from '@/lib/dashboard/plans';
import { Wordmark } from '@/components/site/wordmark';
import { toState } from './primitives';
import { cn } from '@/lib/utils';

/**
 * Console navigation.
 *
 * Grouped by what the user is doing, not by database table: MONITORING is the
 * live surface, EVIDENCE is the record. Every href is a route that exists - * there is no invented section. `Agency` appears only for organizations the
 * backend has actually flagged `has_agency_mode`, instead of being a
 * permanently visible dead end.
 *
 * Two entries are worth explaining:
 *
 * -  `Reports` is a real route over `GET /v1/evidence`: the artifact side of
 *    evidence (files, checksums, signed downloads) as distinct from the
 *    incident side. It was left out of the previous pass because nothing
 *    backed it; it is here now because something does.
 * -  `Research` links the public research index and is marked as leaving the
 *    console, because there is no authenticated research capability in the
 *    backend and inventing an in-app one would be a hollow page.
 */
/** Primary destinations surfaced directly in the mobile bar. */
const PRIMARY = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dependencies', label: 'Dependencies' },
  { href: '/incidents', label: 'Incidents' },
  { href: '/evidence', label: 'Evidence' },
];

const GROUPS: { label: string; items: { href: string; label: string; agencyOnly?: boolean }[] }[] = [
  { label: '', items: [{ href: '/dashboard', label: 'Overview' }] },
  {
    label: 'Monitoring',
    items: [
      { href: '/dependencies', label: 'Dependencies' },
      { href: '/incidents', label: 'Incidents' },
    ],
  },
  {
    label: 'Evidence',
    items: [
      { href: '/evidence', label: 'Evidence records' },
      { href: '/reports', label: 'Reports' },
    ],
  },
  {
    label: 'Agency',
    items: [
      { href: '/clients', label: 'Client environments', agencyOnly: true },
      { href: '/clients/onboarding', label: 'Add client environment', agencyOnly: true },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/settings', label: 'Settings' },
      { href: '/settings/billing', label: 'Billing' },
      { href: '/support', label: 'Support' },
    ],
  },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname === href || pathname.startsWith(href + '/');
}

/**
 * The global operational summary.
 *
 * Section 8: overall state must be immediately legible and must not be a
 * giant colourful KPI card. It is a line of counts with status dots, sitting
 * directly under the wordmark in the rail and inline in the mobile bar.
 * Counts come from the dependency-health list and the open-incident list - * nothing is derived that the backend did not measure.
 */
export function SystemStatus({ compact = false }: { compact?: boolean }) {
  const { data: health, isLoading, isError } = useHealth();
  const { data: incidents } = useIncidents('open', 50);

  if (isLoading) {
    return <div className="obc-skel h-9 w-full" aria-label="Loading system status" />;
  }
  if (isError || !health) {
    return (
      <p className="text-[11.5px] leading-snug text-[var(--obc-text-4)]">
        System status unavailable. The measurement network could not be
        reached.
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
    { n: ok, word: 'operational', state: 'ok' as const },
    { n: warn, word: 'degraded', state: 'warn' as const },
    { n: crit, word: 'down', state: 'crit' as const },
    { n: idle, word: 'unknown', state: 'idle' as const },
  ].filter((i) => i.n > 0);

  return (
    <div className={cn(compact ? 'flex items-center gap-4' : 'space-y-2')}>
      {!compact && (
        <p className="obc-label">
          System status · {total} monitored
        </p>
      )}
      <ul className={cn('flex flex-wrap items-center', compact ? 'gap-3.5' : 'gap-x-3.5 gap-y-1.5')}>
        {items.map((i) => (
          <li key={i.word} className="obc-state" data-state={i.state}>
            <span className="obc-dot" aria-hidden />
            <span className="font-[family-name:var(--ob-font-mono)] tabular-nums text-[var(--obc-text)]">
              {i.n}
            </span>
            <span className="text-[var(--obc-text-3)]">{i.word}</span>
          </li>
        ))}
        {open > 0 && (
          <li className="obc-state obc-live" data-state="crit">
            <span className="obc-dot" aria-hidden />
            <span className="font-[family-name:var(--ob-font-mono)] tabular-nums">{open}</span>
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
  const agency = Boolean(org?.has_agency_mode);

  return (
    <nav aria-label="Console" className="flex flex-col gap-5">
      {GROUPS.map((group) => {
        const items = group.items.filter((i) => !i.agencyOnly || agency);
        if (!items.length) return null;
        return (
          <div key={group.label || 'root'}>
            {group.label && <p className="obc-label mb-2 px-3">{group.label}</p>}
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
                        'relative flex h-9 items-center px-3 text-[13px] transition-colors',
                        active
                          ? 'bg-[var(--obc-elevated)] font-medium text-[var(--obc-text)]'
                          : 'text-[var(--obc-text-3)] hover:bg-[var(--obc-raised)] hover:text-[var(--obc-text-2)]'
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-0 h-full w-[2px] bg-[var(--obc-signal)]"
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

      {/* Reference. The public research index is the real destination; there
          is no authenticated research capability in the backend, and a link
          that leaves the console is marked as one rather than faked into it. */}
      <div>
        <p className="obc-label mb-2 px-3">Reference</p>
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
                className="flex h-9 items-center gap-1.5 px-3 text-[13px] text-[var(--obc-text-3)] transition-colors hover:bg-[var(--obc-raised)] hover:text-[var(--obc-text-2)]"
              >
                {item.label}
                <span aria-hidden className="text-[var(--obc-text-4)]">
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
    <div className="flex items-center justify-between gap-3 border-t border-[var(--obc-line)] px-3 py-3">
      <span className="obc-label">{current.name} plan</span>
      {isPaid(current.id) ? (
        <Link
          href="/settings/billing"
          className="text-[11px] text-[var(--obc-text-3)] hover:text-[var(--obc-signal)]"
        >
          Manage
        </Link>
      ) : (
        <button type="button" onClick={() => openUpgrade()} className="obc-btn obc-btn-sm">
          Upgrade
        </button>
      )}
    </div>
  );
}

/** Desktop rail: wordmark, system status, navigation, plan. */
export function ConsoleRail() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--obc-rail)] flex-col border-r border-[var(--obc-line)] bg-[var(--obc-base)] lg:flex">
      <div className="border-b border-[var(--obc-line)] px-3 py-4">
        <Link href="/dashboard" aria-label="RELIASTRA console" className="mb-4 inline-block">
          <Wordmark size="sm" />
        </Link>
        <SystemStatus />
      </div>
      <div className="obc-scroll flex-1 overflow-y-auto py-4">
        <NavList />
      </div>
      <PlanLine />
    </aside>
  );
}

/**
 * Mobile bar + sheet.
 *
 * Section 24: mobile is designed, not collapsed. The bar carries the live
 * system state so the most important fact survives on a phone, and the sheet
 * leads with the four primary workflows.
 */
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
      <div className="sticky top-0 z-40 border-b border-[var(--obc-line)] bg-[var(--obc-void)] lg:hidden">
        <div className="flex h-[var(--obc-bar)] items-center justify-between gap-3 px-[var(--obc-gutter)]">
          <Link href="/dashboard" aria-label="RELIASTRA console">
            <Wordmark size="sm" />
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="obc-menu"
            onClick={() => setOpen((v) => !v)}
            className="obc-btn obc-btn-sm"
          >
            Menu
          </button>
        </div>
        <div className="obc-scroll overflow-x-auto border-t border-[var(--obc-line)] px-[var(--obc-gutter)] py-2">
          <SystemStatus compact />
        </div>
        {/* The four destinations an operator needs on a phone are always one
            tap away; everything else lives behind Menu. A collapsed desktop
            sidebar is not a mobile navigation. */}
        <nav aria-label="Primary" className="obc-scroll flex overflow-x-auto border-t border-[var(--obc-line)]">
          {PRIMARY.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'shrink-0 border-b-2 px-[var(--obc-gutter)] py-2.5 text-[12.5px] transition-colors',
                  active
                    ? 'border-[var(--obc-signal)] text-[var(--obc-text)]'
                    : 'border-transparent text-[var(--obc-text-4)]'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div
        id="obc-menu"
        hidden={!open}
        className="fixed inset-0 z-50 flex flex-col bg-[var(--obc-void)] lg:hidden"
      >
        <div className="flex h-[var(--obc-bar)] shrink-0 items-center justify-between border-b border-[var(--obc-line)] px-[var(--obc-gutter)]">
          <Wordmark size="sm" />
          <button type="button" onClick={() => setOpen(false)} className="obc-btn obc-btn-sm">
            Close
          </button>
        </div>
        <div className="obc-scroll flex-1 overflow-y-auto py-5">
          <NavList onNavigate={() => setOpen(false)} />
        </div>
        <PlanLine />
      </div>
    </>
  );
}
