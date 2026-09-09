'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Link2 } from 'lucide-react';
import {
  getReferralCodeFromSearch,
  getStoredReferralCode,
  persistPublicReferralCookie,
} from '@/lib/partner-referral';

export { getStoredReferralCode } from '@/lib/partner-referral';

function detectInitialReferral(): { code: string | null; showBanner: boolean } {
  if (typeof window === 'undefined') return { code: null, showBanner: false };

  const urlRef = getReferralCodeFromSearch(window.location.search);
  if (urlRef) {
    persistPublicReferralCookie(urlRef);
    return { code: urlRef, showBanner: true };
  }

  return { code: getStoredReferralCode(), showBanner: false };
}

export function ReferralBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [{ code: refCode, showBanner: initiallyShown }] = useState(
    detectInitialReferral
  );
  const [showBanner, setShowBanner] = useState(initiallyShown);

  if (dismissed || !showBanner || !refCode) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const }}
        className="border-b border-border/60 bg-muted/40"
      >
        <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background border border-border/60">
                <Link2 className="size-3 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground truncate">
                You were referred by a partner.{' '}
                <span className="font-mono text-xs text-foreground">{refCode}</span>
              </p>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
