/* ─────────────────────────────────────────────
   Types aligned with Reliastra Backend OpenAPI 3.1
   https://api.reliastra.com/docs
   ───────────────────────────────────────────── */

// ── Auth ───────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  org_name?: string | null;
  ref_code?: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserResponseLite {
  id: string;
  email: string;
  full_name?: string;
  is_verified?: boolean;
  created_at?: string;
}

export interface OrganizationLite {
  id: string;
  name: string;
  slug?: string;
}

export interface RegisterResponse {
  user: UserResponseLite;
  organization: OrganizationLite;
  /**
   * ALWAYS null. Email verification is a hard gate: registration creates the
   * account but issues no session. Tokens come from `POST /auth/verify-otp`
   * once the emailed 6-digit code is submitted.
   */
  tokens: TokenResponse | null;
  verification_required: boolean;
  message: string;
}

export interface VerifyOtpRequest {
  email: string;
  /** Exactly 6 digits. */
  code: string;
}

export interface VerifyOtpResponse {
  message: string;
  is_email_verified: boolean;
  user: UserResponseLite;
  organization: OrganizationLite | null;
  tokens: TokenResponse;
}

export interface ResendOtpResponse {
  message: string;
  expires_in_minutes: number;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

export interface ResetPasswordResponse {
  message: string;
}

// ── Partner ────────────────────────────────────

export interface PartnerApplyRequest {
  agree_terms: boolean;
}

export interface PartnerProfileResponse {
  partner_id: string;
  referral_code: string;
  referral_link: string;
  commission_rate: number;
  status: string;
  created_at: string;
  payout_method?: string | null;
  /** Masked (`0x71C7…9F2a`) — the API never returns the full address. */
  wallet_address?: string | null;
  payout_network?: string | null;
  /** Masked: account/routing numbers arrive as `••••1234`. */
  bank_details?: Record<string, string> | null;
  /** One-line masked summary, ready to display. */
  payout_destination?: string | null;
  /** Last destination change — payouts are held briefly afterwards. */
  payout_details_updated_at?: string | null;
}

// ── Payout destination ──────────────────────────

export type PayoutMethod = 'crypto_usdc' | 'crypto_usdt' | 'bank';

export interface PayoutSettingsUpdateRequest {
  /** Re-authentication for this change; required for password accounts. */
  current_password?: string;
  payout_method: PayoutMethod;
  wallet_address?: string | null;
  network?: string | null;
  bank_details?: Record<string, string> | null;
}

export interface PartnerDashboardResponse {
  referral_link: string;
  clicks: number;
  signups: number;
  active_paid_customers: number;
  monthly_commission_minor: number;
  /**
   * Everything earned but not yet paid — includes commissions still inside the
   * hold period and commissions reserved by an open payout. Informational only:
   * never show this as the withdrawable amount.
   */
  pending_commission_minor: number;
  /** Actually withdrawable right now (released and unreserved). */
  payable_balance_minor: number;
  /** Reserved by a payout that has been created but not settled yet. */
  in_transit_minor: number;
  total_earned_minor: number;
  total_paid_minor: number;
  /** Minimum payable balance required before a payout can be requested. */
  minimum_payout_minor: number;
  currency: string;
}

// ── Notifications ──────────────────────────────

export type PartnerNotificationEvent =
  | 'partner_referral_signup'
  | 'partner_commission_earned'
  | 'partner_payout_requested'
  | 'partner_payout_paid'
  | 'partner_payout_failed'
  | 'partner_support_reply'
  | 'partner_announcement'
  | 'partner_marketing'
  | (string & {});

export interface NotificationItem {
  id: string;
  event: PartnerNotificationEvent;
  title: string;
  body: string;
  action_url?: string | null;
  action_label?: string | null;
  priority: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  page: number;
  page_size: number;
  total: number;
  unread: number;
}

export interface NotificationPreferences {
  email_referral: boolean;
  email_commission: boolean;
  email_payout: boolean;
  email_support: boolean;
  email_announcement: boolean;
  email_marketing: boolean;
  browser_enabled: boolean;
}

// ── Support desk ───────────────────────────────

export interface PartnerTicketMessageItem {
  id: string;
  sender_type: 'user' | 'admin' | 'system' | (string & {});
  sender_name: string;
  body: string;
  created_at: string;
}

export interface PartnerTicketItem {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  last_message_preview: string;
  last_sender_type: string;
  unread_admin_messages: number;
}

export interface PartnerTicketListResponse {
  items: PartnerTicketItem[];
  page: number;
  page_size: number;
  total: number;
}

export interface PartnerTicketDetailResponse {
  ticket: PartnerTicketItem;
  messages: PartnerTicketMessageItem[];
}

// ── Referrals ──────────────────────────────────

export interface ReferralItem {
  referral_id: string;
  status: string;
  plan: string | null;
  subscription_amount_minor: number;
  commission_rate: number;
  monthly_commission_minor: number;
  masked_email: string | null;
  organization_name: string | null;
  created_at: string;
  subscribed_at: string | null;
}

export interface ReferralListResponse {
  items: ReferralItem[];
  page: number;
  page_size: number;
  total: number;
}

// ── Commissions ────────────────────────────────

export interface CommissionItem {
  id: string;
  referral_id: string | null;
  period: string;
  subscription_amount_minor: number;
  commission_rate: number;
  commission_amount_minor: number;
  currency: string;
  status: string;
  created_at: string;
  payable_at: string | null;
  paid_at: string | null;
}

export interface CommissionListResponse {
  items: CommissionItem[];
  page: number;
  page_size: number;
  total: number;
}

// ── Payouts ────────────────────────────────────

export interface PayoutItem {
  id: string;
  period: string | null;
  amount_minor: number;
  currency: string;
  status: string;
  paid_at: string | null;
  transaction_reference: string | null;
}

export interface PayoutListResponse {
  items: PayoutItem[];
  page: number;
  page_size: number;
  total: number;
}

// ── Referral Program (user-facing) ─────────────

export interface ReferralInfoResponse {
  referral_code: string;
  referral_link: string;
  total_referrals: number;
  active_referrals: number;
  pending_rewards: Record<string, unknown>[];
  earned_rewards: Record<string, unknown>[];
  referral_tier: string;
  is_founding_referrer: boolean;
}

export interface ReferralResolveResponse {
  valid: boolean;
  referral_code: string | null;
  destination: string;
  visitor_id?: string | null;
}

// ── Internal convenience types (camelCase) ─────

export interface PartnerUser {
  id: string;
  email: string;
  fullName?: string;
  /** Alias for fullName – some code paths use `name` */
  name?: string;
  isVerified?: boolean;
  createdAt?: string;
  partner?: { referralCode?: string; status?: string } | null;
}

export interface Partner {
  partnerId: string;
  referralCode: string;
  referralLink: string;
  commissionRate: number;
  status: string;
  createdAt: string;
  payoutMethod?: string | null;
  /** Masked — never the full address. */
  walletAddress?: string | null;
  payoutNetwork?: string | null;
  /** Masked — account numbers arrive as `••••1234`. */
  bankDetails?: Record<string, string> | null;
  payoutDestination?: string | null;
  payoutDetailsUpdatedAt?: string | null;
}

// ── Tier System (frontend-only for marketing) ──

export type PartnerTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface TierInfo {
  tier: PartnerTier;
  name: string;
  minReferrals: number;
  commissionRate: number;
  benefits: string[];
  color: string;
}

export const PARTNER_TIERS: TierInfo[] = [
  {
    tier: 'bronze',
    name: 'Bronze',
    minReferrals: 0,
    commissionRate: 30,
    benefits: [
      '30% recurring commission',
      'Standard 90-day attribution',
      'Email support',
      'Basic dashboard access',
      'Monthly payouts',
    ],
    color: 'amber',
  },
  {
    tier: 'silver',
    name: 'Silver',
    minReferrals: 10,
    commissionRate: 32,
    benefits: [
      '32% recurring commission',
      'Extended 120-day attribution',
      'Priority email support',
      'Advanced analytics',
      'Bi-weekly payouts',
      'Custom referral links',
    ],
    color: 'slate',
  },
  {
    tier: 'gold',
    name: 'Gold',
    commissionRate: 35,
    minReferrals: 25,
    benefits: [
      '35% recurring commission',
      '180-day attribution window',
      'Dedicated account manager',
      'Real-time analytics',
      'Weekly payouts',
      'Co-branded materials',
      'Early access to new features',
    ],
    color: 'yellow',
  },
  {
    tier: 'platinum',
    name: 'Platinum',
    commissionRate: 40,
    minReferrals: 50,
    benefits: [
      '40% recurring commission',
      'Lifetime attribution',
      '24/7 dedicated support',
      'On-demand payouts',
      'White-label options',
      'Revenue sharing bonuses',
      'Executive partner events',
    ],
    color: 'zinc',
  },
];

export function getPartnerTier(activeReferrals: number): TierInfo {
  let current = PARTNER_TIERS[0];
  for (const tier of PARTNER_TIERS) {
    if (activeReferrals >= tier.minReferrals) current = tier;
  }
  return current;
}

export function getNextTier(activeReferrals: number): TierInfo | null {
  const current = getPartnerTier(activeReferrals);
  const currentIndex = PARTNER_TIERS.findIndex((t) => t.tier === current.tier);
  if (currentIndex < PARTNER_TIERS.length - 1) {
    return PARTNER_TIERS[currentIndex + 1];
  }
  return null;
}

// ── Analytics ─────────────────────────────────

export interface AttributionBucket {
  bucket: string;
  count: number;
  pct: number;
}

export interface TimeseriesPoint {
  date: string;
  signups: number;
}

export interface FunnelStage {
  status: string;
  count: number;
}

export interface CampaignBucket {
  campaign: string;
  count: number;
}

export interface PartnerAnalyticsResponse {
  total_referrals: number;
  active_customers: number;
  conversion_rate: number;
  attribution: AttributionBucket[];
  timeseries: TimeseriesPoint[];
  funnel: FunnelStage[];
  top_campaigns: CampaignBucket[];
  insights: string[];
}

export interface ReferralTimelineEvent {
  kind: string;
  label: string;
  at: string | null;
  detail: string | null;
}

export interface ReferralDetailResponse {
  referral_id: string;
  status: string;
  plan: string | null;
  organization_name: string | null;
  masked_email: string | null;
  created_at: string;
  subscribed_at: string | null;
  commission_rate: number;
  subscription_amount_minor: number;
  monthly_commission_minor: number;
  acquisition_channel: string | null;
  acquisition_source: string | null;
  acquisition_campaign: string | null;
  acquisition_bucket: string | null;
  partner_referral_code: string | null;
  timeline: ReferralTimelineEvent[];
}

// ── Page Routes ────────────────────────────────

export type PartnerPage =
  // Main site
  | 'landing'
  // Partner public pages
  | 'home'
  | 'earn'
  | 'how-it-works'
  | 'commission'
  | 'faq'
  | 'tiers'
  | 'resources'
  | 'login'
  | 'signup'
  | 'forgot-password'
  // Partner dashboard
  | 'dashboard'
  | 'notifications'
  | 'referrals'
  | 'earnings'
  | 'payouts'
  | 'settings'
  // Misc
  | 'support'
  | 'privacy'
  | 'terms'
  | 'premium';
