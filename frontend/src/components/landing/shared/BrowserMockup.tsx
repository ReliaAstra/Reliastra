'use client';

import { cn } from '@/lib/utils';

interface BrowserMockupProps {
  url?: string;
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

export function BrowserMockup({
  url = 'reliastra.com/dashboard',
  children,
  className,
  ...rest
}: BrowserMockupProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border shadow-elevated bg-white dark:border-white/10 dark:bg-[#131318]',
        'border-[#E4E4E7] dark:border-white/10',
        className
      )}
      {...rest}
    >
      <div className="flex items-center gap-2 border-b border-[#E4E4E7] bg-[#F8F9FA] px-4 py-3.5 dark:border-white/10 dark:bg-[#1A1A20]">
        <div className="flex gap-1.5">
          <div className="h-[10px] w-[10px] rounded-full bg-[#EF4444]" />
          <div className="h-[10px] w-[10px] rounded-full bg-[#F59E0B]" />
          <div className="h-[10px] w-[10px] rounded-full bg-[#22C55E]" />
        </div>
        <div className="flex-1 text-center">
          <span className="font-mono text-xs text-[#A1A1AA] dark:text-[#71717A]">
            {url}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}
