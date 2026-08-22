'use client';

import type {
  AdminCommissionListResponse,
  AdminCurrentUser,
  AdminOverviewResponse,
  AdminPartnerNotifyRequest,
  AdminPayoutDestinationReveal,
  AdminPartnerNotifyResponse,
  AdminPayoutListResponse,
  AdminPeriod,
  AdminSearchResponse,
  Announcement,
  AnnouncementListResponse,
  ApiErrorBody,
  AttentionResponse,
  AuditLogListResponse,
  CommunicationsOverviewResponse,
  CustomerDetailResponse,
  CustomerListResponse,
  EmailCampaign,
  EmailCampaignListResponse,
  ErrorLogListResponse,
  FeedbackTicket,
  FeedbackTicketListResponse,
  GrowthFunnelResponse,
  GrowthOverviewResponse,
  OperationsOverviewResponse,
  PartnerAdminListResponse,
  PartnerDetailResponse,
  PartnerStatsResponse,
  ProductActivationResponse,
  ProductEngagementResponse,
  ProductFeaturesResponse,
  ProductOverviewResponse,
  ProductVendorsResponse,
  RevenueAttentionResponse,
  RevenueSummaryResponse,
  RevenueTimeseriesResponse,
  SupportOverviewResponse,
  SupportTicketWorkspaceResponse,
  SystemMetrics,
} from '@/types/admin';

export class AdminApiError extends Error {
  status: number;
  code?: string;
  requestId?: string;
  details?: Array<{ field?: string; issue?: string }>;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string;
      requestId?: string;
      details?: Array<{ field?: string; issue?: string }>;
    }
  ) {
    super(message);
    this.name = 'AdminApiError';
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  // The existing Partner Network uses this token for the shared RELIASTRA API.
  // Read the generic key first so a future product login can migrate without
  // breaking an active admin session.
  return (
    window.localStorage.getItem('reliastra_access_token') ||
    window.localStorage.getItem('partner_access_token')
  );
}

export function clearReliastraSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('reliastra_access_token');
  window.localStorage.removeItem('reliastra_refresh_token');
  window.localStorage.removeItem('partner_access_token');
  window.localStorage.removeItem('partner_refresh_token');
  // The legacy Partner Network persists its auth envelope under this key.
  // Remove it too so an expired shared API session cannot be resurrected by
  // hydration after the admin console has cleared sensitive state.
  window.localStorage.removeItem('partner-store');
}

function notifyAccessFailure(type: 'expired' | 'denied') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(`reliastra:admin-${type}`));
}

function queryString(params?: QueryParams) {
  if (!params) return '';
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const value = search.toString();
  return value ? `?${value}` : '';
}

function errorFromBody(status: number, body: ApiErrorBody | undefined): AdminApiError {
  const error = body?.error;
  const nested = typeof error === 'object' && error !== null ? error : undefined;
  const fallback =
    typeof error === 'string'
      ? error
      : body?.detail || body?.message || `Request failed with status ${status}`;

  return new AdminApiError(nested?.message || fallback, {
    status,
    code: nested?.code,
    requestId: nested?.request_id,
    details: nested?.details,
  });
}

async function request<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    params?: QueryParams;
    body?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    const error = new AdminApiError('Your admin session has expired. Please sign in again.', {
      status: 401,
      code: 'UNAUTHORIZED',
    });
    clearReliastraSession();
    notifyAccessFailure('expired');
    throw error;
  }

  const method = options.method ?? 'GET';
  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`/api/admin${path}${queryString(options.params)}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      credentials: 'same-origin',
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new AdminApiError('Unable to reach the RELIASTRA API. Please try again.', {
      status: 0,
      code: 'NETWORK_ERROR',
    });
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = errorFromBody(response.status, body as ApiErrorBody | undefined);
    if (response.status === 401) {
      clearReliastraSession();
      notifyAccessFailure('expired');
    }
    if (response.status === 403) {
      notifyAccessFailure('denied');
    }
    throw error;
  }

  return body as T;
}

/**
 * A typed, single integration point for the registered `/v1/admin/*` API.
 * UI components consume this service through React Query; none issue fetches
 * directly or create a second client-side cache.
 */
export const adminApi = {
  currentUser: async (): Promise<AdminCurrentUser> => {
    const token = getAccessToken();
    if (!token) {
      throw new AdminApiError('Your admin session has expired. Please sign in again.', {
        status: 401,
        code: 'UNAUTHORIZED',
      });
    }
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      credentials: 'same-origin',
    });
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = errorFromBody(response.status, body as ApiErrorBody | undefined);
      if (response.status === 401) {
        clearReliastraSession();
        notifyAccessFailure('expired');
      }
      throw error;
    }
    return body as AdminCurrentUser;
  },

  overview: () => request<AdminOverviewResponse>('/overview'),
  attention: () => request<AttentionResponse>('/attention'),
  search: (q: string, limit = 8) =>
    request<AdminSearchResponse>('/search', { params: { q, limit } }),

  customers: (params: QueryParams = {}) =>
    request<CustomerListResponse>('/customers', { params }),
  recentCustomers: (limit = 7) =>
    request<CustomerListResponse>('/customers/recent', { params: { limit } }),
  churnRiskCustomers: (limit = 20) =>
    request<CustomerListResponse>('/customers/churn-risk', { params: { limit } }),
  customer: (customerId: string) => request<CustomerDetailResponse>(`/customers/${customerId}`),
  customerActivity: (customerId: string, params: QueryParams = {}) =>
    request<{ items: Array<Record<string, unknown>>; total: number; page: number; page_size: number }>(
      `/customers/${customerId}/activity`,
      { params }
    ),
  updateCustomer: (customerId: string, data: { full_name?: string; admin_note?: string; source?: string }) =>
    request<CustomerDetailResponse>(`/customers/${customerId}`, { method: 'PATCH', body: data }),
  changeCustomerPlan: (customerId: string, data: { plan: string; reason?: string; org_id?: string }) =>
    request<{ org_id: string; old_plan: string; new_plan: string; reason?: string }>(
      `/customers/${customerId}/plan`,
      { method: 'POST', body: data }
    ),
  emailCustomer: (customerId: string, data: { subject: string; body: string; html_body?: string }) =>
    request<{ message: string; customer_id: string }>(`/customers/${customerId}/email`, {
      method: 'POST',
      body: data,
    }),
  impersonateCustomer: (customerId: string, reason: string) =>
    request<{
      token: string;
      impersonated_user_id: string;
      impersonated_email: string;
      expires_in_seconds: number;
      impersonator_id: string;
      reason: string;
      no_refresh_token: boolean;
    }>(`/customers/${customerId}/impersonate`, { method: 'POST', body: { reason } }),
  deactivateCustomer: (customerId: string, reason: string) =>
    request<CustomerDetailResponse>(`/customers/${customerId}/deactivate`, {
      method: 'POST',
      body: { reason },
    }),

  revenueSummary: () => request<RevenueSummaryResponse>('/revenue/summary'),
  revenueTimeseries: (period: AdminPeriod, granularity: 'day' | 'week' | 'month' = 'day') =>
    request<RevenueTimeseriesResponse>('/revenue/timeseries', {
      params: { period, granularity },
    }),
  revenueAttention: () => request<RevenueAttentionResponse>('/revenue/attention'),

  growthOverview: (period: AdminPeriod) =>
    request<GrowthOverviewResponse>('/growth/overview', { params: { period } }),
  growthFunnel: (period: AdminPeriod) =>
    request<GrowthFunnelResponse>('/growth/funnel', { params: { period } }),
  growthRetention: (weeks = 12) =>
    request<{ cohorts: Array<Record<string, unknown>>; weeks: number }>('/growth/retention', {
      params: { weeks },
    }),
  growthReferrals: () =>
    request<{ summary: Record<string, unknown>; top_referrers: Array<Record<string, unknown>> }>(
      '/growth/referrals'
    ),

  productOverview: () => request<ProductOverviewResponse>('/product/overview'),
  productFeatures: () => request<ProductFeaturesResponse>('/product/features'),
  productVendors: (limit = 12) =>
    request<ProductVendorsResponse>('/product/vendors', { params: { limit } }),
  productEngagement: () => request<ProductEngagementResponse>('/product/engagement'),
  productActivation: () => request<ProductActivationResponse>('/product/activation'),

  supportOverview: () => request<SupportOverviewResponse>('/support/overview'),
  tickets: (params: QueryParams = {}) =>
    request<FeedbackTicketListResponse>('/support/tickets', { params }),
  ticket: (ticketId: string) => request<SupportTicketWorkspaceResponse>(`/support/tickets/${ticketId}`),
  createTicket: (data: {
    email: string;
    full_name?: string;
    category?: string;
    subject: string;
    body: string;
    priority?: string;
    source?: string;
  }) => request<FeedbackTicket>('/support/tickets', { method: 'POST', body: data }),
  updateTicket: (
    ticketId: string,
    data: { status?: string; priority?: string; assigned_to?: string; resolution?: string }
  ) => request<FeedbackTicket>(`/support/tickets/${ticketId}`, { method: 'PATCH', body: data }),
  replyToTicket: (ticketId: string, data: { body: string; is_internal_note?: boolean }) =>
    request(`/support/tickets/${ticketId}/reply`, { method: 'POST', body: data }),
  bulkUpdateTickets: (data: {
    ticket_ids: string[];
    status?: string;
    priority?: string;
    assigned_to?: string;
  }) => request<{ updated_count: number; message: string }>('/support/tickets/bulk-update', { method: 'POST', body: data }),

  communicationsOverview: () => request<CommunicationsOverviewResponse>('/communications/overview'),
  campaigns: (params: QueryParams = {}) =>
    request<EmailCampaignListResponse>('/communications/campaigns', { params }),
  campaign: (campaignId: string) => request<EmailCampaign>(`/communications/campaigns/${campaignId}`),
  createCampaign: (data: {
    campaign_name: string;
    subject: string;
    body_html: string;
    body_text?: string;
    segment?: string;
    utm_campaign?: string;
    scheduled_at?: string;
  }) => request<EmailCampaign>('/communications/campaigns', { method: 'POST', body: data }),
  updateCampaign: (
    campaignId: string,
    data: {
      campaign_name?: string;
      subject?: string;
      body_html?: string;
      body_text?: string;
      segment?: string;
    }
  ) => request<EmailCampaign>(`/communications/campaigns/${campaignId}`, { method: 'PATCH', body: data }),
  sendCampaign: (campaignId: string) =>
    request<{ message: string; campaign_id: string; recipient_count: number }>(
      `/communications/campaigns/${campaignId}/send`,
      { method: 'POST' }
    ),
  announcements: (params: QueryParams = {}) =>
    request<AnnouncementListResponse>('/communications/announcements', { params }),
  createAnnouncement: (data: {
    title: string;
    body_html: string;
    placement?: string;
    target_plans?: string[];
    target_segment?: string;
    action_url?: string;
    action_label?: string;
    is_dismissible?: boolean;
    bg_color?: string;
    text_color?: string;
    starts_at?: string;
    expires_at?: string;
  }) => request<Announcement>('/communications/announcements', { method: 'POST', body: data }),
  updateAnnouncement: (announcementId: string, data: Partial<Announcement>) =>
    request<Announcement>(`/communications/announcements/${announcementId}`, {
      method: 'PATCH',
      body: data,
    }),

  partnerStats: () => request<PartnerStatsResponse>('/partners/stats'),
  partners: (params: QueryParams = {}) =>
    request<PartnerAdminListResponse>('/partners', { params }),
  partner: (partnerId: string) => request<PartnerDetailResponse>(`/partners/${partnerId}`),
  partnerCommissions: (params: QueryParams = {}) =>
    request<AdminCommissionListResponse>('/partners/commissions', { params }),
  reverseCommission: (commissionId: string, reason: string) =>
    request<{ commission_id: string; status: string }>(`/partners/commissions/${commissionId}/reverse`, {
      method: 'POST',
      body: { reason },
    }),
  partnerPayouts: (params: QueryParams = {}) =>
    request<AdminPayoutListResponse>('/partners/payouts', { params }),
  createPayout: (data: { partner_id: string; amount_minor?: number }) =>
    request<{ payout_id: string; partner_id: string; amount_minor: number; status: string }>(
      '/partners/payouts',
      { method: 'POST', body: data }
    ),
  processPayout: (payoutId: string, data: { action: 'mark_paid' | 'mark_failed'; transaction_reference?: string }) =>
    request<{ payout_id: string; status: string; transaction_reference?: string }>(
      `/partners/payouts/${payoutId}/process`,
      { method: 'POST', body: data }
    ),
  /**
   * Reveal a partner's full payout destination.
   *
   * Everything else in the admin API is masked; this call is audited
   * server-side, so only make it when an admin is actually about to pay.
   */
  revealPayoutDestination: (partnerId: string) =>
    request<AdminPayoutDestinationReveal>(`/partners/${partnerId}/payout-destination`),
  /**
   * Send an in-app notification (and, unless suppressed, an email) to one,
   * several, or every partner. Each recipient's own email preferences are
   * still respected; the in-app copy is always delivered.
   */
  notifyPartners: (data: AdminPartnerNotifyRequest) =>
    request<AdminPartnerNotifyResponse>('/partners/notify', {
      method: 'POST',
      body: data,
    }),
  updatePartnerStatus: (partnerId: string, data: { status: 'active' | 'suspended' | 'banned'; reason?: string }) =>
    request<{ partner_id: string; status: string }>(`/partners/${partnerId}`, {
      method: 'PATCH',
      body: data,
    }),

  operationsOverview: () => request<OperationsOverviewResponse>('/operations/overview'),
  errors: (params: QueryParams = {}) => request<ErrorLogListResponse>('/operations/errors', { params }),
  systemMetrics: () => request<SystemMetrics>('/operations/metrics'),
  auditLogs: (params: QueryParams = {}) => request<AuditLogListResponse>('/audit-log', { params }),
};

export function isAdminApiError(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError;
}
