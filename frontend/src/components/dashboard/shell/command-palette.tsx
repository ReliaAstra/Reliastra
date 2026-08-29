'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Activity,
  Bell,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Link2,
  Plus,
  Search,
  Settings,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { effectivePlan, hasEvidence } from '@/lib/dashboard/plans';
import { useClients } from '@/lib/dashboard/queries';

interface Item {
  id: string;
  group: string;
  label: string;
  href?: string;
  shortcut?: string;
  icon: typeof LayoutDashboard;
  action?: () => void;
}

export function CommandPalette() {
  const open = useAppStore((s) => s.commandOpen);
  const setOpen = useAppStore((s) => s.setCommandOpen);
  const recent = useAppStore((s) => s.recent);
  const setAdd = useAppStore((s) => s.setAddDependencyOpen);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const setHelp = useAppStore((s) => s.setHelpOpen);
  const plan = useAppStore((s) => s.plan);
  const router = useRouter();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);

  const currentPlan = effectivePlan(plan);
  const agencyEnabled = currentPlan.id === 'enterprise';
  const { data: clients } = useClients(agencyEnabled);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useAppStore.getState().commandOpen);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const nav: Item[] = [
      { id: 'dash', group: 'Navigation', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, shortcut: 'G D' },
      { id: 'cli', group: 'Navigation', label: 'Agency Command Center', href: '/clients', icon: Building2, shortcut: 'G C' },
      { id: 'deps', group: 'Navigation', label: 'Dependencies', href: '/dependencies', icon: Link2, shortcut: 'G P' },
      { id: 'inc', group: 'Navigation', label: 'Incidents', href: '/incidents', icon: TriangleAlert, shortcut: 'G I' },
      { id: 'evi', group: 'Navigation', label: 'Evidence', href: '/evidence', icon: FileText, shortcut: 'G E' },
      { id: 'set', group: 'Navigation', label: 'Settings', href: '/settings', icon: Settings, shortcut: 'G S' },
    ];

    const agencyActions: Item[] = agencyEnabled
      ? [
          {
            id: 'new-client',
            group: 'Agency Actions',
            label: 'Create Client Workspace',
            icon: Plus,
            href: '/clients/onboarding',
          },
        ]
      : [];

    const clientItems: Item[] = (clients ?? []).map((c) => ({
      id: `client-${c.id}`,
      group: 'Client Workspaces',
      label: `Client: ${c.name}`,
      href: `/clients/${c.id}`,
      icon: Building2,
    }));

    const actions: Item[] = [
      {
        id: 'add',
        group: 'Quick Actions',
        label: 'Add Dependency',
        icon: Plus,
        action: () => setAdd(true),
      },
      {
        id: 'report',
        group: 'Quick Actions',
        label: 'Generate Evidence Report',
        icon: FileText,
        action: () => {
          if (!hasEvidence(plan?.effective_plan ?? plan?.plan)) useAppStore.getState().setEvidenceGateOpen(true);
          else router.push('/evidence');
        },
      },
      {
        id: 'help',
        group: 'Quick Actions',
        label: 'Get Help & Support',
        icon: HelpCircle,
        href: '/support',
      },
    ];

    const rec: Item[] = recent.map((r, i) => ({
      id: `r${i}`,
      group: 'Recent',
      label: r.label,
      href: r.href,
      icon: Activity,
    }));

    const all = [...nav, ...agencyActions, ...clientItems, ...actions, ...rec];
    const query = q.trim().toLowerCase();
    if (!query) return all;
    return all.filter((i) => i.label.toLowerCase().includes(query));
  }, [plan, recent, router, setAdd, setHelp, q, agencyEnabled, clients]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return Array.from(map.entries());
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIdx((i) => Math.min(i + 1, items.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[idx];
        if (item) run(item);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, idx]);

  function run(item: Item) {
    setOpen(false);
    if (item.action) item.action();
    else if (item.href) router.push(item.href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 pt-[12vh]" onClick={() => setOpen(false)}>
      <div
        className="rs-modal-in w-[640px] max-w-[90vw] overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated"
        style={{ boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-rs-border-subtle px-5 py-4">
          <Search size={20} className="text-rs-text-tertiary" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            placeholder="Search commands, dependencies, incidents..."
            className="w-full bg-transparent text-base text-rs-text outline-none placeholder:text-rs-text-tertiary"
          />
        </div>
        <div className="max-h-[420px] overflow-y-auto py-2 rs-scrollbar">
          {items.length === 0 && (
            <div className="px-5 py-8 text-sm text-rs-text-tertiary">No matching commands.</div>
          )}
          {grouped.map(([group, list]) => (
            <div key={group}>
              <div className="px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                {q ? 'Search results' : group}
              </div>
              {list.map((item) => {
                // Keyboard selection (`idx`) indexes the FLAT `items` array,
                // while rendering walks the grouped one. The counter this
                // replaces was never declared, so it threw a ReferenceError.
                const flatIndex = items.indexOf(item);
                const selected = flatIndex === idx;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setIdx(flatIndex)}
                    onClick={() => run(item)}
                    className={cn(
                      'flex w-full items-center px-5 py-2.5 text-left',
                      selected && 'border-l-2 border-rs-brand bg-rs-hover'
                    )}
                  >
                    <Icon size={18} className="mr-3 text-rs-text-secondary" />
                    <span className="text-sm text-rs-text">{item.label}</span>
                    {item.shortcut && (
                      <span className="ml-auto rounded border border-rs-border px-1.5 py-0.5 font-mono text-[11px] text-rs-text-tertiary">
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
