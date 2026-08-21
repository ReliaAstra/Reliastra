'use client';

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { usePartnerStore } from '@/stores/partner-store';
import { partnerApi } from '@/lib/partner-api';
import { toast } from 'sonner';
import { maskEmail } from '@/lib/format';
import { ReferralLinkCard } from '@/components/partner/shared/referral-link-card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DashboardSettingsSkeleton } from '@/components/partner/shared/dashboard-skeleton';
import { useState, useEffect } from 'react';
import type { PayoutMethod } from '@/types/partner';

// --- Account tab ---
function AccountTab() {
  const user = usePartnerStore((s) => s.user);

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'P';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center size-12 rounded-full bg-muted text-sm font-mono font-medium">
          {initials}
        </div>
        <div>
          <p className="font-medium">{user?.name || 'Partner'}</p>
          <p className="text-sm text-muted-foreground font-mono">
            {user?.email || ''}
          </p>
        </div>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Name
          </Label>
          <Input
            value={user?.name || ''}
            disabled
            className="font-mono text-sm bg-muted/50"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Email
          </Label>
          <Input
            value={user?.email || ''}
            disabled
            className="font-mono text-sm bg-muted/50"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Partner status
        </Label>
        <div>
          <Badge variant="outline" className="text-xs font-mono">
            {user?.partner?.status?.toUpperCase() || 'ACTIVE'}
          </Badge>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Account details are managed through your RELIASTRA account. Contact support to make changes.
      </p>

      <Separator />

      {/* Customer Support */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-border/60 p-4 md:p-5">
        <div>
          <p className="text-sm font-medium">Need help?</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Our partner support team is here to assist you with any questions.
          </p>
        </div>
        <button
          onClick={() => usePartnerStore.getState().navigate('support')}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-xs font-mono font-medium uppercase tracking-wider text-background transition-colors hover:bg-foreground/90 shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Contact Support
        </button>
      </div>
    </div>
  );
}

// --- Crypto option card ---
function CryptoOptionCard({
  name,
  symbol,
  network,
  recommended,
  selected,
  onSelect,
}: {
  name: string;
  symbol: string;
  network: string;
  recommended: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative w-full text-left rounded-lg border-2 p-4 md:p-5 transition-all duration-200',
        'hover:border-foreground/40 hover:shadow-sm',
        selected
          ? 'border-foreground/80 bg-muted/30'
          : 'border-border/60 bg-background'
      )}
    >
      {/* Most Recommended badge */}
      {recommended && (
        <div className="absolute -top-2.5 left-4">
          <Badge className="bg-foreground text-background border-0 text-[9px] font-mono uppercase tracking-[0.15em] px-2 py-0.5">
            Most Recommended
          </Badge>
        </div>
      )}

      <div className="flex items-center gap-3 mt-1">
        {/* Crypto icon */}
        <div className={cn(
          'flex items-center justify-center size-10 rounded-full border shrink-0',
          selected ? 'border-foreground/40 bg-muted/50' : 'border-border/60'
        )}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-foreground">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 6v12M8 10c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4M8 14c0 2.2 1.8 4 4 4s4-1.8 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold tracking-tight">{name}</p>
          <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
            {network}
          </p>
        </div>

        {/* Selection indicator */}
        <div className={cn(
          'flex items-center justify-center size-5 rounded-full border-2 shrink-0 transition-colors',
          selected
            ? 'border-foreground bg-foreground'
            : 'border-border'
        )}>
          {selected && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

// --- Payout information tab ---
function PayoutInfoTab() {
  const partner = usePartnerStore((s) => s.partner);
  const setPartner = usePartnerStore((s) => s.setPartner);

  const [selectedMethod, setSelectedMethod] = useState<PayoutMethod>(
    (partner?.payoutMethod as PayoutMethod) || 'crypto_usdc'
  );
  const [walletAddress, setWalletAddress] = useState(partner?.walletAddress || '');
  const [network, setNetwork] = useState<string>(
    partner?.payoutNetwork || (partner?.payoutMethod === 'crypto_usdt' ? 'Tron' : 'Ethereum')
  );
  const [bank, setBank] = useState({
    account_name: partner?.bankDetails?.account_name || '',
    bank_name: partner?.bankDetails?.bank_name || '',
    account_number: partner?.bankDetails?.account_number || '',
    routing_number: partner?.bankDetails?.routing_number || '',
    swift_bic: partner?.bankDetails?.swift_bic || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(partner?.payoutMethod));

  // Re-sync local form state if the store's partner profile changes.
  useEffect(() => {
    if (!partner) return;
    if (partner.payoutMethod) {
      setSelectedMethod(partner.payoutMethod as PayoutMethod);
      setSaved(true);
    }
    if (partner.walletAddress) setWalletAddress(partner.walletAddress);
    if (partner.payoutNetwork) setNetwork(partner.payoutNetwork);
    if (partner.bankDetails) {
      setBank((prev) => ({
        account_name: partner.bankDetails?.account_name ?? prev.account_name,
        bank_name: partner.bankDetails?.bank_name ?? prev.bank_name,
        account_number: partner.bankDetails?.account_number ?? prev.account_number,
        routing_number: partner.bankDetails?.routing_number ?? prev.routing_number,
        swift_bic: partner.bankDetails?.swift_bic ?? prev.swift_bic,
      }));
    }
  }, [partner]);

  const methods: { id: PayoutMethod; name: string; symbol: string; network: string; recommended: boolean }[] = [
    { id: 'crypto_usdc', name: 'USD Coin (USDC)', symbol: 'USDC', network: 'Ethereum / Polygon / Solana', recommended: true },
    { id: 'crypto_usdt', name: 'Tether (USDT)', symbol: 'USDT', network: 'Ethereum / Tron / BSC', recommended: false },
    { id: 'bank', name: 'Bank Transfer', symbol: 'USD', network: 'ACH / Wire / SWIFT', recommended: false },
  ];

  const selectedMethodInfo = methods.find((m) => m.id === selectedMethod);

  const networkOptions: Record<string, string[]> = {
    crypto_usdc: ['Ethereum', 'Polygon', 'Solana'],
    crypto_usdt: ['Ethereum', 'Tron', 'BSC'],
  };

  const handleSelectMethod = (id: PayoutMethod) => {
    setSelectedMethod(id);
    setSaved(false);
    if (id === 'crypto_usdt') setNetwork('Tron');
    else if (id === 'crypto_usdc') setNetwork('Ethereum');
  };

  const setBankField = (key: keyof typeof bank, value: string) => {
    setBank((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        payout_method: selectedMethod,
        ...(selectedMethod === 'bank'
          ? { bank_details: bank }
          : { wallet_address: walletAddress.trim(), network }),
      };
      const res = await partnerApi.updatePayoutSettings(payload);
      setPartner({
        partnerId: res.partner_id,
        referralCode: res.referral_code,
        referralLink: res.referral_link,
        commissionRate: res.commission_rate,
        status: res.status,
        createdAt: res.created_at,
        payoutMethod: res.payout_method ?? null,
        walletAddress: res.wallet_address ?? null,
        payoutNetwork: res.payout_network ?? null,
        bankDetails: res.bank_details ?? null,
      });
      setSaved(true);
      toast.success('Payout details saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save payout details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Configure your payout details. These are used when you request a withdrawal.
      </p>

      <Separator />

      {/* Payout method selection */}
      <div className="space-y-3">
        <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Payout method
        </Label>
        <div className="space-y-3 max-w-lg">
          {methods.map((m) => (
            <CryptoOptionCard
              key={m.id}
              name={m.name}
              symbol={m.symbol}
              network={m.network}
              recommended={m.recommended}
              selected={selectedMethod === m.id}
              onSelect={() => handleSelectMethod(m.id)}
            />
          ))}
        </div>
      </div>

      <Separator />

      {/* Crypto wallet address fields */}
      {(selectedMethod === 'crypto_usdc' || selectedMethod === 'crypto_usdt') && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4 max-w-lg"
        >
          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Wallet address
            </Label>
            <Input
              placeholder={selectedMethod === 'crypto_usdc' ? '0x... or your Solana address' : '0x... or your Tron address'}
              value={walletAddress}
              onChange={(e) => { setWalletAddress(e.target.value); setSaved(false); }}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Enter your {selectedMethodInfo?.name} wallet address. Double-check before saving — crypto transactions are irreversible.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Network
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(networkOptions[selectedMethod] || []).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => { setNetwork(n); setSaved(false); }}
                  className={cn(
                    'rounded-md border px-3 py-2 text-xs font-mono transition-colors',
                    network === n
                      ? 'border-foreground bg-muted/40 text-foreground'
                      : 'border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Bank transfer fields */}
      {selectedMethod === 'bank' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4 max-w-md"
        >
          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Name on account
            </Label>
            <Input
              placeholder="Full legal name"
              className="font-mono text-sm"
              value={bank.account_name}
              onChange={(e) => setBankField('account_name', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Bank name
            </Label>
            <Input
              placeholder="Bank name"
              className="font-mono text-sm"
              value={bank.bank_name}
              onChange={(e) => setBankField('bank_name', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Account number
            </Label>
            <Input
              placeholder="Account number"
              className="font-mono text-sm"
              value={bank.account_number}
              onChange={(e) => setBankField('account_number', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Routing number
            </Label>
            <Input
              placeholder="Routing number"
              className="font-mono text-sm"
              value={bank.routing_number}
              onChange={(e) => setBankField('routing_number', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              SWIFT / BIC (international)
            </Label>
            <Input
              placeholder="Optional"
              className="font-mono text-sm"
              value={bank.swift_bic}
              onChange={(e) => setBankField('swift_bic', e.target.value)}
            />
          </div>
        </motion.div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </span>
          ) : (
            'Save payout details'
          )}
        </Button>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] font-mono uppercase tracking-wide',
            saved && 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
          )}
        >
          {saved ? 'Saved' : 'Unsaved changes'}
        </Badge>
      </div>
    </div>
  );
}

// --- Partner link tab ---
function PartnerLinkTab() {
  const dashboardData = usePartnerStore((s) => s.dashboardData);
  const user = usePartnerStore((s) => s.user);
  const referralLink = dashboardData?.referralLink || '';

  const shareChannels = [
    {
      name: 'Email',
      description: 'Send directly to a contact',
      action: () => {
        const subject = encodeURIComponent('Check out RELIASTRA');
        const body = encodeURIComponent(`I thought you'd find this useful — it's a platform for critical infrastructure intelligence.\n\n${referralLink}`);
        window.open(`mailto:?subject=${subject}&body=${body}`);
        toast.success('Email client opened');
      },
    },
    {
      name: 'Twitter / X',
      description: 'Post to your followers',
      action: () => {
        const text = encodeURIComponent(`If you depend on critical infrastructure, check out @reliastra. Full incident timelines, cross-system correlation, actionable evidence.\n\n${referralLink}`);
        window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
        toast.success('Opening Twitter');
      },
    },
    {
      name: 'LinkedIn',
      description: 'Share with your network',
      action: () => {
        const text = encodeURIComponent(`RELIASTRA — infrastructure intelligence for critical operations. Track, correlate, and prove what happened.\n\n${referralLink}`);
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}&summary=${text}`, '_blank');
        toast.success('Opening LinkedIn');
      },
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Your unique referral link. Share it with potential customers to earn 30% recurring commission.
      </p>

      <ReferralLinkCard link={referralLink} size="large" />

      {user?.partner?.referralCode && (
        <div className="space-y-2">
          <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Referral code
          </Label>
          <p className="font-mono text-sm text-foreground/80">
            {user.partner.referralCode.toUpperCase()}
          </p>
        </div>
      )}

      <Separator />

      {/* Share channels */}
      <div className="space-y-4">
        <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Share via
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {shareChannels.map((channel) => (
            <button
              key={channel.name}
              onClick={channel.action}
              className="rounded-lg border border-border/60 bg-background p-4 text-left transition-colors hover:border-border hover:bg-muted/30"
            >
              <p className="text-sm font-medium">{channel.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{channel.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Tracking info */}
      <Separator />
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="font-mono text-2xl font-semibold tracking-tight">30%</p>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">Commission</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-2xl font-semibold tracking-tight">90d</p>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">Cookie window</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-2xl font-semibold tracking-tight">∞</p>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">No cap</p>
        </div>
      </div>
    </div>
  );
}

// --- Notifications tab ---
function NotificationsTab() {
  const [commissionNotif, setCommissionNotif] = useState(true);
  const [payoutNotif, setPayoutNotif] = useState(true);
  const [referralNotif, setReferralNotif] = useState(true);
  const [marketingNotif, setMarketingNotif] = useState(false);

  const items = [
    {
      label: 'New commission',
      description: 'Get notified when a new commission is earned.',
      checked: commissionNotif,
      onCheckedChange: setCommissionNotif,
    },
    {
      label: 'Payout updates',
      description: 'Receive updates about your payout requests.',
      checked: payoutNotif,
      onCheckedChange: setPayoutNotif,
    },
    {
      label: 'New referrals',
      description: 'Know when someone signs up through your link.',
      checked: referralNotif,
      onCheckedChange: setReferralNotif,
    },
    {
      label: 'Marketing & tips',
      description: 'Occasional partner program updates and resources.',
      checked: marketingNotif,
      onCheckedChange: setMarketingNotif,
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Manage your email notification preferences.
      </p>

      <Separator />

      <div className="space-y-0 divide-y divide-border/40">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
          >
            <div className="pr-4">
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.description}
              </p>
            </div>
            <Switch
              checked={item.checked}
              onCheckedChange={item.onCheckedChange}
              aria-label={item.label}
            />
          </div>
        ))}
      </div>

      <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wide">
        Notification preferences are not yet saved
      </Badge>
    </div>
  );
}

// --- Main page ---
export function PageSettings() {
  const [mounted, setMounted] = useState(false);
  const user = usePartnerStore((s) => s.user);

  // Brief skeleton on initial mount
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted || !user) {
    return <DashboardSettingsSkeleton />;
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Heading */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Settings
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <Tabs defaultValue="account" className="w-full">
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="account" className="text-xs font-mono uppercase tracking-wide">
              Account
            </TabsTrigger>
            <TabsTrigger value="payout" className="text-xs font-mono uppercase tracking-wide">
              Payout Info
            </TabsTrigger>
            <TabsTrigger value="link" className="text-xs font-mono uppercase tracking-wide">
              Partner Link
            </TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs font-mono uppercase tracking-wide">
              Notifications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="mt-6">
            <AccountTab />
          </TabsContent>

          <TabsContent value="payout" className="mt-6">
            <PayoutInfoTab />
          </TabsContent>

          <TabsContent value="link" className="mt-6">
            <PartnerLinkTab />
          </TabsContent>

          <TabsContent value="notifications" className="mt-6">
            <NotificationsTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
