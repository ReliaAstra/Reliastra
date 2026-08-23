'use client';

import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-rs-brand text-white border border-transparent hover:bg-rs-brand-hover active:brightness-[0.95] disabled:opacity-50 disabled:pointer-events-none',
  secondary:
    'bg-rs-elevated border border-rs-border-subtle text-rs-text hover:bg-rs-hover hover:border-rs-border disabled:opacity-50 disabled:pointer-events-none',
  danger:
    'bg-rs-down text-white border border-transparent hover:brightness-[0.92] active:brightness-[0.88] disabled:opacity-50 disabled:pointer-events-none',
  ghost:
    'bg-transparent border border-transparent text-rs-text-secondary hover:bg-rs-hover hover:text-rs-text disabled:opacity-50 disabled:pointer-events-none',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs', // 28px / 10px / 12px
  md: 'h-9 px-3.5 text-[13px] md:text-sm', // 36px / 14px / 13-14px
  lg: 'h-10 px-5 text-sm', // 40px / 20px / 14px
  icon: 'h-9 w-9 p-0',
};

export function RsButton({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        // Base per spec: rounded 10px, gap 6px, icon 16px, focus ring 2px --rs-focus offset 2px
        'rs-button inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium cursor-pointer',
        'transition-[background-color,border-color,color,filter,opacity] duration-150 ease',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus focus-visible:ring-offset-2 focus-visible:ring-offset-rs-base',
        'disabled:opacity-50 disabled:pointer-events-none',
        '[&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
}
