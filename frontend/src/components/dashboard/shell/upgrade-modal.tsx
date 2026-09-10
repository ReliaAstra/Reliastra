'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { RsButton } from '../ui/button';

/**
 * Upgrade Plan no longer opens a pricing popup. `openUpgrade()` still exists
 * so existing callers keep working; this component converts that intent into
 * a navigation to the dedicated checkout.
 */
export function UpgradeModal() {
  const open = useAppStore((s) => s.upgradeOpen);
  const close = useAppStore((s) => s.closeUpgrade);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    close();
    router.push('/checkout?plan=pro&interval=monthly');
  }, [open, close, router]);

  return null;
}

export function EvidenceGateModal() {
  const open = useAppStore((s) => s.evidenceGateOpen);
  const setOpen = useAppStore((s) => s.setEvidenceGateOpen);
  const openUpgrade = useAppStore((s) => s.openUpgrade);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div
      className="rs-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-[rgb(11_15_25_/_0.5)] p-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="rs-modal-panel rs-modal-in w-full max-w-md rounded-xl border border-rs-border-subtle bg-rs-elevated p-8 shadow-rs-modal"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <h2 className="text-lg font-semibold text-rs-text">Evidence reports are a Pro feature</h2>
        <p className="mt-2 text-sm leading-relaxed text-rs-text-secondary">
          Generate verifiable SLA evidence backed by deterministic checks.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <RsButton
            onClick={() => {
              setOpen(false);
              openUpgrade('evidence');
            }}
          >
            Subscribe to Pro
          </RsButton>
          <RsButton variant="ghost" onClick={() => setOpen(false)}>
            Maybe later
          </RsButton>
        </div>
      </div>
    </div>
  );
}
