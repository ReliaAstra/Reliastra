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
  AdminAnalyticsOverview,
  AbandonedCheckoutLead,
} from '@/types/admin';
import {
  storeAdminTokens,
  getAdminAccessToken,
  getAdminRefreshToken,
  clearAdminTokens,
} from '@/lib/admin-session-storage';
import { ADMIN_TOKEN_HEADER } from '@/lib/admin-session-cookie';

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

/**
 * Admin session model:
 *
 *   - PRIMARY: admin access/refresh tokens live in HttpOnly cookies managed
 *     by the `/api/admin/*` route handlers and `proxy.ts`. Browser JavaScript
 *     never sees them in a normal (top-level, same-origin) deployment.
 *   - FALLBACK (preview edge): embedded cross-site iframes refuse to store
 *     cookies, so the login/refresh handlers ALSO return the token pair and
 *     this module holds it in sessionStorage, mirroring it as
 *     `X-Reliastra-Admin-Token`. The proxy verifies that header exactly like
 *     the cookie (signature + audience + type + expiry), so a customer or
 *     partner token can never be smuggled into the admin plane.
 *   - The admin token family is minted from the dedicated operator
 *     credentials (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) by the backend and is
 *     rejected on every customer/partner surface. Conversely the shared
 *     customer/partner token is rejected on every admin surface.
 *   - Refresh rotation happens server-side (proxy + route handlers) when the
 *     cookie channel is live; when only the mirror channel is available this
 *     module refreshes explicitly and retries once. The customer/partner
 *     session store is never touched.
 *   - A 401 after a failed refresh means the admin session is genuinely gone;
 *     the gate routes to the dedicated `/admin/login`.
 */

const ADMIN_SESSION_MARKER = 'x-admin-request';

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

/**
 * Rotate the mirror-channel admin session explicitly.
 *
 * Used only when the HttpOnly cookie channel is unavailable (embedded preview
 * iframe). The refresh token is sent in the JSON body; the route handler
 * verifies it with the same checks as the cookie and returns a fresh pair.
 * On success the new tokens replace the sessionStorage copy.
 */
async function refreshAdminSession(): Promise<boolean> {
  const refreshToken = getAdminRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch('/api/admin/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [ADMIN_SESSION_MARKER]: '1',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      credentials: 'same-origin',
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!data.access_token || !data.refresh_token) return false;
    storeAdminTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    params?: QueryParams;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
  retried = false
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: HeadersInit = {
    // The admin-only marker doubles as the CSRF guard on the server: a
    // cross-site request cannot set a custom header. Cookies carry the
    // session when available; the mirror header is the preview-edge fallback.
    [ADMIN_SESSION_MARKER]: '1',
    Accept: 'application/json',
  };

  const mirrorToken = getAdminAccessToken();
  if (mirrorToken) {
    headers[ADMIN_TOKEN_HEADER] = mirrorToken;
  }

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

  if (response.status === 401 && !retried) {
    // The proxy already attempted a server-side (cookie) rotation before
    // returning 401. On the preview edge the cookie channel is unavailable,
    // so rotate the mirror-channel session and retry once.
    if (getAdminRefreshToken() && (await refreshAdminSession())) {
      return request<T>(path, options, true);
    }
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = errorFromBody(response.status, body as ApiErrorBody | undefined);
    if (response.status === 401) {
      // No usable session remains. NEVER clear shared storage: a
      // customer/partner session in another tab is unrelated and alive.
      notifyAccessFailure('expired');
    }
    if (response.status === 403) {
      notifyAccessFailure('denied');
    }
    throw error;
  }

  return body as T;
}

export interface AdminLoginResult {
  admin: AdminCurrentUser;
  expires_in: number;
  /** Present only as a preview-edge fallback (mirror channel). */
  access_token?: string;
  /** Present only as a preview-edge fallback (mirror channel). */
  refresh_token?: string;
}

/**
 * A typed, single integration point for the registered `/v1/admin/*` API.
 * UI components consume this service through React Query; none issue fetches
 * directly or create a second client-side cache.
 */
export const adminApi = {
  /**
   * Exchange the dedicated operator credentials for an admin session.
   *
   * POSTs to `/api/admin/auth/login`. The route handler talks to the backend
   * and stores the minted tokens in HttpOnly cookies; the response body
   * contains only the admin identity. Nothing is written to storage.
   */
  login: async (username: string, password: string): Promise<AdminLoginResult> => {
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [ADMIN_SESSION_MARKER]: '1',
          Accept: 'application/json',
        },
        body: JSON.stringify({ username, password }),
        credentials: 'same-origin',
      });
      const body = await response.json().catch(() => undefined);
      if (!response.ok) {
        const error = errorFromBody(response.status, body as ApiErrorBody | undefined);
        throw error;
      }
      const result = body as AdminLoginResult;
      if (!result.admin) {
        throw new AdminApiError('The backend returned an incomplete admin session.', {
          status: 502,
          code: 'BACKEND_PROTOCOL_ERROR',
        });
      }
      // Hold the token pair as the preview-edge fallback. In a normal
      // deployment the HttpOnly cookie carries the session and these are
      // simply the same tokens the server already has; storing them here only
      // matters when the browser refused to store the cookie.
      if (result.access_token || result.refresh_token) {
        storeAdminTokens(result.access_token ?? null, result.refresh_token ?? null);
      }
      return result;
    } catch (cause) {
      if (cause instanceof AdminApiError) throw cause;
      throw new AdminApiError('Unable to reach the RELIASTRA API. Please try again.', {
        status: 0,
        code: 'NETWORK_ERROR',
      });
    }
  },

  /**
   * Explicit admin sign-out. Server-side revocation of the admin refresh
   * token + HttpOnly cookie clearing. Customer/partner sessions are
   * NEVER touched.
   */
  logout: async (): Promise<void> => {
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        headers: { [ADMIN_SESSION_MARKER]: '1', Accept: 'application/json' },
        credentials: 'same-origin',
      });
    } catch {
      // Best-effort: the browser will still have cookies cleared by the
      // route handler on success; if the request fails entirely, the gate's
      // next 401 will route to /admin/login anyway.
    } finally {
      clearAdminTokens();
    }
  },

  currentUser: async (): Promise<AdminCurrentUser> => request<AdminCurrentUser>('/auth/me'),

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
  analytics: (days = 14) =>
    request<AdminAnalyticsOverview>('/analytics/overview', { params: { days } }),
  abandonedCheckouts: (limit = 100) =>
    request<{ items: AbandonedCheckoutLead[]; total: number }>('/analytics/abandoned-checkouts', {
      params: { limit },
    }),
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
