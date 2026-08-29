'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function RsDialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(11_15_25_/_0.5)] rs-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            'rs-modal-panel fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-rs-elevated p-6 shadow-rs-modal rs-modal-in',
            'focus-visible:outline-none'
          )}
        >
          {children}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-rs-text-tertiary hover:bg-rs-hover hover:text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus">
            <X size={16} />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function RsDialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <DialogPrimitive.Title className={cn('rs-section-title', className)}>{children}</DialogPrimitive.Title>;
}

export function RsDialogDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <DialogPrimitive.Description className={cn('rs-secondary-body mt-1', className)}>{children}</DialogPrimitive.Description>;
}
