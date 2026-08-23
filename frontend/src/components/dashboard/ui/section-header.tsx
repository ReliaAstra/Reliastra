'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  href?: string;
  action?: ReactNode;
  help?: ReactNode;
}

export function SectionHeader({ title, subtitle, href, action, help }: Props) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-1">
          <h2 className="rs-section-title text-base font-semibold tracking-[-0.01em] text-rs-text">{title}</h2>
          {help}
        </div>
        {subtitle && (
          <p className="mt-1 text-sm text-rs-text-tertiary">{subtitle}</p>
        )}
      </div>
      {href ? (
        <Link
          href={href}
          className="text-sm font-medium text-rs-brand hover:text-rs-brand-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
        >
          View all
        </Link>
      ) : (
        action
      )}
    </div>
  );
}
