'use client';

import { getRefreshToken, setRefreshToken, useAppStore } from '@/stores/app-store';
import {
  mockAlertConfigs,
  mockDependencies,
  mockEvidence,
  mockHealth,
  mockHistory,
  mockIncidentDetail,
  mockIncidentResolvedDetail,
  mockIncidents,
  mockLatency,
  mockOrg,
  mockPlan,
  mockPricing,
  mockResults,
  mockSummary,
  mockUser,
  mockVendors,
  paginate,
  IDS,
} from './mock';
import type {
  AlertConfig,
  CheckResult,
  DashboardSummary,
  Dependency,
  DependencyCreate,
  DependencyHealth,
  DependencyHistory,
  EvidenceReport,
  Incident,
  IncidentDetail,
  Organization,
  Paginated,
  PlanDetails,
  PricingPlan,
  UserMe,
  VendorStatus,
} from './types';
import { unwrapList } from './types';

const BASE = '/api/v1';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
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
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true
): Promise<T> {
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
    if (next) return request<T>(path, init, false);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.detail || data?.message || `Request failed (${res.status})`;
    throw new ApiError(typeof message === 'string' ? message : JSON.stringify(message), res.status);
  }
  return data as T;
}

async function withFallback<T>(fn: () => Promise<T>, fallback: T | (() => T)): Promise<T> {
  const demo = useAppStore.getState().isDemo || !useAppStore.getState().accessToken;
  // Demo mode always uses mock data.
  if (demo) return typeof fallback === 'function' ? (fallback as () => T)() : fallback;
  try {
    return await fn();
  } catch (err) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      useAppStore.getState().setOnline(false);
      // Offline: fall back so cached/demo content keeps the UI usable.
      return typeof fallback === 'function' ? (fallback as () => T)() : fallback;
    }
    // Online failure against the real backend must NOT be masked with mock
    // data — silently rendering fabricated uptime/incident figures in a
    // monitoring product is worse than an explicit error state.
    throw err;
  }
}

export const api = {
  me: () => withFallback(() => request<UserMe>('/users/me'), mockUser),
  org: () => withFallback(() => request<Organization>('/orgs/current'), mockOrg),
  plan: () => withFallback(() => request<PlanDetails>('/billing/plan'), mockPlan),
  pricing: () =>
    withFallback(
      () => request<{ plans: PricingPlan[] }>('/pricing'),
      mockPricing
    ),

  summary: () =>
    withFallback(() => request<DashboardSummary>('/dashboard/summary'), mockSummary),
  health: () =>
    withFallback(
      () => request<DependencyHealth[]>('/dashboard/dependency-health'),
      mockHealth
    ),
  vendors: () =>
    withFallback(
      () => request<VendorStatus[]>('/dashboard/vendor-status'),
      mockVendors
    ),
  latency: (hours = 24, depId?: string) =>
    withFallback(
      () =>
        request(`/dashboard/latency?hours=${hours}`),
      () => mockLatency(depId)
    ),

  incidents: (params?: { limit?: number; status?: string }) =>
    withFallback(
      async () => {
        const q = new URLSearchParams();
        if (params?.limit) q.set('limit', String(params.limit));
        if (params?.status) q.set('status', params.status);
        const data = await request<Paginated<Incident> | Incident[]>(
          `/incidents?${q.toString()}`
        );
        return unwrapList(data);
      },
      () =>
        mockIncidents.filter((i) =>
          params?.status ? i.status === params.status : true
        ).slice(0, params?.limit ?? 50)
    ),

  incident: (id: string) =>
    withFallback(
      () => request<IncidentDetail>(`/incidents/${id}`),
      () =>
        id === IDS.incidentResolved
          ? mockIncidentResolvedDetail
          : { ...mockIncidentDetail, id }
    ),

  incidentEvidence: (id: string) =>
    withFallback(
      () => request<EvidenceReport>(`/incidents/${id}/evidence`),
      () => mockEvidence.find((e) => e.incident_id === id) ?? mockEvidence[0]
    ),

  dependencies: () =>
    withFallback(
      async () => {
        const data = await request<Paginated<Dependency> | Dependency[]>('/dependencies');
        return unwrapList(data);
      },
      mockDependencies
    ),

  dependency: (id: string) =>
    withFallback(
      () => request<Dependency>(`/dependencies/${id}`),
      () => mockDependencies.find((d) => d.id === id) ?? mockDependencies[0]
    ),

  dependencyHistory: (id: string) =>
    withFallback(
      () => request<DependencyHistory>(`/dependencies/${id}/history`),
      () => mockHistory(id)
    ),

  dependencyResults: (id: string) =>
    withFallback(
      async () => {
        const data = await request<Paginated<CheckResult> | CheckResult[]>(
          `/dependencies/${id}/results`
        );
        return unwrapList(data);
      },
      () => mockResults(id)
    ),

  createDependency: (body: DependencyCreate) =>
    withFallback(
      () =>
        request<Dependency>('/dependencies', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      () => ({
        ...mockDependencies[0],
        id: crypto.randomUUID(),
        name: body.name,
        endpoint_url: body.endpoint_url,
        method: body.method,
        expected_status_codes: body.expected_status_codes,
        timeout_seconds: body.timeout_seconds,
        check_interval_seconds: body.check_interval_seconds,
        regions: body.regions,
        alert_threshold_ms: body.alert_threshold_ms,
        is_active: body.is_active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    ),

  updateDependency: (id: string, body: Partial<DependencyCreate>) =>
    withFallback(
      () =>
        request<Dependency>(`/dependencies/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }),
      () => ({
        ...(mockDependencies.find((d) => d.id === id) ?? mockDependencies[0]),
        ...body,
        method: body.method ?? 'GET',
        updated_at: new Date().toISOString(),
      }) as Dependency
    ),

  deleteDependency: (id: string) =>
    withFallback(
      () => request<void>(`/dependencies/${id}`, { method: 'DELETE' }),
      undefined as unknown as void
    ),

  evidence: () =>
    withFallback(() => request<EvidenceReport[]>('/evidence'), mockEvidence),

  evidenceById: (id: string) =>
    withFallback(
      () => request<EvidenceReport>(`/evidence/${id}`),
      () => mockEvidence.find((e) => e.id === id) ?? mockEvidence[0]
    ),

  regenerateEvidence: (id: string) =>
    withFallback(
      () => request<EvidenceReport>(`/evidence/${id}/regenerate`, { method: 'POST' }),
      () => mockEvidence.find((e) => e.id === id) ?? mockEvidence[0]
    ),

  alertConfigs: () =>
    withFallback(
      () => request<AlertConfig[]>('/notifications/configs'),
      mockAlertConfigs
    ),

  createAlertConfig: (body: { channel_type: string; config: Record<string, string>; is_active: boolean }) =>
    withFallback(
      () =>
        request<AlertConfig>('/notifications/configs', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      () => ({
        id: crypto.randomUUID(),
        org_id: IDS.org,
        channel_type: body.channel_type,
        is_active: body.is_active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    ),
};

export { ApiError, paginate };
