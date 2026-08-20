'use client';

import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary:
    'bg-rs-brand text-white border-none hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed',
  secondary:
    'bg-transparent border border-rs-border text-rs-text hover:bg-rs-hover',
  danger:
    'bg-transparent border border-[rgba(239,68,68,0.3)] text-rs-down hover:bg-[rgba(239,68,68,0.1)]',
  ghost: 'bg-transparent border-none text-rs-text-secondary hover:text-rs-text px-3 py-1.5',
};

export function RsButton({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-[filter,background-color,color,border-color] duration-150 md:min-h-0',
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
