'use client';

import { getRefreshToken, setRefreshToken, useAppStore } from '@/stores/app-store';
import type {
  AlertConfig,
  AgencyPortfolio,
  AgencyClient,
  AgencyApplication,
  ApiKeyCreateResponse,
  ApiKeyItem,
  CheckResult,
  DashboardSummary,
  Dependency,
  DependencyCreate,
  DependencyHealth,
  DependencyHistory,
  EvidenceReport,
  Incident,
  IncidentDetail,
  InboxListResponse,
  InboxUnreadCountResponse,
  Organization,
  Paginated,
  PlanDetails,
  PlanId,
  PricingPlan,
  SupportMessage,
  SupportTicketDetail,
  SupportTicketListResponse,
  UserMe,
  VendorStatus,
} from './types';
import { unwrapList } from './types';

const BASE = '/api/v1';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Single-flight refresh.
 *
 * A refresh token is rotated by the backend and can be spent once. Bootstrap
 * and any number of requests can hit a 401 in the same tick (a hard
 * navigation fires several panel requests at once, and React's dev-mode double
 * mount does the same), so without dedup the losers replay the spent token,
 * the backend rejects it, and the user is bounced to "session ended" while
 * holding a perfectly valid session. One in-flight promise is shared instead.
 */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refresh = getRefreshToken();
    if (!refresh) return null;
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.access_token) {
        useAppStore.getState().setAccessToken(data.access_token);
      }
      if (data.refresh_token) setRefreshToken(data.refresh_token);
      return data.access_token ?? null;
    } catch {
      return null;
    }
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

/**
 * One shared session restoration.
 *
 * A hard page load — a refresh, a deep link to `/settings/billing`, an email
 * link — starts with a refresh token in localStorage and nothing else: the
 * access token and the active organization live only in the store. Every panel
 * mounts in the same tick, so each one used to fire its first request while the
 * session was still being restored: 401 without a token, then 403 on any
 * organization-scoped endpoint because the org header was still missing. The
 * customer saw an empty or failed screen with a perfectly valid account.
 *
 * Requests now await the same restoration promise the shell uses, so the
 * session is established once and no surface has to know about it. Calls made
 * *by* the restoration itself skip the gate — otherwise `api.orgs()` would
 * wait on the promise it is resolving.
 */
let restorePromise: ReturnType<typeof bootstrapSession> | null = null;

/**
 * Restore the session once, however many callers notice it is missing.
 *
 * The store is written *inside* this promise, so "resolved" and "the app knows
 * its organization" are the same moment. A caller that awaits restoration and
 * then reads the store must never be able to observe a half-applied session —
 * that gap is what made organization-scoped requests 403 right after a reload.
 */
export function restoreSession() {
  if (!restorePromise) {
    restorePromise = bootstrapSession()
      .then((session) => {
        if (session) {
          useAppStore.getState().setSession(session.user, session.org, session.plan);
        }
        return session;
      })
      .finally(() => {
        restorePromise = null;
      });
  }
  return restorePromise;
}

async function waitForSession(): Promise<void> {
  const state = useAppStore.getState();
  if (state.accessToken && state.org) return;
  if (!getRefreshToken()) return; // signed out: nothing to wait for
  try {
    await restoreSession();
  } catch {
    // The request proceeds and fails the way an unauthenticated one does; the
    // 401 path below owns clearing the session.
  }
}

/**
 * Single authenticated request path. No fabricated fallbacks: a monitoring
 * product must never render made-up uptime or incidents, so failures
 * surface as typed errors that pages turn into explicit error states.
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
  /** Set only by the session restore itself: its own calls must not wait on
   * the promise they are resolving. */
  opts: { skipSessionGate?: boolean } = {}
): Promise<T> {
  if (!opts.skipSessionGate) await waitForSession();
  const token = useAppStore.getState().accessToken;
  const headers: Record<string, string> = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const orgId = useAppStore.getState().org?.id;
  if (orgId) headers['X-Organization-ID'] = orgId;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401 && retry) {
    if (!refreshing) refreshing = refreshAccessToken().finally(() => { refreshing = null; });
    const next = await refreshing;
    // Carry the caller's options through the retry: an exempt call must stay
    // exempt, or the restore would wait on a promise only it can settle.
    if (next) return request<T>(path, init, false, opts);
  }

  // Session is unrecoverable — clear and let the shell route to sign-in.
  if (res.status === 401) {
    useAppStore.getState().sessionExpired();
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(`Malformed response (${res.status})`, res.status);
  }
  if (!res.ok) {
    const message =
      (data as { detail?: string; message?: string })?.detail ||
      (data as { message?: string })?.message ||
      `Request failed (${res.status})`;
    throw new ApiError(typeof message === 'string' ? message : JSON.stringify(message), res.status);
  }
  return data as T;
}

/** What Paystack will be told to charge, echoed back by the backend. */
export interface InitializePaymentResult {
  authorization_url: string;
  reference: string;
  access_code: string;
  /** Minor units of `currency` — the exact amount handed to Paystack. */
  amount_minor?: number | null;
  currency?: string | null;
  amount_display?: string | null;
}

export const api = {
  me: () => request<UserMe>('/users/me'),
  org: () => request<Organization>('/orgs/current'),
  // Skips the session gate: this call *is* how the organization is resolved.
  orgs: () =>
    request<Organization[] | { data: Organization[] }>('/orgs', {}, true, {
      skipSessionGate: true,
    }).then(unwrapList),
  plan: () => request<PlanDetails>('/billing/plan'),
  pricing: () => request<{ plans: PricingPlan[] }>('/pricing'),

  summary: () => request<DashboardSummary>('/dashboard/summary'),
  health: () =>
    request<Paginated<DependencyHealth> | DependencyHealth[]>('/dashboard/dependency-health').then(unwrapList),
  vendors: () =>
    request<Paginated<VendorStatus> | VendorStatus[]>('/dashboard/vendor-status').then(unwrapList),
  latency: (hours = 24, depId?: string) =>
    request<{ points: Array<{ t: string; v: number }> }>(
      `/dashboard/latency?hours=${hours}${depId ? `&dependency_id=${depId}` : ''}`
    ),

  incidents: (params?: { limit?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.status) q.set('status', params.status);
    return request<Paginated<Incident> | Incident[]>(`/incidents?${q.toString()}`).then(unwrapList);
  },

  incident: (id: string) => request<IncidentDetail>(`/incidents/${id}`),

  incidentEvidence: (id: string) => request<EvidenceReport>(`/incidents/${id}/evidence`),

  dependencies: () =>
    request<Paginated<Dependency> | Dependency[]>('/dependencies').then(unwrapList),

  dependency: (id: string) => request<Dependency>(`/dependencies/${id}`),

  dependencyHistory: (id: string) => request<DependencyHistory>(`/dependencies/${id}/history`),

  dependencyResults: (id: string) =>
    request<Paginated<CheckResult> | CheckResult[]>(`/dependencies/${id}/results`).then(unwrapList),

  createDependency: (body: DependencyCreate) =>
    request<Dependency>('/dependencies', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateDependency: (id: string, body: Partial<DependencyCreate>) =>
    request<Dependency>(`/dependencies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteDependency: (id: string) =>
    request<void>(`/dependencies/${id}`, { method: 'DELETE' }),

  evidence: () => request<EvidenceReport[]>('/evidence'),

  evidenceById: (id: string) => request<EvidenceReport>(`/evidence/${id}`),

  regenerateEvidence: (id: string) =>
    request<EvidenceReport>(`/evidence/${id}/regenerate`, { method: 'POST' }),

  alertConfigs: () => request<AlertConfig[]>('/notifications/configs'),

  createAlertConfig: (body: { channel_type: string; config: Record<string, string>; is_active: boolean }) =>
    request<AlertConfig>('/notifications/configs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── In-dashboard notification inbox ───────────────────────────────────────
  // No mock fallback, ever. The bell previously rendered three hardcoded
  // strings, so a customer mid-outage saw static fiction instead of their own
  // degraded dependency. A failed request must surface as an empty/error
  // state, never as invented alerts.

  inbox: (params?: { page?: number; page_size?: number; unread_only?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.page_size) q.set('page_size', String(params.page_size));
    if (params?.unread_only) q.set('unread_only', 'true');
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return request<InboxListResponse>(`/notifications/inbox${suffix}`);
  },

  inboxUnreadCount: () =>
    request<InboxUnreadCountResponse>('/notifications/inbox/unread-count'),

  markInboxRead: (notificationIds?: string[]) =>
    request<InboxUnreadCountResponse>('/notifications/inbox/read', {
      method: 'POST',
      body: JSON.stringify({ notification_ids: notificationIds ?? null }),
    }),

  dismissInboxItem: (notificationId: string) =>
    request<void>(`/notifications/inbox/${notificationId}`, { method: 'DELETE' }),

  // ── Support desk ──────────────────────────────────────────────────────────
  // The same conversation surface the admin support workspace answers.

  supportTickets: (params?: { page?: number; page_size?: number }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.page_size) q.set('page_size', String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return request<SupportTicketListResponse>(`/partners/support/tickets${suffix}`);
  },

  supportThread: (ticketId: string) =>
    request<SupportTicketDetail>(`/partners/support/tickets/${ticketId}`),

  createSupportTicket: (body: {
    subject: string;
    message: string;
    priority?: string;
  }) =>
    request<SupportTicketDetail>('/partners/support/tickets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  addSupportMessage: (ticketId: string, body: string) =>
    request<SupportMessage>(
      `/partners/support/tickets/${ticketId}/messages`,
      { method: 'POST', body: JSON.stringify({ body }) }
    ),

  // ── Organization ─────────────────────────────────────────────────────────

  updateOrg: (body: { name?: string }) =>
    request<Organization>('/orgs/current', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // ── API keys ─────────────────────────────────────────────────────────────

  apiKeys: () => request<ApiKeyItem[]>('/api-keys'),

  createApiKey: (body: { name: string; scopes?: string[] }) =>
    request<ApiKeyCreateResponse>('/api-keys', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  deleteApiKey: (id: string) => request<void>(`/api-keys/${id}`, { method: 'DELETE' }),

  // ── Billing (real Paystack flow) ────────────────────────────────────────

  initializePayment: (plan: PlanId | string, billingInterval: 'monthly' | 'annual' = 'monthly') =>
    request<InitializePaymentResult>('/billing/initialize', {
      method: 'POST',
      body: JSON.stringify({ plan, billing_interval: billingInterval }),
    }),

  /**
   * Authoritative payment currency + canonical disclosure. Public and cheap;
   * every payment surface reads this so none of them can state a different
   * currency than the one checkout will charge.
   */
  paymentCurrency: () =>
    request<import('@/lib/billing/currency').PaymentCurrencyInfo>('/billing/currency'),

  /**
   * Confirm a transaction with Paystack. The response also echoes what was
   * collected (amount and currency), so any post-payment screen restates the
   * gateway's own figure instead of recomputing a price that could have moved.
   */
  verifyTransaction: (reference: string) =>
    request<{
      verified: boolean;
      plan: string;
      reference: string;
      currency?: string | null;
      amount_minor?: number | null;
      amount_display?: string | null;
    }>(`/billing/verify?reference=${encodeURIComponent(reference)}`),

  // ── Agency ────────────────────────────────────────────────────────────────

  clients: () => request<AgencyClient[]>('/clients'),

  createClient: (body: { name: string; description?: string }) =>
    request<AgencyClient>('/clients', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  applications: (clientId: string) =>
    request<AgencyApplication[]>(`/clients/${clientId}/applications`),

  createApplication: (clientId: string, body: { name: string; description?: string }) =>
    request<AgencyApplication>(`/clients/${clientId}/applications`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  portfolio: () => request<AgencyPortfolio>('/agency/portfolio'),
};

/**
 * Session bootstrap.
 *
 * The backend resolves the organization exclusively from the
 * `X-Organization-ID` header, which the store cannot know until the org is
 * loaded. So bootstrap must: refresh (mutexed) → list orgs (no header
 * required) → fetch me/org/plan WITH the org header. Every later request
 * then carries the header from the store automatically.
 */
export async function bootstrapSession(): Promise<{
  user: UserMe;
  org: Organization;
  plan: PlanDetails;
} | null> {
  const access = await refreshAccessToken();
  if (!access) return null;

  const orgList = await api.orgs();
  const org = orgList[0];
  if (!org) return null;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${useAppStore.getState().accessToken ?? ''}`,
    'X-Organization-ID': org.id,
  };
  const [userRes, orgRes, planRes] = await Promise.all([
    fetch(`${BASE}/users/me`, { headers }),
    fetch(`${BASE}/orgs/current`, { headers }),
    fetch(`${BASE}/billing/plan`, { headers }),
  ]);
  if (!userRes.ok || !orgRes.ok || !planRes.ok) {
    if (userRes.status === 401 || orgRes.status === 401 || planRes.status === 401) {
      useAppStore.getState().sessionExpired();
    }
    throw new ApiError('Failed to load session', 502);
  }
  const [user, orgFull, plan] = await Promise.all([
    userRes.json() as Promise<UserMe>,
    orgRes.json() as Promise<Organization>,
    planRes.json() as Promise<PlanDetails>,
  ]);
  return { user, org: orgFull, plan };
}
