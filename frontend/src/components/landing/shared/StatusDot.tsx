'use client';

import { cn } from '@/lib/utils';

interface StatusDotProps {
  status: 'up' | 'degraded' | 'down';
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusDot({ status, size = 'sm', className }: StatusDotProps) {
  const sizeClasses = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
  const colorClasses = {
    up: 'bg-[#16A34A]',
    degraded: 'bg-[#D97706]',
    down: 'bg-[#DC2626]',
  };
  const pulseClasses = status === 'up' ? 'animate-pulse' : '';

  return (
    <span className={cn('relative inline-flex rounded-full', sizeClasses, className)}>
      <span className={cn('absolute inset-0 rounded-full', colorClasses[status], pulseClasses)} />
      <span
        className={cn('relative inline-flex rounded-full', sizeClasses, colorClasses[status])}
      />
    </span>
  );
}
