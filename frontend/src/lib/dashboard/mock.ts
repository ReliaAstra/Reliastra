import type {
  AlertConfig,
  CheckResult,
  DashboardSummary,
  Dependency,
  DependencyHealth,
  DependencyHistory,
  EvidenceReport,
  Incident,
  IncidentDetail,
  Invoice,
  Organization,
  PaymentMethod,
  PlanDetails,
  PricingPlan,
  UserMe,
  VendorStatus,
} from './types';
import { PLANS } from './plans';

const now = Date.now();
const minutes = (m: number) => new Date(now - m * 60_000).toISOString();
const hours = (h: number) => new Date(now - h * 3_600_000).toISOString();
const days = (d: number) => new Date(now - d * 86_400_000).toISOString();

export const IDS = {
  org: '11111111-1111-4111-8111-111111111111',
  user: '22222222-2222-4222-8222-222222222222',
  stripe: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  twilio: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  incidentOpen: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb842',
  incidentResolved: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb801',
  evidence1: 'cccccccc-cccc-4ccc-8ccc-ccccccccc001',
  evidence2: 'cccccccc-cccc-4ccc-8ccc-ccccccccc002',
};

export const mockUser: UserMe = {
  id: IDS.user,
  email: 'ada@acme.dev',
  full_name: 'Ada Okonkwo',
  is_active: true,
  is_superuser: false,
  avatar_url: null,
  created_at: days(3),
  updated_at: hours(2),
};

export const mockOrg: Organization = {
  id: IDS.org,
  name: 'Acme',
  slug: 'acme',
  plan: 'free',
  has_agency_mode: false,
  ai_explanations_enabled: true,
  created_at: days(3),
  updated_at: hours(2),
};

export const mockPlan: PlanDetails = {
  org_id: IDS.org,
  plan: 'free',
  max_dependencies: 3,
  min_check_interval_seconds: 60,
  subscription_status: 'active',
  current_period_end: new Date(now + 20 * 86_400_000).toISOString(),
  price_usd: 0,
};

export const mockPricing: { plans: PricingPlan[] } = {
  plans: PLANS.map((p) => ({
    plan: p.id,
    display_name: p.name,
    description: p.tagline,
    tag:
      p.id === 'standard'
        ? 'most_popular'
        : p.id === 'agency'
          ? 'built_for_agencies'
          : null,
    price_usd: p.priceMonthly,
    max_dependencies: p.dependencies,
    min_check_interval_seconds:
      p.id === 'free' || p.id === 'starter' ? 60 : p.id === 'standard' ? 15 : 5,
    data_retention_days:
      p.id === 'free' ? 1 : p.id === 'starter' ? 7 : p.id === 'standard' ? 30 : 90,
    features: {},
  })),
};

export const mockSummary: DashboardSummary = {
  active_dependencies_count: 2,
  open_incidents_count: 1,
  overall_uptime_percentage: 99.97,
  alerts_today_count: 3,
};

export const mockHealth: DependencyHealth[] = [
  {
    dependency_id: IDS.stripe,
    name: 'Stripe API',
    endpoint_url: 'https://api.stripe.com/v1/charges',
    current_status: 'operational',
    uptime_percentage_24h: 99.99,
    avg_latency_ms_24h: 142,
    last_check_at: minutes(1),
  },
  {
    dependency_id: IDS.twilio,
    name: 'Twilio Messaging',
    endpoint_url: 'https://api.twilio.com/2010-04-01/Accounts.json',
    current_status: 'degraded',
    uptime_percentage_24h: 98.41,
    avg_latency_ms_24h: 890,
    last_check_at: minutes(2),
  },
];

export const mockDependencies: Dependency[] = [
  {
    id: IDS.stripe,
    org_id: IDS.org,
    application_id: null,
    name: 'Stripe API',
    endpoint_url: 'https://api.stripe.com/v1/charges',
    method: 'GET',
    headers: null,
    has_headers: true,
    expected_status_codes: [200],
    timeout_seconds: 10,
    check_interval_seconds: 60,
    next_check_at: minutes(-1),
    regions: ['us-east', 'eu-west', 'ap-south'],
    alert_threshold_ms: 500,
    is_active: true,
    created_at: days(3),
    updated_at: hours(1),
  },
  {
    id: IDS.twilio,
    org_id: IDS.org,
    application_id: null,
    name: 'Twilio Messaging',
    endpoint_url: 'https://api.twilio.com/2010-04-01/Accounts.json',
    method: 'GET',
    headers: null,
    has_headers: true,
    expected_status_codes: [200],
    timeout_seconds: 15,
    check_interval_seconds: 60,
    next_check_at: minutes(-1),
    regions: ['us-east', 'us-west', 'eu-west'],
    alert_threshold_ms: 800,
    is_active: true,
    created_at: days(2),
    updated_at: minutes(30),
  },
];

function series(points: number, base: number, spikeAt?: number) {
  return Array.from({ length: points }, (_, i) => ({
    t: new Date(now - (points - i) * 5 * 60_000).toISOString(),
    v: Math.round(
      base +
        Math.sin(i / 3) * (base * 0.12) +
        (spikeAt != null && i >= spikeAt && i <= spikeAt + 4 ? base * 2.4 : 0)
    ),
  }));
}

export const mockIncidents: Incident[] = [
  {
    id: IDS.incidentOpen,
    org_id: IDS.org,
    dependency_id: IDS.twilio,
    started_at: minutes(23),
    resolved_at: null,
    severity: 'critical',
    status: 'open',
    root_cause: 'vendor',
    description: 'Elevated error rate on Twilio Messaging API across US East and EU West.',
    evidence_report_id: null,
    created_at: minutes(23),
    updated_at: minutes(4),
    display_id: 'INC-1842',
    title: 'Twilio Messaging elevated error rate',
    vendor: 'Twilio',
    region: 'US East',
    confidence: 'HIGH',
  },
  {
    id: IDS.incidentResolved,
    org_id: IDS.org,
    dependency_id: IDS.stripe,
    started_at: hours(18),
    resolved_at: hours(17),
    severity: 'minor',
    status: 'resolved',
    root_cause: 'vendor',
    description: 'Brief latency spike on Stripe charges endpoint.',
    evidence_report_id: IDS.evidence1,
    created_at: hours(18),
    updated_at: hours(17),
    display_id: 'INC-1801',
    title: 'Stripe charges latency spike',
    vendor: 'Stripe',
    region: 'EU West',
    confidence: 'MEDIUM',
  },
];

export const mockIncidentDetail: IncidentDetail = {
  ...mockIncidents[0],
  correlations: [
    {
      id: 'corr-1',
      incident_id: IDS.incidentOpen,
      correlated_dependency_id: IDS.twilio,
      correlation_confidence: 0.94,
      time_window_seconds: 180,
      correlation_method: 'temporal',
      created_at: minutes(20),
    },
  ],
  timeline: [
    {
      id: 't1',
      type: 'detection',
      timestamp: minutes(23),
      description: 'Error rate on Twilio Messaging crossed 5% in US East.',
      metric: '5.4%',
    },
    {
      id: 't2',
      type: 'vendor_spike',
      timestamp: minutes(21),
      description: 'Vendor latency p95 rose from 210ms to 1,240ms.',
      metric: '1240ms',
    },
    {
      id: 't3',
      type: 'confirmation',
      timestamp: minutes(18),
      description: 'Quorum confirmed from EU West and US East independent checks.',
    },
    {
      id: 't4',
      type: 'detection',
      timestamp: minutes(12),
      description: 'Customer checkout retries increased 3.1x versus baseline.',
      metric: '3.1x',
    },
  ],
  impact: {
    your_service: series(24, 180, 16),
    vendor: series(24, 220, 15),
  },
  other_dependencies: [
    { name: 'Stripe API', status: 'operational', latency_ms: 142 },
  ],
};

export const mockIncidentResolvedDetail: IncidentDetail = {
  ...mockIncidents[1],
  correlations: [],
  timeline: [
    {
      id: 'r1',
      type: 'detection',
      timestamp: hours(18),
      description: 'Stripe p95 latency exceeded 500ms in EU West.',
    },
    {
      id: 'r2',
      type: 'confirmation',
      timestamp: hours(18),
      description: 'Independent regional checks confirmed the spike.',
    },
    {
      id: 'r3',
      type: 'resolution',
      timestamp: hours(17),
      description: 'Latency returned to baseline. Incident marked resolved.',
    },
  ],
  impact: {
    your_service: series(24, 90, 10),
    vendor: series(24, 110, 9),
  },
  other_dependencies: [
    { name: 'Twilio Messaging', status: 'operational', latency_ms: 240 },
  ],
};

export const mockVendors: VendorStatus[] = [
  {
    id: 'v-stripe',
    vendor_name: 'stripe',
    display_name: 'Stripe',
    category: 'payments',
    is_public: true,
    last_check_at: minutes(1),
    created_at: days(30),
    updated_at: minutes(1),
    recent_status: 'operational',
    endpoints: [],
    uptime_percentage_24h: 99.99,
    avg_latency_ms: 142,
  },
  {
    id: 'v-twilio',
    vendor_name: 'twilio',
    display_name: 'Twilio',
    category: 'communications',
    is_public: true,
    last_check_at: minutes(2),
    created_at: days(30),
    updated_at: minutes(2),
    recent_status: 'degraded',
    endpoints: [],
    uptime_percentage_24h: 98.41,
    avg_latency_ms: 890,
  },
  {
    id: 'v-aws',
    vendor_name: 'aws',
    display_name: 'AWS S3',
    category: 'storage',
    is_public: true,
    last_check_at: minutes(1),
    created_at: days(30),
    updated_at: minutes(1),
    recent_status: 'operational',
    endpoints: [],
    uptime_percentage_24h: 100,
    avg_latency_ms: 48,
  },
  {
    id: 'v-cf',
    vendor_name: 'cloudflare',
    display_name: 'Cloudflare',
    category: 'edge',
    is_public: true,
    last_check_at: minutes(1),
    created_at: days(30),
    updated_at: minutes(1),
    recent_status: 'operational',
    endpoints: [],
    uptime_percentage_24h: 100,
    avg_latency_ms: 22,
  },
  {
    id: 'v-gh',
    vendor_name: 'github',
    display_name: 'GitHub',
    category: 'scm',
    is_public: true,
    last_check_at: minutes(3),
    created_at: days(30),
    updated_at: minutes(3),
    recent_status: 'operational',
    endpoints: [],
    uptime_percentage_24h: 99.95,
    avg_latency_ms: 118,
  },
  {
    id: 'v-dd',
    vendor_name: 'datadog',
    display_name: 'Datadog',
    category: 'observability',
    is_public: true,
    last_check_at: minutes(2),
    created_at: days(30),
    updated_at: minutes(2),
    recent_status: 'unknown',
    endpoints: [],
    uptime_percentage_24h: 99.9,
    avg_latency_ms: 210,
  },
];

export const mockEvidence: EvidenceReport[] = [
  {
    id: IDS.evidence1,
    org_id: IDS.org,
    incident_id: IDS.incidentResolved,
    file_size_bytes: 248320,
    checksum: 'sha256:9f2a',
    generated_at: hours(16),
    expires_at: days(-14),
    created_at: hours(16),
    updated_at: hours(16),
    title: 'Stripe charges latency spike',
    vendor: 'Stripe',
    confidence: 'MEDIUM',
    credit_amount: 0,
    share_token: 'rpt-1801',
  },
  {
    id: IDS.evidence2,
    org_id: IDS.org,
    incident_id: IDS.incidentOpen,
    file_size_bytes: 312440,
    checksum: 'sha256:1c8e',
    generated_at: minutes(8),
    expires_at: days(-20),
    created_at: minutes(8),
    updated_at: minutes(8),
    title: 'Twilio Messaging elevated error rate',
    vendor: 'Twilio',
    confidence: 'HIGH',
    credit_amount: 420,
    share_token: 'rpt-1842',
  },
];

export function mockHistory(depId: string): DependencyHistory {
  if (depId === IDS.twilio) {
    return {
      dependency_id: depId,
      uptime_percentage: 98.41,
      avg_latency_ms: 890,
      total_checks: 1440,
      total_up: 1417,
      total_down: 23,
    };
  }
  return {
    dependency_id: depId,
    uptime_percentage: 99.99,
    avg_latency_ms: 142,
    total_checks: 1440,
    total_up: 1439,
    total_down: 1,
  };
}

export function mockResults(depId: string): CheckResult[] {
  const regions = ['us-east', 'eu-west', 'ap-south'];
  return Array.from({ length: 12 }, (_, i) => {
    const degraded = depId === IDS.twilio && i < 4;
    return {
      id: `chk-${depId.slice(0, 4)}-${i}`,
      dependency_id: depId,
      org_id: IDS.org,
      region: regions[i % regions.length],
      executed_at: minutes(i * 2),
      latency_ms: degraded ? 820 + i * 40 : 120 + (i % 5) * 8,
      status_code: degraded && i === 0 ? 503 : 200,
      is_up: !(degraded && i === 0),
      error_message: degraded && i === 0 ? 'HTTP 503' : null,
      quorum_confirmed: !(degraded && i === 0),
    };
  });
}

export function mockLatency(depId?: string) {
  const base = depId === IDS.twilio ? 400 : 140;
  return Array.from({ length: 48 }, (_, i) => ({
    timestamp: new Date(now - (48 - i) * 30 * 60_000).toISOString(),
    region: 'us-east',
    latency_ms: Math.round(base + Math.sin(i / 4) * 30 + (i > 40 && depId === IDS.twilio ? 400 : 0)),
    dependency_id: depId ?? IDS.stripe,
  }));
}

export const mockAlertConfigs: AlertConfig[] = [
  {
    id: 'cfg-email',
    org_id: IDS.org,
    channel_type: 'email',
    is_active: true,
    created_at: days(3),
    updated_at: days(3),
  },
];

export const mockInvoices: Invoice[] = [];

export const mockPayment: PaymentMethod | null = null;


export function paginate<T>(data: T[]) {
  return {
    data,
    items: data,
    pagination: { next_cursor: null, has_more: false, limit: data.length },
    next_cursor: null,
    has_more: false,
  };
}
