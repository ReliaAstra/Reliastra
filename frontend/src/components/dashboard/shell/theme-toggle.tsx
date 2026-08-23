'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

type Mode = 'light' | 'dark' | 'system';

const OPTIONS: { id: Mode; icon: typeof Sun; label: string }[] = [
  { id: 'light', icon: Sun, label: 'Light' },
  { id: 'dark', icon: Moon, label: 'Dark' },
  { id: 'system', icon: Monitor, label: 'System' },
];

/**
 * Premium light/dark/system switcher.
 * Light = crisp enterprise white; Dark = rich navy-slate (never flat black).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={cn('h-9 w-[92px] rounded-lg bg-rs-hover', className)} aria-hidden />;
  }

  const current = OPTIONS.some((o) => o.id === theme) ? (theme as Mode) : 'system';

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn(
        'inline-flex h-9 items-center gap-0.5 rounded-lg border border-rs-border-subtle bg-rs-elevated p-0.5',
        className
      )}
    >
      {OPTIONS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={current === id}
          aria-label={`${label} theme`}
          title={`${label} theme`}
          onClick={() => setTheme(id)}
          className={cn(
            'flex h-7 w-8 items-center justify-center rounded-md transition-colors duration-150',
            current === id
              ? 'bg-rs-brand-subtle text-rs-brand'
              : 'text-rs-text-tertiary hover:bg-rs-hover hover:text-rs-text-secondary'
          )}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
