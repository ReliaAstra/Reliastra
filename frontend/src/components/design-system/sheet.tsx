'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function RsSheet({
  open,
  onOpenChange,
  side = 'left',
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  side?: 'left' | 'right';
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(11_15_25_/_0.5)] rs-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 z-50 flex w-[320px] flex-col bg-rs-base shadow-rs-modal focus-visible:outline-none',
            side === 'left' ? 'left-0' : 'right-0',
            'rs-fade-in'
          )}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
