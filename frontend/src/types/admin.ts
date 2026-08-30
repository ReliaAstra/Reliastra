/*
 * Admin control-plane types aligned with the registered FastAPI routers in
 * backend/app/modules/admin/router.py and app/modules/partners/admin_router.py.
 *
 * The API uses snake_case JSON. Keep these names intact at the integration
 * boundary so API-contract changes are visible rather than silently mapped.
 */

export type AdminPeriod = '7d' | '30d' | '90d' | '365d';
export type AttentionPriority = 'critical' | 'high' | 'normal' | 'low';
export type HealthStatus = 'healthy' | 'degraded' | 'error' | 'unknown' | string;

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ field?: string; issue?: string }>;
    request_id?: string;
  } | string;
  detail?: string;
  message?: string;
}

export interface ComponentHealth {
  status: HealthStatus;
  latency_ms?: number | null;
  last_checked?: string | null;
  error?: string | null;
  message?: string | null;
}

export interface AttentionItem {
  type: string;
  priority: AttentionPriority;
  count: number;
  title: string;
  description?: string | null;
  target_resource?: string | null;
  target_id?: string | null;
  href?: string | null;
}

export interface OverviewBusinessSection {
  users: number;
  organizations: number;
  active_users: number;
  active_organizations: number;
  paying_organizations: number;
  mrr: number;
  arr_estimate: number;
  new_signups: number;
  new_paying_customers: number;
  churn_count: number;
  churn_rate: number;
}

export interface OverviewGrowthSection {
  signup_growth: number;
  customer_growth: number;
  mrr_growth: number;
  conversion_rate: number;
}

export interface OverviewProductSection {
  monitors: number;
  active_monitors: number;
  dependencies: number;
  checks_today: number;
  incidents: number;
  open_incidents: number;
}

export interface OverviewSupportSection {
  open_tickets: number;
  urgent_tickets: number;
  unassigned_tickets: number;
  average_response_time_hours: number;
}

export interface OverviewCommunicationsSection {
  active_campaigns: number;
  scheduled_campaigns: number;
  draft_campaigns: number;
  recent_announcements: number;
}

export interface OverviewSystemSection {
  api_health: ComponentHealth;
  database_health: ComponentHealth;
  redis_health: ComponentHealth;
  worker_health: ComponentHealth;
  scheduler_health: ComponentHealth;
}

export interface AdminOverviewResponse {
  business: OverviewBusinessSection;
  growth: OverviewGrowthSection;
  product: OverviewProductSection;
  support: OverviewSupportSection;
  communications: OverviewCommunicationsSection;
  system: OverviewSystemSection;
  actions_required: AttentionItem[];
  generated_at: string;
}

export interface AttentionResponse {
  items: AttentionItem[];
  critical_count: number;
  high_count: number;
  normal_count: number;
  generated_at: string;
}

export interface SearchHit {
  resource_type: 'customer' | 'organization' | 'ticket' | 'partner' | 'campaign' | string;
  id: string;
  title: string;
  subtitle?: string | null;
  href?: string | null;
  meta: Record<string, unknown>;
}

export interface AdminSearchResponse {
  query: string;
  customers: SearchHit[];
  organizations: SearchHit[];
  tickets: SearchHit[];
  partners: SearchHit[];
  campaigns: SearchHit[];
  total: number;
}

export interface CustomerListItem {
  customer_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  source?: string | null;
  plan?: string | null;
  org_id?: string | null;
  org_name?: string | null;
  health: string;
  mrr: number;
  last_activity_at?: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type CustomerListResponse = PaginatedResponse<CustomerListItem>;

export interface CustomerOrgSnapshot {
  org_id: string;
  org_name: string;
  role: string;
  plan: string;
  mrr: number;
  billing_status?: string | null;
  member_count: number;
  dependency_count: number;
  open_incidents: number;
  open_tickets: number;
}

export interface CustomerDetailResponse {
  customer_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_email_verified: boolean;
  is_system_admin: boolean;
  avatar_url?: string | null;
  auth_provider?: string | null;
  source?: string | null;
  admin_note?: string | null;
  health: string;
  last_login_at?: string | null;
  last_activity_at?: string | null;
  login_count: number;
  created_at: string;
  updated_at?: string | null;
  organizations: CustomerOrgSnapshot[];
  primary_org?: CustomerOrgSnapshot | null;
  plan?: string | null;
  mrr: number;
  billing_status?: string | null;
  subscription?: Record<string, unknown> | null;
  dependencies: number;
  monitors: number;
  incidents: number;
  open_incidents: number;
  support_tickets: number;
  open_support_tickets: number;
  recent_activity: AdminActivityItem[];
  recent_tickets: CustomerTicketSummary[];
}

export interface AdminActivityItem {
  id?: string;
  action: string;
  details?: Record<string, unknown> | null;
  created_at?: string | null;
  ip_address?: string | null;
}

export interface CustomerTicketSummary {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  created_at?: string | null;
}

export interface RevenueSummaryResponse {
  mrr: number;
  mrr_growth: number;
  arr_estimate: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  churned_mrr: number;
  net_new_mrr: number;
  paying_customers: number;
  arpu: number;
  currency: string;
}

export interface RevenueDataPoint {
  date: string;
  mrr: number;
  paying_customers?: number | null;
}

export interface RevenueTimeseriesResponse {
  period: AdminPeriod;
  granularity: 'day' | 'week' | 'month' | string;
  data_points: RevenueDataPoint[];
}

export interface RevenueAttentionResponse {
  failed_payments: AttentionItem[];
  revenue_drop_alerts: AttentionItem[];
  unusual_mrr_changes: AttentionItem[];
  high_value_churn: AttentionItem[];
  items: AttentionItem[];
}

export interface GrowthOverviewResponse {
  signups: number;
  activated_users: number;
  activated_organizations: number;
  paying_customers: number;
  conversion_rate: number;
  mrr_growth: number;
  retention_summary: Record<string, unknown>;
  engagement: Record<string, unknown>;
  period: string;
}

export interface GrowthFunnelStage {
  stage: string;
  count: number;
  conversion_from_previous?: number | null;
}

export interface GrowthFunnelResponse {
  period: string;
  stages: GrowthFunnelStage[];
  plg?: Record<string, unknown> | null;
}

export interface ProductFeatureItem {
  feature: string;
  eligible: number;
  adopted: number;
  adoption_rate: number;
}

export interface ProductOverviewResponse {
  active_users: number;
  active_organizations: number;
  active_monitors: number;
  checks: number;
  checks_today: number;
  incidents: number;
  open_incidents: number;
  dependencies: number;
  vendor_coverage_top: Array<Record<string, unknown>>;
  feature_adoption: Array<Record<string, unknown>>;
  time_to_value: Record<string, unknown>;
  engagement: Record<string, unknown>;
}

export interface ProductFeaturesResponse {
  features: ProductFeatureItem[];
}

export interface ProductVendorItem {
  vendor: string;
  organizations_using: number;
  coverage_percentage: number;
  incidents: number;
  monitoring_volume: number;
  views?: number | null;
  badge_embeds?: number | null;
  submissions?: number | null;
  evidence_downloads?: number | null;
}

export interface ProductVendorsResponse {
  vendors: ProductVendorItem[];
}

export interface ProductEngagementResponse {
  dau: number;
  wau: number;
  mau: number;
  stickiness: number;
}

export interface ProductActivationResponse {
  median_time_to_first_check_hours?: number | null;
  p25_hours?: number | null;
  p50_hours?: number | null;
  p75_hours?: number | null;
  activation_rate: number;
  buckets: Array<Record<string, unknown>>;
}

export interface SupportOverviewResponse {
  open: number;
  urgent: number;
  unassigned: number;
  waiting_on_customer: number;
  waiting_on_agent: number;
  resolved_today: number;
  average_first_response_hours: number;
  average_resolution_hours: number;
  sla_breaches: number;
  queue: Record<string, number>;
  by_category: Record<string, number>;
}

export interface FeedbackTicket {
  id: string;
  ticket_number: string;
  user_id?: string | null;
  email: string;
  full_name?: string | null;
  category: string;
  subject: string;
  body: string;
  priority: string;
  status: string;
  source?: string | null;
  assigned_to?: string | null;
  resolution?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
}

export type FeedbackTicketListResponse = PaginatedResponse<FeedbackTicket>;

export interface FeedbackMessage {
  id: string;
  ticket_id: string;
  sender_type: string;
  sender_id: string;
  sender_name: string;
  body: string;
  is_internal_note: boolean;
  created_at: string;
}

export interface SupportTicketWorkspaceResponse {
  ticket: FeedbackTicket;
  messages: FeedbackMessage[];
  customer?: Record<string, unknown> | null;
  organization?: Record<string, unknown> | null;
  subscription?: Record<string, unknown> | null;
  recent_customer_activity: AdminActivityItem[];
  related_incidents: Array<Record<string, unknown>>;
}

export interface CommunicationsOverviewResponse {
  campaigns_total: number;
  drafts: number;
  scheduled: number;
  sent_today: number;
  notifications: number;
  announcements_active: number;
  announcements_total: number;
  recent_delivery_stats: Record<string, number>;
}

export interface EmailCampaign {
  id: string;
  campaign_name: string;
  subject: string;
  body_html: string;
  body_text?: string | null;
  segment?: string | null;
  recipient_count: number;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  failed_count: number;
  status: string;
  utm_campaign?: string | null;
  created_by?: string | null;
  scheduled_at?: string | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type EmailCampaignListResponse = PaginatedResponse<EmailCampaign>;

export interface Announcement {
  id: string;
  title: string;
  body_html: string;
  placement: string;
  target_plans?: string[] | null;
  target_segment?: string | null;
  action_url?: string | null;
  action_label?: string | null;
  is_dismissible: boolean;
  bg_color?: string | null;
  text_color?: string | null;
  impression_count: number;
  dismissal_count: number;
  click_count: number;
  is_active: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
  created_by?: string | null;
  created_at: string;
}

export type AnnouncementListResponse = PaginatedResponse<Announcement>;

export interface PartnerStatsResponse {
  total_partners: number;
  active_partners: number;
  total_referred_signups: number;
  total_active_paid_customers: number;
  monthly_referred_revenue_minor: number;
  monthly_commission_minor: number;
  total_commission_paid_minor: number;
  pending_commission_minor: number;
  /** Payouts awaiting settlement — the admin's actual to-do list. */
  pending_payout_count: number;
  pending_payout_minor: number;
  currency: string;
}

export interface PartnerAdminItem {
  partner_id: string;
  user_id: string;
  email: string;
  referral_code: string;
  status: string;
  referred_signups: number;
  active_paid_customers: number;
  monthly_commission_minor: number;
  total_earned_minor: number;
  total_paid_minor: number;
  currency: string;
  created_at: string;
}

export type PartnerAdminListResponse = PaginatedResponse<PartnerAdminItem>;

export interface AdminCommissionItem {
  commission_id: string;
  partner_id: string;
  partner_email?: string | null;
  referral_id?: string | null;
  referred_email?: string | null;
  period: string;
  subscription_amount_minor: number;
  commission_amount_minor: number;
  currency: string;
  status: string;
  created_at: string;
  paid_at?: string | null;
}

export type AdminCommissionListResponse = PaginatedResponse<AdminCommissionItem>;

export interface AdminPayoutItem {
  id: string;
  partner_id: string;
  partner_email?: string | null;
  period?: string | null;
  amount_minor: number;
  currency: string;
  status: string;
  transaction_reference?: string | null;
  requested_at: string;
  paid_at?: string | null;
  payout_method?: string | null;
  /**
   * Ready-to-use destination for settlement — bank account numbers are masked
   * to the last four digits by the backend.
   */
  payout_destination?: string | null;
}

export type AdminPayoutListResponse = PaginatedResponse<AdminPayoutItem>;

/** Full payout destination, returned only by the audited reveal endpoint. */
export interface AdminPayoutDestinationReveal {
  partner_id: string;
  partner_email?: string | null;
  payout_method?: string | null;
  payout_network?: string | null;
  wallet_address?: string | null;
  bank_details?: Record<string, string> | null;
  payout_destination?: string | null;
  payout_details_updated_at?: string | null;
  /** True while the post-change hold is still running — do not pay yet. */
  in_cooldown: boolean;
}

/** Admin → partner announcement (see `POST /v1/admin/partners/notify`). */
export interface AdminPartnerNotifyRequest {
  audience: 'all' | 'selected';
  partner_ids?: string[];
  statuses?: string[];
  title: string;
  body: string;
  action_url?: string | null;
  action_label?: string | null;
  category?: 'announcement' | 'marketing';
  send_email?: boolean;
}

export interface AdminPartnerNotifyResponse {
  recipients: number;
  emailed: number;
  title: string;
}

export interface PartnerDetailResponse {
  partner_id: string;
  user_id: string;
  email?: string | null;
  referral_code: string;
  status: string;
  created_at: string;
  payout_settings?: {
    payout_method?: string | null;
    /** Masked; use `adminApi.revealPayoutDestination` for the payable value. */
    wallet_address?: string | null;
    payout_network?: string | null;
    /** Masked: account/routing numbers arrive as `••••1234`. */
    bank_details?: Record<string, string> | null;
    payout_destination?: string | null;
    payout_details_updated_at?: string | null;
    is_masked?: boolean;
  };
  commission_summary: {
    total_earned_minor: number;
    total_paid_minor: number;
    pending_commission_minor: number;
    payable_balance_minor: number;
  };
  referred_customers: Array<{
    referral_id: string;
    referred_user_id: string;
    email?: string | null;
    masked_email?: string | null;
    status: string;
    created_at: string;
    subscribed_at?: string | null;
  }>;
  commission_history: Array<{
    commission_id: string;
    period: string;
    subscription_amount_minor: number;
    commission_amount_minor: number;
    currency: string;
    rate: number;
    status: string;
    created_at: string;
    paid_at?: string | null;
  }>;
  payout_history: Array<{
    payout_id: string;
    amount_minor: number;
    currency: string;
    status: string;
    period?: string | null;
    transaction_reference?: string | null;
    paid_at?: string | null;
  }>;
}

export interface OperationsOverviewResponse {
  api: ComponentHealth;
  database: ComponentHealth;
  redis: ComponentHealth;
  workers: ComponentHealth;
  scheduler: ComponentHealth;
  check_engine: ComponentHealth;
  billing: ComponentHealth;
  email: ComponentHealth;
  storage: ComponentHealth;
  overall: string;
  engines: Array<Record<string, unknown>>;
  generated_at: string;
}

export interface ErrorLogItem {
  id: string;
  level: string;
  component?: string | null;
  message: string;
  stack_trace?: string | null;
  request_id?: string | null;
  user_id?: string | null;
  org_id?: string | null;
  ip_address?: string | null;
  is_resolved: boolean;
  created_at: string;
}

export type ErrorLogListResponse = PaginatedResponse<ErrorLogItem>;

export interface SystemMetrics {
  total_users: number;
  total_orgs: number;
  total_dependencies: number;
  total_incidents_open: number;
  total_tickets_open: number;
  db_pool_size: number;
  db_pool_checked_out: number;
  db_pool_overflow: number;
}

export interface AuditLogItem {
  id: string;
  admin_user_id?: string | null;
  admin_email?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export type AuditLogListResponse = PaginatedResponse<AuditLogItem>;

/**
 * Identity returned by `/v1/admin/auth/me` (the dedicated admin session).
 *
 * This is NOT a signed-in user: the row is the FK-anchor service account and
 * the `username` is the operator credential identity. There is no customer
 * `email`-based login behind this identity.
 */
export interface AdminCurrentUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  is_system_admin: boolean;
}

// -- Traffic & funnel analytics ----------------------------------------------

export interface AnalyticsSeriesPoint {
  date: string;
  visitors: number;
  pageviews: number;
  signups: number;
  checkouts_started: number;
  checkouts_converted: number;
}

export interface CountrySlice {
  country: string;
  views: number;
}

export interface AbandonedCheckoutLead {
  org_id: string;
  email: string;
  plan: string;
  amount_minor: number;
  reference: string;
  user_id?: string | null;
  started_at: string;
}

export interface AdminAnalyticsOverview {
  generated_at: string;
  window_days: number;
  visitors: {
    unique_total: number;
    unique_today: number;
    pageviews_total: number;
  };
  signups: {
    total: number;
    last_7d: number;
    conversion_rate: number;
  };
  checkout: {
    started_total: number;
    converted_total: number;
    abandoned_total: number;
    start_rate_from_signups: number;
    abandonment_rate: number;
    abandoned_leads: AbandonedCheckoutLead[];
  };
  countries_top: CountrySlice[];
  series: AnalyticsSeriesPoint[];
}
