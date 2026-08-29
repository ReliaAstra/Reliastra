import { cn } from '@/lib/utils';
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';

export function RsInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('rs-input', className)} {...props} />;
}

export function RsTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('rs-input min-h-[88px] py-3', className)} {...props} />;
}

export function RsSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'rs-input pr-8',
        'appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2369748A%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
