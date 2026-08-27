export type PlanId =
  | 'free'
  | 'starter'
  | 'standard'
  | 'professional'
  | 'agency';

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
  max_dependencies: number;
  min_check_interval_seconds: number;
  subscription_status: string | null;
  current_period_end: string | null;
  price_usd: number;
}

export interface PricingPlan {
  plan: PlanId | string;
  display_name: string;
  description: string;
  tag: string | null;
  price_usd: number;
  max_dependencies: number;
  min_check_interval_seconds: number;
  data_retention_days: number;
  features: Record<string, unknown>;
}

export interface DashboardSummary {
  active_dependencies_count: number;
  open_incidents_count: number;
  overall_uptime_percentage: number;
  alerts_today_count: number;
}

export interface DependencyHealth {
  dependency_id: string;
  name: string;
  endpoint_url: string;
  current_status: HealthStatus | string;
  uptime_percentage_24h: number;
  avg_latency_ms_24h: number;
  last_check_at?: string | null;
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
  amount_usd: number;
  status: 'paid' | 'open' | 'failed';
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
