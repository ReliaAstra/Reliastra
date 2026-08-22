'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Copy, Eye, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import type { AdminPayoutDestinationReveal } from '@/types/admin';

/**
 * Reveal a partner's payable destination.
 *
 * Payout destinations are encrypted at rest and masked everywhere in the admin
 * UI. This button is the only way to see the real wallet address or account
 * number, it is meant to be pressed at the moment of settlement, and every
 * press is written to the audit trail with the admin's name on it.
 */
export function RevealDestinationButton({
  partnerId,
  size = 'sm',
  variant = 'outline',
}: {
  partnerId: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost';
}) {
  const [revealed, setRevealed] = useState<AdminPayoutDestinationReveal | null>(null);

  const mutation = useMutation({
    mutationFn: () => adminApi.revealPayoutDestination(partnerId),
    onSuccess: (data) => setRevealed(data),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Could not reveal destination'),
  });

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied');
    } catch {
      toast.error('Clipboard unavailable');
    }
  };

  if (!revealed) {
    return (
      <Button
        size={size}
        variant={variant}
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        title="Reveals the payable destination. This access is audited."
      >
        {mutation.isPending ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Eye className="mr-1.5 size-3.5" />
        )}
        Reveal to pay
      </Button>
    );
  }

  const bank = revealed.bank_details || {};
  const rows: [string, string][] = revealed.wallet_address
    ? [
        ['Network', revealed.payout_network || '—'],
        ['Wallet', revealed.wallet_address],
      ]
    : [
        ['Account name', bank.account_name || '—'],
        ['Bank', bank.bank_name || '—'],
        ['Account number', bank.account_number || '—'],
        ...((bank.routing_number ? [['Routing', bank.routing_number]] : []) as [string, string][]),
        ...((bank.swift_bic ? [['SWIFT / BIC', bank.swift_bic]] : []) as [string, string][]),
      ];

  return (
    <div className="w-full space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
        <ShieldAlert className="size-3.5" />
        Revealed — this access was logged
      </div>

      {revealed.in_cooldown && (
        <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
          This destination was changed recently and is still inside the security
          hold. Confirm with the partner before sending anything.
        </p>
      )}

      <dl className="space-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-slate-500">{label}</dt>
            <dd className="flex min-w-0 items-center gap-1.5">
              <span className="break-all font-mono text-slate-800 dark:text-slate-100">
                {value}
              </span>
              {value !== '—' && (
                <button
                  onClick={() => void copy(value)}
                  aria-label={`Copy ${label}`}
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <Copy className="size-3" />
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <button
        onClick={() => setRevealed(null)}
        className="text-[11px] text-slate-500 underline-offset-2 hover:underline"
      >
        Hide
      </button>
    </div>
  );
}
