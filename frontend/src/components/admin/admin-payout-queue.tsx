'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, Landmark, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/admin-api';
import { formatAdminDate, formatMinorCurrency } from '@/lib/admin-utils';
import {
  AdminCard,
  AdminEmptyState,
  ImpactDialog,
  SectionFailure,
  SectionHeading,
  SectionSkeleton,
  StatusPill,
} from '@/components/admin/admin-primitives';
import { Button } from '@/components/ui/button';
import type { AdminPayoutItem } from '@/types/admin';

/** Payout states that still need a human to move money. */
const OPEN_STATUSES = ['pending', 'processing'];

type PendingAction = {
  payout: AdminPayoutItem;
  action: 'mark_paid' | 'mark_failed';
};

/**
 * The settlement queue.
 *
 * Payout requests used to be invisible: the endpoint existed but nothing
 * rendered it, so an admin had to open partners one by one to discover that
 * someone was waiting to be paid. This surfaces every open request with the
 * destination to send to, and settles it in place.
 */
export function PartnerPayoutQueue() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingAction | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'partners', 'payout-queue'],
    queryFn: () => adminApi.partnerPayouts({ status: 'pending', page_size: 50 }),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const mutation = useMutation({
    mutationFn: ({
      id,
      action,
      reference,
    }: {
      id: string;
      action: 'mark_paid' | 'mark_failed';
      reference?: string;
    }) =>
      adminApi.processPayout(
        id,
        action === 'mark_paid'
          ? { action, transaction_reference: reference }
          : { action }
      ),
    onSuccess: async (_data, variables) => {
      toast.success(
        variables.action === 'mark_paid'
          ? 'Payout marked paid — the partner has been notified'
          : 'Payout marked failed — the balance was returned to the partner'
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Could not process payout'),
  });

  const items = (query.data?.items || []).filter((payout) =>
    OPEN_STATUSES.includes(payout.status)
  );

  return (
    <AdminCard>
      <SectionHeading
        title="Payout queue"
        subtitle="Partners waiting to be paid — send the money, then record it here"
      />
      <div className="border-t border-slate-100 dark:border-white/10">
        {query.isLoading && <SectionSkeleton lines={4} />}

        {query.isError && (
          <SectionFailure
            title="Payout queue unavailable."
            description="The partner list can still be retried independently."
            onRetry={() => query.refetch()}
          />
        )}

        {!query.isLoading && !query.isError && items.length === 0 && (
          <AdminEmptyState
            title="Nothing awaiting payout."
            description="Requests appear here the moment a partner asks to withdraw a payable balance."
            icon={CircleDollarSign}
          />
        )}

        {!query.isLoading && !query.isError && items.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {items.map((payout) => {
              const isBank = payout.payout_method === 'bank';
              return (
                <div
                  key={payout.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                      {isBank ? <Landmark className="size-4" /> : <Wallet className="size-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium tabular-nums text-slate-800 dark:text-slate-100">
                          {formatMinorCurrency(payout.amount_minor, payout.currency)}
                        </p>
                        <StatusPill status={payout.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        <Link
                          href={`/admin/partners/${payout.partner_id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {payout.partner_email || payout.partner_id}
                        </Link>
                        {' · requested '}
                        {formatAdminDate(payout.requested_at)}
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {payout.payout_destination || 'No payout destination configured'}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!payout.payout_method}
                      onClick={() => setPending({ payout, action: 'mark_paid' })}
                    >
                      Mark paid
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
                      onClick={() => setPending({ payout, action: 'mark_failed' })}
                    >
                      Mark failed
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pending && (
        <ImpactDialog
          open={Boolean(pending)}
          onOpenChange={(open) => {
            if (!open) setPending(null);
          }}
          title={pending.action === 'mark_paid' ? 'Mark payout paid?' : 'Mark payout failed?'}
          description="Payout state is a financial control and is recorded in the audit trail."
          what={`${formatMinorCurrency(pending.payout.amount_minor, pending.payout.currency)} → ${pending.payout.payout_destination || 'no destination configured'}`}
          why={
            pending.action === 'mark_paid'
              ? 'Confirm the external transfer has settled.'
              : 'Record that this payout could not be completed.'
          }
          impact={
            pending.action === 'mark_paid'
              ? 'The payout and its commissions are marked paid, and the partner is notified in their dashboard and by email with this reference.'
              : 'The payout is marked failed, the reserved commissions return to the partner’s payable balance, and the partner is notified.'
          }
          confirmLabel={pending.action === 'mark_paid' ? 'Mark paid' : 'Mark failed'}
          destructive={pending.action === 'mark_failed'}
          reasonRequired={pending.action === 'mark_paid'}
          reasonLabel="Transaction reference"
          reasonPlaceholder="On-chain tx hash or bank transfer reference"
          onConfirm={(reference) =>
            mutation.mutateAsync({
              id: pending.payout.id,
              action: pending.action,
              reference,
            })
          }
        />
      )}
    </AdminCard>
  );
}
