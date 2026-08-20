'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Bell,
  BookOpenCheck,
  ChevronRight,
  CircleDollarSign,
  Command,
  FileClock,
  HandCoins,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MessageSquareText,
  Megaphone,
  MonitorCog,
  PackageOpen,
  Search,
  ShieldAlert,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { adminApi, clearReliastraSession } from '@/lib/admin-api';
import { attentionHref, formatRelativeTime, initials } from '@/lib/admin-utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { AdminCommandPalette } from '@/components/admin/admin-command-palette';
import { DateRangeControl, HealthDot, SectionSkeleton, StatusPill } from '@/components/admin/admin-primitives';

export type AdminShellState = 'loading' | 'ready' | 'expired' | 'denied' | 'unavailable';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navGroups: Array<{ label?: string; items: NavItem[] }> = [
  {
    items: [{ href: '/admin', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Business',
    items: [
      { href: '/admin/customers', label: 'Customers', icon: UsersRound },
      { href: '/admin/revenue', label: 'Revenue', icon: CircleDollarSign },
      { href: '/admin/growth', label: 'Growth', icon: LineChart },
    ],
  },
  {
    items: [
      { href: '/admin/product', label: 'Product', icon: PackageOpen },
      { href: '/admin/support', label: 'Support', icon: MessageSquareText },
      { href: '/admin/communications', label: 'Communications', icon: Megaphone },
      { href: '/admin/partners', label: 'Partners', icon: HandCoins },
      { href: '/admin/operations', label: 'Operations', icon: MonitorCog },
      { href: '/admin/audit', label: 'Audit', icon: FileClock },
    ],
  },
];

const analyticsPaths = ['/admin', '/admin/revenue', '/admin/growth', '/admin/product'];

export function AdminShell({
  state,
  children,
  onRetry,
}: {
  state: AdminShellState;
  children: ReactNode;
  onRetry?: () => void;
}) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const canUseAdmin = state === 'ready';
  const showDateRange =
    pathname === '/admin' ||
    analyticsPaths
      .filter((path) => path !== '/admin')
      .some((path) => pathname === path || pathname.startsWith(`${path}/`));

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (canUseAdmin) setCommandOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [canUseAdmin]);

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-950 dark:bg-background dark:text-white">
      <div className="flex min-h-screen">
        <DesktopNavigation disabled={!canUseAdmin} />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-[#f7f8fa]/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-background/90 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2 size-9 lg:hidden"
                onClick={() => setMobileNavigationOpen(true)}
                aria-label="Open admin navigation"
                disabled={!canUseAdmin}
              >
                <Menu className="size-5" />
              </Button>
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-semibold tracking-[-0.015em] text-slate-900 dark:text-white">
                  {routeTitle(pathname)}
                </p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Admin</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {canUseAdmin && showDateRange && <DateRangeControl className="hidden md:inline-flex" />}
              {canUseAdmin && (
                <button
                  type="button"
                  onClick={() => setCommandOpen(true)}
                  className="hidden h-9 w-[min(31vw,280px)] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-xs text-slate-500 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-white/10 dark:bg-card dark:text-slate-400 dark:hover:border-white/20 lg:flex"
                  aria-label="Open global search"
                >
                  <Search className="size-3.5" />
                  <span className="flex-1">Search anything…</span>
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[9px] font-medium text-slate-400 dark:border-white/10 dark:bg-white/5">⌘K</kbd>
                </button>
              )}
              {canUseAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 lg:hidden"
                  onClick={() => setCommandOpen(true)}
                  aria-label="Search admin records"
                >
                  <Search className="size-4" />
                </Button>
              )}
              {canUseAdmin && <AttentionNotifications />}
              <AdminAccount state={state} />
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1600px] px-4 py-6 pb-12 sm:px-6 sm:py-8 lg:px-8">
            {state === 'ready' ? children : <ShellState state={state} onRetry={onRetry} />}
          </main>
        </div>
      </div>
      <MobileNavigation open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen} disabled={!canUseAdmin} />
      {canUseAdmin && <AdminCommandPalette open={commandOpen} onOpenChange={setCommandOpen} />}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-[10px] bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="1.7" />
          <path d="M7.8 12.1 10.6 15 16.5 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {!compact && (
        <span>
          <span className="block text-xs font-semibold tracking-[0.15em] text-slate-950 dark:text-white">RELIASTRA</span>
          <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.17em] text-slate-400">Operating system</span>
        </span>
      )}
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationContents({ onNavigate, disabled = false }: { onNavigate?: () => void; disabled?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
      {navGroups.map((group, groupIndex) => (
        <div key={group.label || `group-${groupIndex}`} className={cn(groupIndex > 0 && 'mt-5')}>
          {group.label && (
            <p className="px-3 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">{group.label}</p>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={disabled ? '#' : item.href}
                  onClick={(event) => {
                    if (disabled) event.preventDefault();
                    onNavigate?.();
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                    disabled && 'pointer-events-none opacity-45',
                    active
                      ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
                  )}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={active ? 2 : 1.7} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function DesktopNavigation({ disabled }: { disabled: boolean }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[250px] shrink-0 flex-col border-r border-slate-200/80 bg-white dark:border-white/10 dark:bg-card lg:flex">
      <div className="px-6 pb-4 pt-6">
        <Link href="/admin" aria-label="RELIASTRA Admin overview" className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          <Brand />
        </Link>
      </div>
      <NavigationContents disabled={disabled} />
      <div className="border-t border-slate-200 p-3 dark:border-white/10">
        <div className="rounded-lg bg-slate-50 px-3 py-3 dark:bg-white/[0.04]">
          <div className="flex items-center gap-2">
            <Activity className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">Command center</p>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Business signals first. Detail when you need it.</p>
        </div>
      </div>
    </aside>
  );
}

function MobileNavigation({
  open,
  onOpenChange,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] gap-0 p-0 sm:max-w-[280px]">
        <SheetTitle className="sr-only">Admin navigation</SheetTitle>
        <div className="border-b border-slate-200 px-5 py-5 dark:border-white/10">
          <Brand />
        </div>
        <NavigationContents disabled={disabled} onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function AttentionNotifications() {
  const attentionQuery = useQuery({
    queryKey: ['admin', 'attention'],
    queryFn: adminApi.attention,
    staleTime: 30_000,
    refetchInterval: 45_000,
  });
  const items = attentionQuery.data?.items || [];
  const attentionCount = attentionQuery.data
    ? attentionQuery.data.critical_count + attentionQuery.data.high_count
    : 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9" aria-label="Open attention notifications">
          <Bell className="size-4" />
          {attentionCount > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-4 text-white">
              {attentionCount > 9 ? '9+' : attentionCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] border-slate-200 p-0 dark:border-white/10">
        <DropdownMenuLabel className="flex items-center justify-between px-4 py-3.5">
          <span className="text-sm font-semibold">Attention</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">{attentionQuery.isFetching ? 'Refreshing' : 'Live view'}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-80 overflow-y-auto py-1.5">
          {attentionQuery.isLoading && <SectionSkeleton lines={3} className="p-4" />}
          {attentionQuery.isError && (
            <p className="px-4 py-6 text-center text-xs leading-5 text-slate-500">Attention alerts are temporarily unavailable.</p>
          )}
          {!attentionQuery.isLoading && !attentionQuery.isError && items.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing needs immediate attention.</p>
          )}
          {items.map((item) => (
            <Link
              key={`${item.type}-${item.target_id || item.title}`}
              href={attentionHref(item)}
              className="flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-white/[0.05] dark:focus-visible:bg-white/[0.05]"
            >
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.priority === 'critical' ? 'bg-rose-500' : item.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500')} />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{item.title}</span>
                {item.description && <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{item.description}</span>}
              </span>
              <ChevronRight className="mt-1 size-3.5 shrink-0 text-slate-400" />
            </Link>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AdminAccount({ state }: { state: AdminShellState }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const profileQuery = useQuery({
    queryKey: ['admin', 'current-user'],
    queryFn: adminApi.currentUser,
    enabled: state === 'ready',
    staleTime: 5 * 60_000,
  });
  const profile = profileQuery.data;

  const signOut = async () => {
    // The access token is enough for the frontend security boundary. Logout is
    // best-effort because a locally expired refresh token should not prevent
    // the dashboard from clearing its sensitive cache.
    try {
      const refreshToken = window.localStorage.getItem('reliastra_refresh_token') || window.localStorage.getItem('partner_refresh_token');
      if (refreshToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      }
    } finally {
      clearReliastraSession();
      queryClient.clear();
      router.push('/?page=login&next=%2Fadmin');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-full outline-none ring-offset-2 transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-blue-600"
          aria-label="Open admin account menu"
        >
          <Avatar className="size-8 border border-slate-200 dark:border-white/10">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
            <AvatarFallback className="bg-slate-900 text-[10px] font-semibold text-white dark:bg-white dark:text-slate-950">
              {initials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-slate-200 p-1.5 dark:border-white/10">
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{profile?.full_name || 'Administrator'}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{profile?.email || (state === 'ready' ? 'Loading account…' : 'Admin access')}</p>
        </div>
        <DropdownMenuSeparator />
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <LogOut className="size-3.5" />
          Sign out
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ShellState({ state, onRetry }: { state: Exclude<AdminShellState, 'ready'>; onRetry?: () => void }) {
  if (state === 'loading') {
    return (
      <div className="space-y-7" aria-busy="true" aria-label="Loading admin dashboard">
        <div className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
          <div className="h-9 w-64 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-200 dark:bg-white/10" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-[146px] animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" />)}
        </div>
        <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" />
          <div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-card" />
        </div>
      </div>
    );
  }

  const expired = state === 'expired';
  const denied = state === 'denied';
  const Icon = denied ? ShieldAlert : expired ? LogOut : BarChart3;
  const title = denied
    ? 'Admin access is restricted.'
    : expired
      ? 'Your session has ended.'
      : 'Admin data is temporarily unavailable.';
  const description = denied
    ? 'This account is signed in, but it does not have system administrator access. The backend has not returned any administrative data.'
    : expired
      ? 'For security, RELIASTRA has cleared the local admin state. Sign in again to continue.'
      : 'The command center could not establish a verified connection to RELIASTRA. No cached business or customer data is being shown.';

  return (
    <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-xl flex-col items-center justify-center text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-white/10 dark:bg-card dark:text-slate-200">
        <Icon className="size-6" strokeWidth={1.6} />
      </span>
      <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">RELIASTRA Admin</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white">{title}</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        {state === 'unavailable' && onRetry && <Button onClick={onRetry}>Try again</Button>}
        {(expired || denied) && (
          <Button asChild variant="outline">
            <Link href="/?page=login&next=%2Fadmin">Go to sign in</Link>
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link href="/">Return to RELIASTRA</Link>
        </Button>
      </div>
    </div>
  );
}

function routeTitle(pathname: string) {
  const matching = navGroups.flatMap((group) => group.items).find((item) => isActive(pathname, item.href));
  if (pathname.includes('/customers/')) return 'Customer workspace';
  if (pathname.includes('/support/')) return 'Support workspace';
  if (pathname.includes('/partners/')) return 'Partner workspace';
  return matching?.label || 'Admin';
}
