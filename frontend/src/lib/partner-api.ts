import type {
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  RegisterResponse,
  PartnerProfileResponse,
  PartnerDashboardResponse,
  ReferralListResponse,
  CommissionListResponse,
  PayoutItem,
  PayoutListResponse,
  PayoutSettingsUpdateRequest,
  NotificationListResponse,
  NotificationPreferences,
  PartnerTicketDetailResponse,
  PartnerTicketListResponse,
  PartnerTicketMessageItem,
  ForgotPasswordRequest,
  ResendOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  PartnerApplyRequest,
  Partner,
} from '@/types/partner';

const API_BASE = '/api';

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('partner_access_token')
      : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Clear tokens and redirect to login
    if (typeof window !== 'undefined') {
      localStorage.removeItem('partner_access_token');
      localStorage.removeItem('partner_refresh_token');
    }
    throw new Error('UNAUTHORIZED');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    const msg = body?.error?.message || body?.error || `Request failed with status ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  return res.json();
}

export const partnerApi = {
  // ── Auth ─────────────────────────────────────

  async login(data: LoginRequest) {
    return request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async signup(data: RegisterRequest) {
    // Returns `tokens: null` — the account is inert until the emailed code
    // is submitted via `verifyOtp`.
    return request<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Clear the signup email-verification gate. Issues the session. */
  async verifyOtp(data: VerifyOtpRequest) {
    return request<VerifyOtpResponse>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Request a fresh signup code (throttled per IP and per account). */
  async resendOtp(email: string) {
    return request<ResendOtpResponse>('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async me() {
    // Real backend returns UserResponse (snake_case) directly, not wrapped
    return request<{
      id: string;
      email: string;
      full_name?: string;
      is_active?: boolean;
      is_superuser?: boolean;
      avatar_url?: string;
      auth_provider?: string;
      created_at?: string;
      updated_at?: string;
    }>('/auth/me');
  },

  async forgotPassword(data: ForgotPasswordRequest) {
    return request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async resetPassword(data: { token: string; new_password: string }) {
    return request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Best-effort server-side revocation of the current refresh token.
   *
   * Uses a raw fetch because the backend answers 204 No Content — the
   * shared `request()` helper would try to parse an empty body.
   * `dashboard-layout` called `partnerApi.logout()` at three sign-out sites,
   * but the method did not exist, so the refresh token survived sign-out;
   * this fix ensures it is revoked and cleared locally.
   */
  async logout() {
    const refreshToken =
      typeof window !== 'undefined'
        ? localStorage.getItem('partner_refresh_token')
        : null;
    if (!refreshToken) return;
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } finally {
      if (typeof window !== 'undefined')
        localStorage.removeItem('partner_refresh_token');
    }
  },

  // ── Partner ──────────────────────────────────

  async apply(data: PartnerApplyRequest) {
    return request<PartnerProfileResponse>('/partners/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getMe(): Promise<Partner> {
    const res = await request<PartnerProfileResponse>('/partners/me');
    return {
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
      payoutDestination: res.payout_destination ?? null,
      payoutDetailsUpdatedAt: res.payout_details_updated_at ?? null,
    };
  },

  async getPayoutSettings() {
    return request<PartnerProfileResponse>('/partners/me');
  },

  async updatePayoutSettings(data: PayoutSettingsUpdateRequest) {
    return request<PartnerProfileResponse>('/partners/payout-settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getDashboard() {
    return request<PartnerDashboardResponse>('/partners/dashboard');
  },

  async getReferrals(page = 1, pageSize = 20) {
    return request<ReferralListResponse>(`/partners/referrals?page=${page}&page_size=${pageSize}`);
  },

  async getCommissions(page = 1, pageSize = 20) {
    return request<CommissionListResponse>(`/partners/commissions?page=${page}&page_size=${pageSize}`);
  },

  async getPayouts(page = 1, pageSize = 20) {
    return request<PayoutListResponse>(`/partners/payouts?page=${page}&page_size=${pageSize}`);
  },

  async requestPayout() {
    return request<PayoutItem>('/partners/payouts/request', {
      method: 'POST',
    });
  },

  async getAnalytics(days = 30) {
    const mod = await import('@/types/partner');
    return request<import('@/types/partner').PartnerAnalyticsResponse>(`/partners/analytics?days=${days}`);
  },

  async getReferralDetail(referralId: string) {
    return request<import('@/types/partner').ReferralDetailResponse>(`/partners/referrals/${referralId}`);
  },

  // ── Notifications ────────────────────────────

  async getNotifications(page = 1, pageSize = 20, unreadOnly = false) {
    return request<NotificationListResponse>(
      `/partners/notifications?page=${page}&page_size=${pageSize}&unread_only=${unreadOnly}`
    );
  },

  async getUnreadCount() {
    return request<{ unread: number }>('/partners/notifications/unread-count');
  },

  /** Mark specific notifications read, or the whole feed when ids are omitted. */
  async markNotificationsRead(notificationIds?: string[]) {
    return request<{ unread: number }>('/partners/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ notification_ids: notificationIds ?? null }),
    });
  },

  async dismissNotification(id: string) {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('partner_access_token')
        : null;
    await fetch(`/api/partners/notifications/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  },

  async getNotificationPreferences() {
    return request<NotificationPreferences>('/partners/notification-preferences');
  },

  async updateNotificationPreferences(data: Partial<NotificationPreferences>) {
    return request<NotificationPreferences>('/partners/notification-preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // ── Support ──────────────────────────────────

  /** Public (unauthenticated) contact form — kept for the marketing pages. */
  async submitSupport(data: { name: string; email: string; subject: string; message: string }) {
    return request<{ success: boolean }>('/support', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getSupportTickets(page = 1, pageSize = 20) {
    return request<PartnerTicketListResponse>(
      `/partners/support/tickets?page=${page}&page_size=${pageSize}`
    );
  },

  async getSupportThread(ticketId: string) {
    return request<PartnerTicketDetailResponse>(
      `/partners/support/tickets/${ticketId}`
    );
  },

  async createSupportTicket(data: { subject: string; message: string; priority?: string }) {
    return request<PartnerTicketDetailResponse>('/partners/support/tickets', {
      method: 'POST',
      body: JSON.stringify({ priority: 'normal', ...data }),
    });
  },

  async sendSupportMessage(ticketId: string, body: string) {
    return request<PartnerTicketMessageItem>(
      `/partners/support/tickets/${ticketId}/messages`,
      { method: 'POST', body: JSON.stringify({ body }) }
    );
  },
};
