'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Building2,
  Check,
  ChevronDown,
  Layers,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useClients } from '@/lib/dashboard/queries';
import { effectivePlan } from '@/lib/dashboard/plans';
import { cn } from '@/lib/utils';

export function ClientSelector({ className, onSelect }: { className?: string; onSelect?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const plan = useAppStore((s) => s.plan);
  const selectedClientId = useAppStore((s) => s.selectedClientId);
  const setSelectedClient = useAppStore((s) => s.setSelectedClient);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const current = effectivePlan(plan);
  const agencyEnabled = current.id === 'enterprise';

  const { data: clients, isLoading, isError, refetch } = useClients(agencyEnabled);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  // Sync client selection from route if on /clients/[id]
  useEffect(() => {
    const match = pathname.match(/^\/clients\/([0-9a-f-]{8,})/i);
    if (match && match[1] && match[1] !== 'onboarding') {
      setSelectedClient(match[1]);
    } else if (pathname === '/clients') {
      // On the command center, null indicates all workspaces
      setSelectedClient(null);
    }
  }, [pathname, setSelectedClient]);

  if (!agencyEnabled) {
    return (
      <div className={cn('px-2 py-2', className)}>
        <button
          type="button"
          onClick={() => openUpgrade('clients')}
          className="flex w-full items-center justify-between rounded-lg border border-rs-brand/20 bg-rs-brand-subtle px-3 py-2 text-left text-xs font-medium text-rs-brand transition-colors hover:bg-rs-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="shrink-0" />
            <span>Client Workspaces</span>
          </div>
          <span className="rounded bg-rs-brand/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
            Upgrade
          </span>
        </button>
      </div>
    );
  }

  const clientList = clients ?? [];
  const activeClient = clientList.find((c) => c.id === selectedClientId);

  const filteredClients = clientList.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const handleSelectAll = () => {
    setSelectedClient(null);
    setOpen(false);
    onSelect?.();
    router.push('/clients');
  };

  const handleSelectClient = (id: string) => {
    setSelectedClient(id);
    setOpen(false);
    onSelect?.();
    router.push(`/clients/${id}`);
  };

  const handleNewClient = () => {
    setOpen(false);
    onSelect?.();
    router.push('/clients/onboarding');
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-rs-text-tertiary">
        Client Context
      </div>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-rs-border-subtle bg-rs-elevated px-3 py-2 text-left text-sm font-medium text-rs-text transition-colors duration-150 hover:border-rs-border hover:bg-rs-hover focus-visible:outline-none focus-visible:border-rs-brand focus-visible:ring-[3px] focus-visible:ring-[rgb(37_99_235_/_0.20)]"
      >
        <div className="flex min-w-0 items-center gap-2">
          {activeClient ? (
            <Building2 size={16} className="shrink-0 text-rs-brand" />
          ) : (
            <Layers size={16} className="shrink-0 text-rs-text-secondary" />
          )}
          <span className="truncate">
            {activeClient ? activeClient.name : 'All Workspaces (Overview)'}
          </span>
        </div>
        <ChevronDown
          size={15}
          className={cn('shrink-0 text-rs-text-tertiary transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select client workspace"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated shadow-rs-popover"
        >
          {clientList.length > 3 && (
            <div className="border-b border-rs-border-subtle p-2">
              <div className="relative flex items-center">
                <Search size={14} className="absolute left-2.5 text-rs-text-tertiary" />
                <input
                  type="text"
                  placeholder="Filter clients…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-full rounded-md border border-rs-border-subtle bg-rs-input pl-8 pr-2.5 text-xs text-rs-text outline-none placeholder:text-rs-text-tertiary focus:border-rs-brand"
                  autoFocus
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto py-1 rs-scrollbar">
            {isLoading ? (
              <div className="space-y-1.5 p-3">
                <div className="rs-skeleton h-4 w-32 rounded" />
                <div className="rs-skeleton h-4 w-40 rounded" />
              </div>
            ) : isError ? (
              <div className="p-3 text-center">
                <p className="text-xs text-rs-degraded">Failed to load clients</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-1 text-xs text-rs-brand underline"
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedClientId}
                  onClick={handleSelectAll}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-rs-hover',
                    !selectedClientId ? 'bg-rs-hover font-semibold text-rs-text' : 'text-rs-text-secondary'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Layers size={14} className="shrink-0 text-rs-text-tertiary" />
                    <span>All Workspaces (Command Center)</span>
                  </div>
                  {!selectedClientId && <Check size={14} className="text-rs-brand" />}
                </button>

                {filteredClients.length > 0 && (
                  <div className="my-1 border-t border-rs-border-subtle" />
                )}

                {filteredClients.map((client) => {
                  const isSelected = selectedClientId === client.id;
                  return (
                    <button
                      key={client.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectClient(client.id)}
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-rs-hover',
                        isSelected ? 'bg-rs-hover font-semibold text-rs-text' : 'text-rs-text-secondary'
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Building2 size={14} className="shrink-0 text-rs-text-tertiary" />
                        <span className="truncate">{client.name}</span>
                      </div>
                      {isSelected && <Check size={14} className="shrink-0 text-rs-brand" />}
                    </button>
                  );
                })}

                {clientList.length > 0 && filteredClients.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-rs-text-tertiary">
                    No clients match &ldquo;{search}&rdquo;
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-rs-border-subtle p-1.5">
            <button
              type="button"
              onClick={handleNewClient}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rs-brand transition-colors hover:bg-rs-brand-subtle"
            >
              <Plus size={14} />
              <span>Create Client Workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
