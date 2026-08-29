'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  FileText,
  LayoutDashboard,
  Link2,
  MessageCircle,
  Settings,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { getPlan, isPaid } from '@/lib/dashboard/plans';
import { cn } from '@/lib/utils';
import { RsButton } from '../ui/button';
import { ThemeToggle } from './theme-toggle';
import { ClientSelector } from './client-selector';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional pill rendered on the right of the row. */
  badge?: string;
};

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Agency', icon: Building2 },
  { href: '/dependencies', label: 'Dependencies', icon: Link2 },
  { href: '/incidents', label: 'Incidents', icon: TriangleAlert },
  { href: '/evidence', label: 'Evidence', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/support', label: 'Support', icon: MessageCircle },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col" aria-label="Main">
      {NAV.map((item) => {
        const active =
          item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              // Hit targets ≥40×40 — h-12 mobile (48px) per spec, lg:h-10 (40px)
              'relative mb-0.5 flex h-12 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 lg:h-10',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2',
              active
                ? 'bg-rs-elevated font-medium text-rs-text'
                : 'text-rs-text-secondary hover:bg-rs-elevated hover:text-rs-text'
            )}
            aria-current={active ? 'page' : undefined}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-[2px] bg-rs-brand" />
            )}
            <Icon
              size={18}
              className={cn(
                'shrink-0',
                active ? 'text-rs-brand' : 'text-rs-text-tertiary group-hover:text-rs-text-secondary'
              )}
            />
            {'badge' in item && item.badge && !active && (
              <span className="ml-auto rounded-full border border-rs-brand/25 bg-rs-brand-subtle px-1.5 py-px text-[9px] font-semibold tracking-wide text-rs-brand">
                {item.badge}
              </span>
            )}
            <span className="md:hidden lg:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function PlanFooter() {
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const current = getPlan(plan?.effective_plan ?? plan?.plan);
  if (!isPaid(current.id)) {
    return (
      <div className="mt-auto hidden items-center justify-between px-2 pt-4 lg:flex">
        <span className="text-xs text-rs-text-tertiary">Free plan</span>
        <button
          type="button"
          onClick={() => openUpgrade()}
          className="rounded-md bg-rs-brand px-2.5 py-1 text-xs text-white hover:bg-rs-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
        >
          Upgrade
        </button>
      </div>
    );
  }
  return (
    <div className="mt-auto hidden items-center justify-between gap-2 px-2 pt-4 lg:flex">
      <span className="min-w-0 truncate text-xs text-rs-text-secondary">{current.name}</span>
      <Link
        href="/settings/billing"
        className="shrink-0 text-xs text-rs-text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
      >
        Manage
      </Link>
    </div>
  );
}

export function Sidebar() {
  const plan = useAppStore((s) => s.plan);
  const current = getPlan(plan?.effective_plan ?? plan?.plan);
  const agency = current.id === 'enterprise';

  return (
    <aside className="rs-sidebar fixed bottom-0 left-0 top-14 z-40 hidden w-16 flex-col border-r border-rs-border-subtle bg-rs-base px-2 py-4 md:flex lg:w-60 lg:px-3">
      {agency && (
        <div className="mb-4 hidden lg:block">
          <ClientSelector />
        </div>
      )}
      <NavItems />
      <PlanFooter />
    </aside>
  );
}

export function MobileSidebar() {
  const open = useAppStore((s) => s.sidebarOpen);
  const setOpen = useAppStore((s) => s.setSidebarOpen);
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const current = getPlan(plan?.effective_plan ?? plan?.plan);
  const agency = current.id === 'enterprise';

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-[rgb(11_15_25_/_0.5)]" onClick={() => setOpen(false)} aria-hidden />
      <aside
        className="absolute bottom-0 left-0 top-0 flex w-[280px] flex-col bg-rs-base p-4 shadow-rs-modal"
        role="dialog"
        aria-label="Navigation"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-lg font-semibold tracking-[-0.02em] text-rs-text">Reliastra</span>
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="flex h-12 w-12 items-center justify-center text-rs-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus">
            <X size={18} />
          </button>
        </div>
        {agency && (
          <div className="mb-4">
            <ClientSelector onSelect={() => setOpen(false)} />
          </div>
        )}
        <NavItems onNavigate={() => setOpen(false)} />
        <div className="mt-auto pt-4">
          <ThemeToggle className="w-full justify-center" />
        </div>
        {!isPaid(current.id) ? (
          <RsButton className="mt-4 w-full" onClick={() => { setOpen(false); openUpgrade(); }}>
            Upgrade
          </RsButton>
        ) : (
          <Link href="/settings/billing" onClick={() => setOpen(false)} className="mt-4 text-sm text-rs-text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus">
            Manage {current.name}
          </Link>
        )}
      </aside>
    </div>
  );
}
