'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePartnerStore } from '@/stores/partner-store';
import { partnerApi } from '@/lib/partner-api';
import { toast } from 'sonner';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
};

export function PageApply() {
  const navigate = usePartnerStore((s) => s.navigate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleActivate = async () => {
    setLoading(true);
    setError(null);
    const store = usePartnerStore.getState();

    try {
      // `partnerApi` attaches the bearer token and unwraps the
      // `{ error: { code, message } }` envelope, so failures surface a real
      // message instead of "[object Object]".
      //
      // Activation is idempotent server-side (an existing partner gets their
      // profile back), so there is no "already a partner" case to special-case
      // any more — the branch that used to do that was mock-era dead code.
      const profile = await partnerApi.apply({ agree_terms: true });

      store.setPartner({
        partnerId: profile.partner_id,
        referralCode: profile.referral_code,
        referralLink: profile.referral_link,
        commissionRate: profile.commission_rate,
        status: profile.status,
        createdAt: profile.created_at,
      });
      toast.success('Partner account activated');
      navigate('dashboard');
    } catch (err) {
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        // Session expired mid-flow — sign in again rather than dead-ending.
        setError('Your session expired. Please sign in again.');
        navigate('login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <motion.div initial="hidden" animate="visible">
          {/* Back link */}
          <motion.div variants={fadeUp} custom={0} className="mb-8">
            <button
              onClick={() => navigate('home')}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              Back to Partner Network
            </button>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Activate your Partner account
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="mt-3 text-sm leading-relaxed text-muted-foreground max-w-sm mx-auto"
          >
            Get your personal referral link and earn 30% of every referred customer&apos;s subscription each month.
          </motion.p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 inline-block rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
            >
              {error}
            </motion.div>
          )}

          <motion.div variants={fadeUp} custom={3} className="mt-8">
            <Button
              size="lg"
              onClick={handleActivate}
              disabled={loading}
              className="min-w-[260px]"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  ACTIVATING...
                </>
              ) : (
                <>
                  ACTIVATE PARTNER ACCOUNT
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </motion.div>

          <motion.div variants={fadeUp} custom={4} className="mt-12 flex justify-center gap-8 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              No cost to join
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              Instant activation
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              30% recurring
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
