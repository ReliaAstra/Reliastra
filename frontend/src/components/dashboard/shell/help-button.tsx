'use client';

import {
  Bug,
  MessageCircle,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/app-store';

const ITEMS = [
  { icon: MessageCircle, label: 'Contact support', href: 'mailto:support@reliastra.com' },
  { icon: Bug, label: 'Report a bug', href: 'mailto:support@reliastra.com?subject=Bug%20report' },
];

export function HelpButton() {
  const open = useAppStore((s) => s.helpOpen);
  const setOpen = useAppStore((s) => s.setHelpOpen);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open, setOpen]);

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-40">
      {open && (
        <div
          className="absolute bottom-14 right-0 min-w-[200px] rounded-xl border border-rs-border-subtle bg-rs-elevated p-2"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
        >
          {ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.label}
                href={item.href}
                target={item.href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                className="flex items-center rounded-md px-3 py-2.5 hover:bg-rs-hover"
              >
                <Icon size={16} className="mr-2.5 text-rs-text-secondary" />
                <span className="text-sm text-rs-text">{item.label}</span>
              </a>
            );
          })}
        </div>
      )}
      <button
        type="button"
        aria-label="Help"
        onClick={() => setOpen(!open)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-rs-brand text-white transition-transform duration-150 hover:scale-105"
        style={{ boxShadow: '0 4px 16px rgba(37,99,235,0.3)' }}
      >
        <MessageCircle size={24} color="white" />
      </button>
    </div>
  );
}
