export type PlanId = 'free' | 'pro' | 'enterprise';

export type HealthStatus = 'operational' | 'degraded' | 'down' | 'unknown' | 'paused';

export type IncidentStatus = 'open' | 'resolved' | 'false_positive' | 'investigating';
export type IncidentSeverity = 'critical' | 'major' | 'minor';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface UserMe {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: PlanId | string;
  has_agency_mode: boolean;
  ai_explanations_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlanDetails {
  org_id: string;
  plan: PlanId | string;
  effective_plan?: PlanId | string;
  is_trial_active?: boolean;
  trial_days_remaining?: number;
  trial_length_days?: number;
  // Canonical evaluation fields (trial aliases kept for compat)
  is_evaluation_active?: boolean;
  evaluation_status?: string;
  evaluation_started_at?: string | null;
  evaluation_expires_at?: string | null;
  evaluation_days_remaining?: number;
  evaluation_used?: boolean;
  effective_features?: Record<string, unknown> | null;
  fallback_info?: {
    dependencies_configured: number;
    dependencies_active: number;
    dependencies_paused_if_expired: number;
    free_dependency_limit: number;
    current_dependency_limit: number;
    team_members: number;
    team_free_limit: number;
    team_current_limit: number;
    evidence_available: boolean;
    evidence_free_available: boolean;
    api_available: boolean;
    retention_days_current: number;
    retention_days_free: number;
  } | null;
  max_dependencies: number | null;
  max_team_members?: number | null;
  min_check_interval_seconds: number | null;
  data_retention_days?: number | null;
  subscription_status: string | null;
  current_period_end: string | null;
  price_usd: number;
  billing_interval?: string | null;
  effective_is_custom?: boolean;
  /** Currency Paystack actually charges + canonical disclosure (from the API). */
  payment?: import('@/lib/billing/currency').PaymentCurrencyInfo | null;
  next_charge_amount_minor?: number | null;
  next_charge_amount_display?: string | null;
}

export interface PricingPlan {
  plan: PlanId | string;
  display_name: string;
  description: string;
  tag: string | null;
  price_usd: number;
  price_annual_usd: number | null;
  max_dependencies: number | null;
  max_team_members?: number | null;
  min_check_interval_seconds: number | null;
  data_retention_days: number | null;
  features: Record<string, unknown>;
  billing_availability: string;
  is_enterprise: boolean;
  is_custom_pricing: boolean;
  /** Published payment amount for this plan (processing currency), if any. */
  payment_amount_display?: string | null;
  payment_annual_amount_display?: string | null;
  /** Product list price, pre-formatted by the backend ("$39.00 (USD)"). */
  product_price_display?: string | null;
  product_annual_price_display?: string | null;
  /** The mandatory transparency triple, per billing interval, backend-formatted. */
  transparency?: Record<'monthly' | 'annual', PlanTransparencyLine>;
  /** False when self-serve checkout cannot be priced in this currency. */
  checkout_ready?: boolean;
}

export interface PlanTransparencyLine {
  product_price: string | null;
  actual_charge: string | null;
  payment_provider: string;
  payment_provider_display: string;
  currency_label: string;
}

export interface DashboardSummary {
  active_dependencies_count: number;
  open_incidents_count: number;
  overall_uptime_percentage: number | null;
  alerts_today_count: number;
}

export interface DependencyHealth {
  dependency_id: string;
  name: string;
  endpoint_url: string;
  current_status: HealthStatus | string;
  uptime_percentage_24h: number | null;
  avg_latency_ms_24h: number;
  last_check_at?: string | null;
  total_checks_24h?: number;
}

export interface Dependency {
  id: string;
  org_id: string;
  application_id: string | null;
  name: string;
  endpoint_url: string;
  method: string;
  headers: Record<string, unknown> | null;
  has_headers: boolean;
  expected_status_codes: number[];
  timeout_seconds: number;
  check_interval_seconds: number;
  next_check_at: string | null;
  regions: string[];
  alert_threshold_ms: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DependencyCreate {
  name: string;
  application_id?: string | null;
  endpoint_url: string;
  method: 'GET' | 'HEAD' | 'POST';
  expected_status_codes: number[];
  timeout_seconds: number;
  check_interval_seconds: number;
  regions: string[];
  alert_threshold_ms: number | null;
  is_active: boolean;
}

export interface DependencyHistory {
  dependency_id: string;
  uptime_percentage: number;
  avg_latency_ms: number;
  total_checks: number;
  total_up: number;
  total_down: number;
}

export interface CheckResult {
  id: string;
  dependency_id: string;
  org_id: string;
  region: string;
  executed_at: string;
  latency_ms: number;
  status_code: number | null;
  is_up: boolean;
  error_message: string | null;
  quorum_confirmed: boolean;
}

export interface Incident {
  id: string;
  org_id: string;
  dependency_id: string;
  started_at: string;
  resolved_at: string | null;
  severity: IncidentSeverity | string;
  status: IncidentStatus | string;
  root_cause: string;
  description: string | null;
  evidence_report_id: string | null;
  created_at: string;
  updated_at: string;
  display_id?: string;
  title?: string;
  vendor?: string;
  region?: string;
  confidence?: ConfidenceLevel;
}

export interface IncidentCorrelation {
  id: string;
  incident_id: string;
  correlated_dependency_id: string;
  correlation_confidence: number;
  time_window_seconds: number;
  correlation_method: string;
  created_at: string;
}

export interface IncidentDetail extends Incident {
  correlations: IncidentCorrelation[];
  timeline?: TimelineEvent[];
  impact?: ImpactSeries;
  other_dependencies?: Array<{
    name: string;
    status: HealthStatus | string;
    latency_ms: number;
  }>;
}

export interface TimelineEvent {
  id: string;
  type: 'detection' | 'vendor_spike' | 'confirmation' | 'resolution';
  timestamp: string;
  description: string;
  metric?: string;
}

export interface ImpactSeries {
  your_service: Array<{ t: string; v: number }>;
  vendor: Array<{ t: string; v: number }>;
}

export interface VendorEndpoint {
  id: string;
  endpoint_url: string;
  regions: string[];
  health_status: string;
  is_active: boolean;
  last_check_at: string | null;
}

export interface VendorStatus {
  id: string;
  vendor_name: string;
  display_name: string;
  category: string;
  is_public: boolean;
  last_check_at: string | null;
  created_at: string;
  updated_at: string;
  recent_status: string;
  endpoints: VendorEndpoint[];
  uptime_percentage_24h?: number;
  avg_latency_ms?: number;
}

export interface EvidenceReport {
  id: string;
  org_id: string;
  incident_id: string;
  file_size_bytes: number;
  checksum: string;
  generated_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  download_url?: string;
  title?: string;
  vendor?: string;
  confidence?: ConfidenceLevel;
  credit_amount?: number;
  share_token?: string;
}

export interface Paginated<T> {
  data?: T[];
  items?: T[];
  pagination?: {
    next_cursor: string | null;
    has_more: boolean;
    limit: number;
  };
  next_cursor?: string | null;
  has_more?: boolean;
}

export interface AlertConfig {
  id: string;
  org_id: string;
  channel_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  date: string;
  /**
   * Amount actually billed, in minor units of `currency`. Deliberately not
   * `amount_usd`: the product list price is USD but a payment is collected in
   * the processing currency (NGN today), and an invoice must report the
   * currency it was really settled in.
   */
  amount_minor: number;
  currency: string;
  status: 'paid' | 'open' | 'failed';
}

/**
 * One collected payment, as persisted from the provider's own report at the
 * time it happened (GET /v1/billing/transactions). Both sides of the deal are
 * carried — the USD price quoted and the amount/currency actually charged —
 * so history never re-prices itself when a catalog changes.
 */
export interface BillingTransactionItem {
  id: string;
  reference: string;
  provider: string;
  plan: string;
  display_plan: string;
  billing_interval: string;
  status: 'success' | 'refunded' | 'disputed' | string;
  product_currency: string;
  product_amount_minor: number | null;
  /** Pre-formatted from the backend, e.g. "$39.00 (USD)". */
  product_price_display: string | null;
  charged_currency: string;
  charged_amount_minor: number;
  /** Pre-formatted from the backend, e.g. "₦60,000.00 (NGN)". */
  charged_amount_display: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

export interface BillingTransactionsResult {
  items: BillingTransactionItem[];
  payment?: import('@/lib/billing/currency').PaymentCurrencyInfo | null;
}

export interface PaymentMethod {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}

export interface AgencyClient {
  id: string;
  name: string;
  description?: string | null;
}

export interface AgencyApplication {
  id: string;
  org_id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyItem {
  id: string;
  org_id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ApiKeyCreateResponse extends ApiKeyItem {
  /** Shown exactly once at creation; the backend stores only a hash. */
  full_key: string;
}

export function unwrapList<T>(payload: Paginated<T> | T[]): T[] {
  if (Array.isArray(payload)) return payload;
  return payload.data ?? payload.items ?? [];
}

// -- Agency portfolio (client-facing SLA portal) -----------------------------

export interface PortfolioClient {
  id: string;
  name: string;
  description: string | null;
  application_count: number;
  dependency_count: number;
  uptime_24h: number;
  avg_latency_ms: number;
  open_incidents: number;
  critical_incidents: number;
  last_incident_at: string | null;
  status: 'operational' | 'degraded' | 'critical';
}

export interface PortfolioTotals {
  clients: number;
  dependencies: number;
  avg_uptime_24h: number;
  open_incidents: number;
  clients_needing_attention: number;
}

export interface AgencyPortfolio {
  org_name: string;
  generated_at: string;
  share_token: string;
  clients: PortfolioClient[];
  totals: PortfolioTotals;
  unassigned_monitors: number;
}

// -- In-dashboard notification inbox ----------------------------------------
//
// Every persona (customer, agency operator, partner) reads the same feed.
// There is deliberately no mock fallback for these: rendering fabricated
// alerts in a monitoring product is the failure this type exists to prevent.

export interface InboxNotification {
  id: string;
  event: string;
  title: string;
  body: string;
  action_url: string | null;
  action_label: string | null;
  priority: 'urgent' | 'high' | 'normal' | 'low' | string;
  is_read: boolean;
  created_at: string;
}

export interface InboxListResponse {
  items: InboxNotification[];
  page: number;
  page_size: number;
  total: number;
  unread: number;
}

export interface InboxUnreadCountResponse {
  unread: number;
}

// -- Support desk -----------------------------------------------------------
//
// Same `feedback_tickets` rows the admin support workspace works on, so a
// conversation opened here is the one an admin replies to.

export interface SupportTicketSummary {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  last_message_preview: string;
  last_sender_type: 'user' | 'admin' | 'system' | string;
  unread_admin_messages: number;
}

export interface SupportMessage {
  id: string;
  sender_type: 'user' | 'admin' | 'system' | string;
  sender_name: string;
  body: string;
  created_at: string;
}

export interface SupportTicketDetail {
  ticket: SupportTicketSummary;
  messages: SupportMessage[];
}

export interface SupportTicketListResponse {
  items: SupportTicketSummary[];
  page: number;
  page_size: number;
  total: number;
}
