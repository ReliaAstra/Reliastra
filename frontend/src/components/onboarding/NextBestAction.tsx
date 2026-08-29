'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { RsButton } from '@/components/dashboard/ui/button';

export function NextBestAction({
  title,
  desc,
  primary,
  secondary,
}: {
  title: string;
  desc: string;
  primary: { label: string; onClick: () => void };
  secondary?: { label: string; href: string };
}) {
  return (
    <div className="mt-6 rounded-xl border border-rs-brand/20 bg-rs-brand-subtle p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="rs-label text-rs-text">Next step</div>
          <div className="mt-1 text-sm font-semibold text-rs-text">{title}</div>
          <div className="mt-1 max-w-xl text-[13px] leading-relaxed text-rs-text-secondary">{desc}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RsButton onClick={primary.onClick}>{primary.label} <ArrowRight size={14} /></RsButton>
          {secondary && (
            <Link href={secondary.href} className="text-xs font-medium text-rs-text-tertiary hover:text-rs-text">
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
