'use client';

import { getRefreshToken, useAppStore } from '@/stores/app-store';
import { refreshSession } from '@/lib/auth-refresh';
import { setOrgIdCookie } from '@/lib/auth-cookie';
import { AUTH_TOKEN_HEADER, ORG_ID_HEADER } from '@/lib/session-cookies';
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
  /** Machine-readable error code from the API envelope (e.g. CHECKOUT_FAILED). */
  code?: string;
  /**
   * The reason slug for classified failures, read out of ``error.details``.
   *
   * Billing surfaces branch on this instead of on message text: a message is
   * copy that gets reworded, a slug is a contract. It is what lets the checkout
   * tell "your card was declined" apart from "we could not reach the provider"
   * without parsing a sentence — and without relaying a provider's own error
   * string to a customer who has no use for it.
   */
  reason?: string;
  details?: { field: string; issue: string }[];
  constructor(
    message: string,
    status: number,
    extra: {
      code?: string;
      reason?: string;
      details?: { field: string; issue: string }[];
    } = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = extra.code;
    this.reason = extra.reason;
    this.details = extra.details;
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
 * holding a perfectly valid session.
 *
 * The mutex lives in `lib/auth-refresh.ts` and is shared with the partner and
 * admin API layers: this module must NOT own a second `refreshing` flag —
 * two single-flights overwrite each other and the losers still replay the
 * spent token. `refreshSession()` is the one and only refresh.
 */

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
  // Mirror headers: the preview edge strips `Authorization` and
  // `X-Organization-ID`, so the same values are sent under non-standard names
  // the edge is less likely to mangle. The proxy re-injects the standard
  // headers upstream (see lib/backend-proxy.ts).
  if (token) headers[AUTH_TOKEN_HEADER] = token;
  if (orgId) headers[ORG_ID_HEADER] = orgId;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401 && retry) {
    const refreshed = await refreshSession();
    // Carry the caller's options through the retry: an exempt call must stay
    // exempt, or the restore would wait on a promise only it can settle.
    if (refreshed) {
      useAppStore.getState().setAccessToken(refreshed.accessToken);
      return request<T>(path, init, false, opts);
    }
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
    // The app's envelope is { error: { code, message, details } }. Read the
    // code and reason beside the message: a caller that only needs a sentence
    // shows the message, and a caller that must *decide* — the checkout above
    // all — switches on the slug.
    const envelope = (data as {
      error?: {
        code?: string;
        message?: string;
        details?: { field?: string; issue?: string }[];
      };
    })?.error;
    const details = (envelope?.details ?? [])
      .filter((d) => d && typeof d.field === 'string')
      .map((d) => ({ field: d.field as string, issue: String(d.issue ?? '') }));
    const reason = details.find((d) => d.field === 'reason')?.issue;
    const raw =
      envelope?.message ||
      (data as { detail?: string; message?: string })?.detail ||
      (data as { message?: string })?.message ||
      `Request failed (${res.status})`;
    throw new ApiError(
      typeof raw === 'string' ? raw : JSON.stringify(raw),
      res.status,
      { code: envelope?.code, reason, details }
    );
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
  /** The USD product price this checkout corresponds to, backend-resolved —
   *  the transparency triple at hand-off is composed from provider figures,
   *  never from UI state. */
  product_currency?: string | null;
  product_amount_minor?: number | null;
  product_price_display?: string | null;
  payment_provider?: string;
  /** The customer's own plan/interval echo, so the hand-off screen restates
   *  the exact order it showed rather than re-deriving it from the URL. */
  plan?: string | null;
  billing_interval?: string | null;
  /**
   * Paystack's *publishable* key plus the InlineJS settings, which is what lets
   * the checkout complete payment inside RELIASTRA's own page. Absent when the
   * backend has no public key configured — the caller then falls back to
   * ``authorization_url``. The secret key never appears in any API response.
   */
  public_key?: string | null;
  inline_js_enabled?: boolean;
  inline_js_url?: string | null;
  /** The rails this transaction was opened with (e.g. ["card"]). */
  channels?: string[];
  payment_methods?: CheckoutPaymentMethod[];
}

/** A payment method the backend's channel policy actually enabled. */
export interface CheckoutPaymentMethod {
  id: string;
  channel: string;
  label: string;
  description?: string;
  networks?: string[];
  restricted_networks?: {
    name: string;
    globally_supported: boolean;
    markets: string[];
  }[];
  provider?: string;
  provider_display?: string;
  supports_international?: boolean;
  markets?: string[];
  /** Always "provider": RELIASTRA never receives card data. */
  handles_card_data?: string;
}

/**
 * The authoritative checkout quote.
 *
 * Rendered, never assembled: every figure a customer sees before paying —
 * product price, charged amount, currency names, disclosure, FX reference,
 * available methods — arrives pre-resolved from the same backend resolvers that
 * will price the transaction. The frontend holds no price table, so there is
 * nothing for it to get wrong and nothing for an attacker to edit.
 */
export interface CheckoutQuote {
  plan: string;
  display_plan: string;
  description?: string;
  features?: Record<string, unknown> | null;
  billing_interval: 'monthly' | 'annual';
  product_currency: string;
  product_amount_minor?: number | null;
  product_price_display?: string | null;
  payment_currency: string;
  payment_amount_minor?: number | null;
  payment_amount_display?: string | null;
  payment_currency_name: string;
  payment_provider: string;
  payment_provider_display?: string;
  period_word?: string;
  currency_notice?: string | null;
  fx_reference?: import('@/lib/billing/currency').FxReference | null;
  payment_methods: CheckoutPaymentMethod[];
  channels: string[];
  /**
   * Digest of the figures this quote was priced from, echoed back when the
   * payment is initialized. It carries no value of its own — the amount is
   * re-resolved server-side either way — but it lets the backend refuse a
   * payment whose page was priced from a since-changed price list, instead of
   * charging the customer a figure they never saw.
   */
  price_token?: string;
  organization_name?: string | null;
  billing_email?: string | null;
  current_plan?: string | null;
  current_interval?: string | null;
  already_subscribed?: boolean;
  available: boolean;
  unavailable_reason?: string | null;
  unavailable_message?: string | null;
  checkout_enabled?: boolean;
  trial_note?: string | null;
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
  pricing: () =>
    request<{
      plans: PricingPlan[];
      payment?: import('@/lib/billing/currency').PaymentCurrencyInfo;
    }>('/pricing'),

  /**
   * Payment history: one row per collected payment, carrying both the USD
   * product price quoted and the ACTUAL charged amount/currency exactly as
   * the provider reported them.
   */
  billingTransactions: () =>
    request<import('@/lib/dashboard/types').BillingTransactionsResult>(
      '/billing/transactions'
    ),

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

  /**
   * The checkout page's render model, resolved entirely server-side.
   *
   * Called with a plan id and an interval only; everything else comes back from
   * the backend. The page never prices anything itself, which is what keeps the
   * reviewed figure and the charged figure the same number.
   */
  checkoutQuote: (plan: PlanId | string, interval: 'monthly' | 'annual' = 'monthly') =>
    request<CheckoutQuote>(
      `/billing/checkout/quote?plan=${encodeURIComponent(plan)}&interval=${interval}`
    ),

  initializePayment: (
    plan: PlanId | string,
    billingInterval: 'monthly' | 'annual' = 'monthly',
    paymentMethod?: string,
    expectedPriceToken?: string
  ) =>
    request<InitializePaymentResult>('/billing/initialize', {
      method: 'POST',
      body: JSON.stringify({
        plan,
        billing_interval: billingInterval,
        // Echoes the method the review screen displayed. It cannot widen the
        // backend's channel policy — an unavailable method is refused there.
        ...(paymentMethod ? { payment_method: paymentMethod } : {}),
        // Proves which quote the customer was shown. Carries no amount, so it
        // cannot price anything: the server re-resolves the figures and refuses
        // the payment if they no longer match what this page displayed.
        ...(expectedPriceToken ? { expected_price_token: expectedPriceToken } : {}),
      }),
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
      /** The USD product price quoted by the checkout, from the persisted
       *  transaction — the transparency triple on the confirmation screen. */
      product_currency?: string | null;
      product_amount_minor?: number | null;
      product_price_display?: string | null;
      payment_provider?: string;
      /** Plan identity for the confirmation screen, from the verification. */
      display_plan?: string | null;
      billing_interval?: string | null;
      period_word?: string | null;
      /** CheckoutReason slug + RELIASTRA wording for a non-verified outcome. */
      reason?: string | null;
      reason_message?: string | null;
      /** True when this verification is what activated the subscription. */
      activated?: boolean;
      /** A second valid payment for a covered period — stated, not hidden. */
      duplicate_payment?: boolean;
    }>(`/billing/verify?reference=${encodeURIComponent(reference)}`, {
      // The verify endpoint provisions the plan and settles the persisted
      // transaction — a state-changing call, so it is a POST like every
      // other checkout step. (The backend also guards replay idempotently.)
      method: 'POST',
    }),

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
  const refreshed = await refreshSession();
  if (!refreshed) return null;
  useAppStore.getState().setAccessToken(refreshed.accessToken);

  const orgList = await api.orgs();
  const org = orgList[0];
  if (!org) return null;

  // Mirror into the org-id cookie before the org-scoped fetches below: the
  // proxy re-injects it when the browser's custom header is stripped.
  setOrgIdCookie(org.id);

  const accessToken = useAppStore.getState().accessToken ?? '';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'X-Organization-ID': org.id,
    [AUTH_TOKEN_HEADER]: accessToken,
    [ORG_ID_HEADER]: org.id,
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
