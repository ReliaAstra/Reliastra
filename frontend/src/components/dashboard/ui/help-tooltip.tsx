'use client';

import { HelpCircle } from 'lucide-react';
import { useState } from 'react';

interface Props {
  title: string;
  body: string;
  href?: string;
}

export function HelpTooltip({ title, body, href = 'mailto:support@reliastra.com' }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={title}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-6 w-6 items-center justify-center text-rs-text-tertiary hover:text-rs-text-secondary"
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-2 w-[280px] -translate-x-1/2 rounded-lg border border-rs-border-subtle bg-rs-elevated px-4 py-3 text-left"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
        >
          <span className="block text-sm font-medium text-rs-text">{title}</span>
          <span className="mt-1 block text-[13px] leading-normal text-rs-text-secondary">
            {body}
          </span>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-[13px] text-rs-text-accent"
          >
            Learn more →
          </a>
        </span>
      )}
    </span>
  );
}
