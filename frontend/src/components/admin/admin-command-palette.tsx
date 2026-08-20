'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BellRing,
  Building2,
  CircleDollarSign,
  Command,
  FilePenLine,
  HandCoins,
  HelpCircle,
  Megaphone,
  MonitorCog,
  Search,
  Send,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { humanize, searchHitHref } from '@/lib/admin-utils';
import type { SearchHit } from '@/types/admin';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface CommandAction {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  group: string;
}

const actions: CommandAction[] = [
  { label: 'Open overview', description: 'Business and operating health', href: '/admin', icon: Activity, group: 'Navigate' },
  { label: 'Search customers', description: 'Find a customer or organization', href: '/admin/customers', icon: UsersRound, group: 'Navigate' },
  { label: 'Open support queue', description: 'Triage open tickets', href: '/admin/support', icon: HelpCircle, group: 'Navigate' },
  { label: 'View revenue', description: 'MRR and revenue movement', href: '/admin/revenue', icon: CircleDollarSign, group: 'Navigate' },
  { label: 'View partners', description: 'Referrals, commissions, payouts', href: '/admin/partners', icon: HandCoins, group: 'Navigate' },
  { label: 'Check system health', description: 'API, database, workers, and delivery', href: '/admin/operations', icon: MonitorCog, group: 'Navigate' },
  { label: 'Create email campaign', description: 'Start a focused campaign draft', href: '/admin/communications?compose=campaign', icon: Send, group: 'Create' },
  { label: 'Create announcement', description: 'Prepare an in-app announcement', href: '/admin/communications?compose=announcement', icon: Megaphone, group: 'Create' },
  { label: 'Review audit trail', description: 'Search administrative activity', href: '/admin/audit', icon: FilePenLine, group: 'Navigate' },
];

const groupIcons: Record<string, LucideIcon> = {
  customers: UsersRound,
  organizations: Building2,
  tickets: HelpCircle,
  partners: HandCoins,
  campaigns: BellRing,
};

export function AdminCommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState('');
  const [debouncedValue, setDebouncedValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value.trim()), 180);
    return () => window.clearTimeout(timeout);
  }, [value]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setValue('');
      setDebouncedValue('');
    }
  }, [open]);

  const searchQuery = useQuery({
    queryKey: ['admin', 'search', debouncedValue],
    queryFn: () => adminApi.search(debouncedValue, 7),
    enabled: open && debouncedValue.length >= 2,
    staleTime: 20_000,
  });

  const matchingActions = useMemo(() => {
    if (value.trim().length < 1) return actions;
    const needle = value.toLowerCase();
    return actions.filter((action) =>
      `${action.label} ${action.description}`.toLowerCase().includes(needle)
    );
  }, [value]);

  const resultGroups: ReadonlyArray<readonly [string, SearchHit[]]> = searchQuery.data
    ? [
        ['customers', searchQuery.data.customers],
        ['organizations', searchQuery.data.organizations],
        ['tickets', searchQuery.data.tickets],
        ['partners', searchQuery.data.partners],
        ['campaigns', searchQuery.data.campaigns],
      ]
    : [];

  const navigate = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] max-w-2xl translate-y-0 overflow-hidden border-slate-200 p-0 shadow-2xl dark:border-white/10 sm:top-[15%]">
        <DialogTitle className="sr-only">Admin command center</DialogTitle>
        <DialogDescription className="sr-only">
          Search customers, organizations, tickets, partners, and admin actions.
        </DialogDescription>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-white/10">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search customers, tickets, partners, or commands..."
            className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-white"
          />
          <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:block dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            ESC
          </kbd>
        </div>

        <div className="max-h-[min(56vh,500px)] overflow-y-auto py-2">
          {value.trim().length < 2 && (
            <CommandGroup label="Suggested actions">
              {matchingActions.map((action) => (
                <PaletteRow
                  key={action.href}
                  icon={action.icon}
                  title={action.label}
                  subtitle={action.description}
                  onClick={() => navigate(action.href)}
                />
              ))}
            </CommandGroup>
          )}

          {value.trim().length >= 2 && (
            <>
              {searchQuery.isLoading && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">Searching RELIASTRA…</div>
              )}
              {searchQuery.isError && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  Search is temporarily unavailable. You can still use the actions below.
                </div>
              )}
              {!searchQuery.isLoading && !searchQuery.isError && resultGroups.map(([group, hits]) => {
                if (hits.length === 0) return null;
                return (
                  <CommandGroup key={group} label={humanize(group)}>
                    {hits.map((hit) => (
                      <PaletteRow
                        key={`${group}-${hit.id}`}
                        icon={groupIcons[group] || Command}
                        title={hit.title}
                        subtitle={hit.subtitle || humanize(hit.resource_type)}
                        onClick={() => navigate(searchHitHref(hit.resource_type, hit.id, hit.title))}
                      />
                    ))}
                  </CommandGroup>
                );
              })}
              {!searchQuery.isLoading && !searchQuery.isError && searchQuery.data?.total === 0 && matchingActions.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">No matches for “{value}”.</div>
              )}
              {matchingActions.length > 0 && (
                <CommandGroup label="Commands">
                  {matchingActions.map((action) => (
                    <PaletteRow
                      key={action.href}
                      icon={action.icon}
                      title={action.label}
                      subtitle={action.description}
                      onClick={() => navigate(action.href)}
                    />
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-slate-200 px-4 py-2.5 text-[10px] text-slate-500 dark:border-white/10 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-slate-200 px-1 py-0.5 dark:border-white/10">↵</kbd> open
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-slate-200 px-1 py-0.5 dark:border-white/10">↑↓</kbd> navigate
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Command className="size-3" /> K
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CommandGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <p className="px-4 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      {children}
    </div>
  );
}

function PaletteRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-white/[0.05] dark:focus-visible:bg-white/[0.05]'
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>}
      </span>
    </button>
  );
}
