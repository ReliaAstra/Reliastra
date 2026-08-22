'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Check, Loader2, AlertTriangle, Landmark } from 'lucide-react';
import { usePartnerStore } from '@/stores/partner-store';
import { partnerApi } from '@/lib/partner-api';
import { toast } from 'sonner';
import { formatCurrencyFromMinor, formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/partner/shared/status-badge';
import { DashboardPayoutsSkeleton } from '@/components/partner/shared/dashboard-skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PayoutItem, PayoutListResponse, Partner } from '@/types/partner';

const METHOD_LABELS: Record<string, string> = {
  crypto_usdc: 'USD Coin (USDC)',
  crypto_usdt: 'Tether (USDT)',
  bank: 'Bank Transfer',
};

function destinationSummary(partner: Partner | null): string {
  const method = partner?.payoutMethod;
  if (!method) return '';
  if (method === 'bank') {
    const name = partner?.bankDetails?.bank_name;
    const acct = partner?.bankDetails?.account_number;
    return `${name || 'Bank Transfer'}${acct ? ` · ••••${acct.slice(-4)}` : ''}`;
  }
  const parts = [METHOD_LABELS[method] || method];
  if (partner?.payoutNetwork) parts.push(partner.payoutNetwork);
  if (partner?.walletAddress) parts.push(partner.walletAddress);
  return parts.join(' · ');
}

// --- Payout destination banner ---
function PayoutDestinationBanner({ partner }: { partner: Partner | null }) {
  const navigate = usePartnerStore((s) => s.navigate);
  const hasMethod = Boolean(partner?.payoutMethod);
  const summary = destinationSummary(partner);
  const isBank = partner?.payoutMethod === 'bank';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className={cn(
        'rounded-lg border p-5 md:p-6',
        hasMethod ? 'border-border/60 bg-background' : 'border-amber-500/40 bg-amber-500/[0.06]'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex items-center justify-center size-8 rounded-full shrink-0 mt-0.5',
            hasMethod ? 'bg-muted/80 text-foreground' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          )}
        >
          {hasMethod ? (
            isBank ? <Landmark className="size-4" /> : <Wallet className="size-4" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {hasMethod ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <p className="text-sm font-semibold">Payout destination</p>
                <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-[0.12em]">
                  {METHOD_LABELS[partner?.payoutMethod || ''] || partner?.payoutMethod}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed break-words">
                <span className="font-mono text-foreground/90">{summary}</span>{' '}
                <button
                  onClick={() => navigate('settings')}
                  className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80 transition-colors"
                >
                  Edit in Settings
                </button>
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <p className="text-sm font-semibold">Add a payout method</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You haven't configured how you'd like to be paid. Add a crypto
                wallet or bank account so we know where to send your earnings.{' '}
                <button
                  onClick={() => navigate('settings')}
                  className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80 transition-colors"
                >
                  Set it up in Settings → Payout Info
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// --- Payout confirm dialog ---
function PayoutConfirmDialog({
  open,
  onOpenChange,
  payable,
  onConfirm,
  isProcessing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payable: string;
  onConfirm: () => void;
  isProcessing: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/60 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Payout</DialogTitle>
          <DialogDescription>
            You are about to request a payout. This will create a pending
            payout request for the available balance.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-4">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
            AVAILABLE BALANCE
          </p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {payable}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Payout will be processed within 5-7 business days to your configured
          payout destination (Settings → Payout Info).
        </p>

        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isProcessing}>
            <AnimatePresence mode="wait">
              {isProcessing ? (
                <motion.span
                  key="loading"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="flex items-center gap-2"
                >
                  <Loader2 className="size-4 animate-spin" />
                  Processing
                </motion.span>
              ) : (
                <motion.span
                  key="confirm"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                >
                  Confirm Payout
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayoutsEmpty({ payable, onOpenDialog, partner, disabled, hint }: { payable: string; onOpenDialog: () => void; partner: Partner | null; disabled: boolean; hint: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl space-y-8"
    >
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Payouts
        </h1>
      </div>
      <div className="border border-border/60 rounded-lg bg-background p-6 md:p-8">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Available to withdraw
        </p>
        <p className="text-4xl md:text-5xl font-semibold tracking-tight tabular-nums mb-6">
          {payable}
        </p>
        <Button
          onClick={onOpenDialog}
          disabled={disabled}
          className="min-w-[200px]"
        >
          REQUEST PAYOUT
        </Button>
        {hint && (
          <p className="mt-3 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>

      <PayoutDestinationBanner partner={partner} />

      <div className="py-16 text-center">
        <h3 className="text-lg font-medium tracking-tight mb-2">
          No payouts yet
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          When you request a payout, it will appear here with its processing
          status.
        </p>
      </div>
    </motion.div>
  );
}

// --- Payout row ---
function PayoutRow({ payout, index }: { payout: PayoutItem; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.02 * index }}
      className="border-b border-border/30 last:border-b-0 hover:bg-muted/30 transition-colors"
    >
      {/* Desktop row */}
      <div className="hidden md:flex items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm">
                {payout.period || 'Payout'}
              </p>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
              {payout.paid_at && (
                <span>Paid {formatDate(payout.paid_at)}</span>
              )}
              {payout.transaction_reference && (
                <span className="ml-2 text-[10px]">Ref: {payout.transaction_reference}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 ml-4">
          <StatusBadge status={payout.status} />
          <span className="font-mono text-sm tabular-nums min-w-[80px] text-right">
            {formatCurrencyFromMinor(payout.amount_minor, payout.currency)}
          </span>
        </div>
      </div>
      {/* Mobile card */}
      <div className="md:hidden px-5 py-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm">
            {payout.period || 'Payout'}
          </span>
          <StatusBadge status={payout.status} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-muted-foreground">
            {payout.paid_at ? formatDate(payout.paid_at) : (payout.period || '')}
          </span>
          <span className="font-mono text-sm tabular-nums">
            {formatCurrencyFromMinor(payout.amount_minor, payout.currency)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// --- Main page ---
export function PagePayouts() {
  const queryClient = useQueryClient();
  const dashboardData = usePartnerStore((s) => s.dashboardData);
  const partner = usePartnerStore((s) => s.partner);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [payoutState, setPayoutState] = useState<'idle' | 'processing' | 'requested'>('idle');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: response, isLoading, isError } = useQuery<PayoutListResponse>({
    queryKey: ['partner-payouts', page],
    queryFn: () => partnerApi.getPayouts(page, pageSize),
    staleTime: 30_000,
  });

  const list = response?.items || [];
  const total = response?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // "Available to withdraw" is the *payable* balance: commissions whose hold
  // period has elapsed and that are not already reserved by an open payout.
  // `pending_commission_minor` is deliberately NOT used here — it also counts
  // money still on hold and money already inside a pending payout, which would
  // show the partner a figure they cannot actually withdraw.
  const currency = dashboardData?.currency || 'USD';
  const payableMinor = dashboardData?.payable_balance_minor ?? 0;
  const payableDisplay = formatCurrencyFromMinor(payableMinor, currency);
  const onHoldMinor = Math.max(
    (dashboardData?.pending_commission_minor ?? 0) - payableMinor,
    0
  );
  const inTransitMinor = dashboardData?.in_transit_minor ?? 0;
  const minimumMinor = dashboardData?.minimum_payout_minor ?? 0;
  const belowMinimum = payableMinor > 0 && payableMinor < minimumMinor;

  // Explain the gap between "earned" and "withdrawable" instead of silently
  // disabling the button.
  const balanceHint = (() => {
    if (belowMinimum) {
      return `Minimum payout is ${formatCurrencyFromMinor(minimumMinor, currency)} — keep earning to unlock a withdrawal.`;
    }
    const parts: string[] = [];
    if (onHoldMinor > 0) {
      parts.push(
        `${formatCurrencyFromMinor(onHoldMinor, currency)} still in the hold period`
      );
    }
    if (inTransitMinor > 0) {
      parts.push(
        `${formatCurrencyFromMinor(inTransitMinor, currency)} reserved by a payout in progress`
      );
    }
    return parts.length ? `Also earned: ${parts.join(' · ')}.` : null;
  })();

  const handleRequestPayout = useCallback(async () => {
    if (payoutState !== 'idle') return;
    if (!partner?.payoutMethod) {
      toast.error('Add a payout method before requesting a payout');
      usePartnerStore.getState().navigate('settings');
      return;
    }
    setPayoutState('processing');
    try {
      await partnerApi.requestPayout();
      setPayoutState('requested');
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['partner-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['partner-dashboard'] });
      setTimeout(() => setPayoutState('idle'), 3000);
    } catch (err) {
      setPayoutState('idle');
      toast.error(err instanceof Error ? err.message : 'Could not request payout');
    }
  }, [payoutState, queryClient, partner]);

  const handleConfirmPayout = useCallback(async () => {
    setConfirmOpen(false);
    await handleRequestPayout();
  }, [handleRequestPayout]);

  if (isLoading) {
    return <DashboardPayoutsSkeleton />;
  }

  if (isError) {
    return (
      <div className="max-w-4xl">
        <p className="text-sm text-muted-foreground">
          Unable to load payouts. Please try refreshing.
        </p>
      </div>
    );
  }

  if (list.length === 0 && page === 1) {
    return (
      <>
        <PayoutsEmpty
          payable={payableDisplay}
          partner={partner}
          disabled={payableMinor <= 0 || belowMinimum}
          hint={balanceHint}
          onOpenDialog={() => setConfirmOpen(true)}
        />
        <PayoutConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          payable={payableDisplay}
          onConfirm={handleConfirmPayout}
          isProcessing={payoutState === 'processing'}
        />
      </>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      {/* Heading */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Payouts
        </h1>
      </motion.div>

      {/* Available to withdraw card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="border border-border/60 rounded-lg bg-background p-6 md:p-8"
      >
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Available to withdraw
        </p>
        <p className="text-4xl md:text-5xl font-semibold tracking-tight tabular-nums mb-6">
          {payableDisplay}
        </p>
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={payoutState !== 'idle' || payableMinor <= 0 || belowMinimum}
          className="min-w-[200px]"
        >
          <AnimatePresence mode="wait">
            {payoutState === 'idle' && (
              <motion.span
                key="idle"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="flex items-center gap-2"
              >
                <Wallet className="size-4" />
                REQUEST PAYOUT
              </motion.span>
            )}
            {payoutState === 'processing' && (
              <motion.span
                key="processing"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="flex items-center gap-2"
              >
                <Loader2 className="size-4 animate-spin" />
                PROCESSING
              </motion.span>
            )}
            {payoutState === 'requested' && (
              <motion.span
                key="requested"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="flex items-center gap-2"
              >
                <Check className="size-4" />
                REQUESTED
              </motion.span>
            )}
          </AnimatePresence>
        </Button>

        {balanceHint && (
          <p className="mt-3 text-xs text-muted-foreground">{balanceHint}</p>
        )}
      </motion.div>

      {/* Payout destination banner */}
      <PayoutDestinationBanner partner={partner} />

      {/* Payout history */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="border border-border/60 rounded-lg bg-background overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-border/60">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Payout history
          </p>
        </div>
        {list.map((p, i) => (
          <PayoutRow key={p.id} payout={p} index={i} />
        ))}
      </motion.div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <motion.button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            Previous
          </motion.button>
          <span className="text-xs font-mono text-muted-foreground px-3">
            {page} / {totalPages}
          </span>
          <motion.button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            Next
          </motion.button>
        </div>
      )}

      <PayoutConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        payable={payableDisplay}
        onConfirm={handleConfirmPayout}
        isProcessing={payoutState === 'processing'}
      />
    </div>
  );
}
