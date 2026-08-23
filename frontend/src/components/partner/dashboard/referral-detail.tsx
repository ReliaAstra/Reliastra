'use client';

import { motion } from 'framer-motion';
import { X, Link2, Globe, Target, Clock, Building2, Mail, CreditCard, ArrowDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { partnerApi } from '@/lib/partner-api';
import { formatCurrencyFromMinor, formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/partner/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function ReferralDetailDrawer({
  referralId,
  onClose,
}: {
  referralId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['partner-referral-detail', referralId],
    queryFn: () => partnerApi.getReferralDetail(referralId!),
    enabled: !!referralId,
    staleTime: 30_000,
  });

  if (!referralId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: 400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 400, opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-[480px] bg-background border-l border-border/60 flex flex-col h-full overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0">
          <h2 className="text-sm font-semibold tracking-tight">Referral detail</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="size-8">
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-6 space-y-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-60" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          )}
          {isError && (
            <div className="p-6 text-center">
              <p className="text-sm text-muted-foreground">Failed to load referral.</p>
            </div>
          )}
          {data && (
            <div className="p-6 space-y-6">
              {/* Identity */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" />
                  <span className="font-mono text-sm">{data.masked_email || '—'}</span>
                  <StatusBadge status={data.status} />
                </div>
                {data.organization_name && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="size-4" />
                    {data.organization_name} · {data.plan || '—'}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                  <Clock className="size-3" />
                  Signed up {formatDate(data.created_at)}
                  {data.subscribed_at && ` · Subscribed ${formatDate(data.subscribed_at)}`}
                </div>
              </div>

              {/* Attribution */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Attribution</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Partner code</p>
                    <p className="font-mono flex items-center gap-1">
                      <Link2 className="size-3" /> {data.partner_referral_code || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Acquisition</p>
                    <p className="font-medium flex items-center gap-1">
                      <Globe className="size-3 text-muted-foreground" /> {data.acquisition_bucket || data.acquisition_channel || 'Direct'}
                    </p>
                    {(data.acquisition_source || data.acquisition_campaign) && (
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {data.acquisition_source || ''} {data.acquisition_campaign ? `· ${data.acquisition_campaign}` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground border-t border-border/30 pt-2">
                  Partner attribution = who introduced this user. Acquisition = how they discovered RELIASTRA (campaign source).
                </p>
              </div>

              {/* Commission */}
              <div className="rounded-lg border border-border/60 bg-background p-4">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Commission</p>
                <div className="flex items-baseline gap-2">
                  <CreditCard className="size-4 text-muted-foreground" />
                  <span className="font-mono text-lg tabular-nums">{formatCurrencyFromMinor(data.monthly_commission_minor)}/mo</span>
                  <span className="text-xs text-muted-foreground">at {data.commission_rate}%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Plan amount {formatCurrencyFromMinor(data.subscription_amount_minor)}/mo</p>
              </div>

              {/* Timeline */}
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Timeline</p>
                <div className="relative border-l border-border/40 ml-2 pl-6 space-y-0">
                  {data.timeline.map((ev, idx) => (
                    <div key={idx} className="relative pb-6 last:pb-0">
                      <div className="absolute -left-[29px] top-0 size-5 rounded-full bg-foreground text-background flex items-center justify-center">
                        <ArrowDown className="size-3" />
                      </div>
                      <p className="text-sm font-medium">{ev.label}</p>
                      {ev.detail && <p className="text-xs text-muted-foreground font-mono truncate">{ev.detail}</p>}
                      {ev.at && <p className="text-[11px] font-mono text-muted-foreground">{formatDate(ev.at)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
