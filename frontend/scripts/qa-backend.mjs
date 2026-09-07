/**
 * QA fixture backend — DEVELOPMENT AND TEST ONLY.
 *
 * The console is gated on a real session and reads every number it renders
 * from `RELIASTRA_API_URL`. Without a backend the authenticated surface cannot
 * be rendered at all, and section 29 of the redesign brief requires judging
 * the rendered result rather than the source.
 *
 * So this serves the REAL API contracts (the ones in lib/dashboard/api.ts)
 * with fixture rows, on a separate port, started by hand. It is never
 * imported by the app, never bundled, and nothing in `src/` knows it exists.
 * Product code keeps its rule: if the API returns nothing, the UI says so.
 *
 *   node scripts/qa-backend.mjs [port]
 *   RELIASTRA_API_URL=http://127.0.0.1:8787 npm run dev
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 8787);
const now = Date.now();
const iso = (msAgo = 0) => new Date(now - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const ORG = {
  id: 'org_9f2c41',
  name: 'Northwind Systems',
  slug: 'northwind',
  plan: 'pro',
  has_agency_mode: false,
  ai_explanations_enabled: false,
  created_at: iso(190 * DAY),
  updated_at: iso(2 * DAY),
};

const USER = {
  id: 'usr_4471',
  email: 'ops@northwind.systems',
  full_name: 'Ada Okonkwo',
  is_active: true,
  is_superuser: false,
  avatar_url: null,
  created_at: iso(190 * DAY),
  updated_at: iso(2 * DAY),
};

const PLAN = {
  org_id: ORG.id,
  plan: 'pro',
  effective_plan: 'pro',
  is_trial_active: false,
  is_evaluation_active: false,
  evaluation_days_remaining: 0,
  max_dependencies: 50,
  max_team_members: 10,
  min_check_interval_seconds: 60,
  data_retention_days: 90,
  subscription_status: 'active',
  current_period_end: iso(-19 * DAY),
  price_usd: 39,
  billing_interval: 'monthly',
  // Shape must match `PaymentCurrencyInfo` exactly — a partial payload is how
  // the console ends up printing "undefined" where a currency belongs.
  payment: {
    product_currency: 'USD',
    payment_currency: 'NGN',
    payment_currency_name: 'Nigerian Naira (NGN)',
    payment_symbol: '\u20a6',
    differs_from_product_currency: true,
    notice:
      'RELIASTRA prices in USD and collects payment in NGN through Paystack. Your bank may apply its own conversion.',
    checkout_ready: true,
    plan_payment_amounts: {
      pro: { monthly: '\u20a660,000.00 (NGN)', annual: '\u20a6600,000.00 (NGN)' },
    },
    payment_provider: 'Paystack',
    payment_provider_display: 'Paystack secure hosted checkout',
    fx_reference: null,
  },
  next_charge_amount_minor: 6_000_000,
  next_charge_amount_display: '₦60,000.00 (NGN)',
};

const REGIONS = ['eu-west-1', 'us-east-1', 'ap-south-1'];

/**
 * Fixture dependencies. Deliberately mixed state, because the interface has
 * to be judged against degraded and unknown rows, not only healthy ones.
 */
const DEPS = [
  ['dep_stripe', 'Stripe Payments', 'https://api.stripe.com/v1/charges', 'operational', 99.98, 214, 1 * MIN, 1440],
  ['dep_auth0', 'Auth0 Tenant', 'https://northwind.eu.auth0.com/userinfo', 'degraded', 98.41, 1284, 2 * MIN, 1438],
  ['dep_s3', 'Object Storage', 'https://s3.eu-west-1.amazonaws.com', 'operational', 100, 88, 1 * MIN, 1440],
  ['dep_twilio', 'Twilio Messaging', 'https://api.twilio.com/2010-04-01', 'down', 91.07, 0, 40_000, 1201],
  ['dep_openai', 'Model API', 'https://api.openai.com/v1/models', 'operational', 99.76, 640, 3 * MIN, 1436],
  ['dep_pg', 'Managed Postgres', 'https://pg-eu-1.northwind.internal/health', 'operational', 99.99, 42, 1 * MIN, 1440],
  ['dep_cf', 'Cloudflare Edge', 'https://cdn.northwind.systems/healthz', 'operational', 99.95, 31, 2 * MIN, 1439],
  ['dep_sendgrid', 'Transactional Email', 'https://api.sendgrid.com/v3/scopes', 'unknown', null, 0, null, 0],
].map(([id, name, url, status, uptime, latency, lastCheckAgo, checks]) => ({
  id,
  name,
  endpoint_url: url,
  current_status: status,
  uptime_percentage_24h: uptime,
  avg_latency_ms_24h: latency,
  last_check_at: lastCheckAgo == null ? null : iso(lastCheckAgo),
  total_checks_24h: checks,
}));

const depFull = (d) => ({
  id: d.id,
  org_id: ORG.id,
  application_id: null,
  name: d.name,
  endpoint_url: d.endpoint_url,
  method: 'GET',
  headers: null,
  has_headers: false,
  expected_status_codes: [200],
  timeout_seconds: 10,
  check_interval_seconds: 60,
  next_check_at: iso(-45_000),
  regions: REGIONS,
  alert_threshold_ms: 2000,
  is_active: d.current_status !== 'unknown',
  created_at: iso(120 * DAY),
  updated_at: iso(3 * DAY),
});

const INCIDENTS = [
  {
    id: 'inc_7f31a9',
    display_id: 'INC-2481',
    org_id: ORG.id,
    dependency_id: 'dep_auth0',
    started_at: iso(52 * MIN),
    resolved_at: null,
    severity: 'major',
    status: 'open',
    root_cause: 'Token endpoint latency above threshold in eu-west-1 and us-east-1',
    description:
      'Auth0 /oauth/token responses exceeded the 2000 ms alert threshold in two of three observation regions. Quorum confirmed at 14:12:07 UTC.',
    evidence_report_id: 'ev_a1',
    created_at: iso(52 * MIN),
    updated_at: iso(4 * MIN),
    title: 'Auth0 token endpoint degradation',
    vendor: 'Auth0',
    region: 'eu-west-1',
    confidence: 'HIGH',
  },
  {
    id: 'inc_6b0244',
    display_id: 'INC-2480',
    org_id: ORG.id,
    dependency_id: 'dep_twilio',
    started_at: iso(11 * HOUR),
    resolved_at: null,
    severity: 'critical',
    status: 'investigating',
    root_cause: 'Connection refused from all observation regions',
    description:
      'api.twilio.com refused connections from all three regions. No successful observation since 03:41:12 UTC.',
    evidence_report_id: null,
    created_at: iso(11 * HOUR),
    updated_at: iso(20 * MIN),
    title: 'Twilio API unreachable',
    vendor: 'Twilio',
    region: 'all',
    confidence: 'HIGH',
  },
  {
    id: 'inc_5aa130',
    display_id: 'INC-2477',
    org_id: ORG.id,
    dependency_id: 'dep_openai',
    started_at: iso(3 * DAY),
    resolved_at: iso(3 * DAY - 2 * HOUR),
    severity: 'minor',
    status: 'resolved',
    root_cause: 'Elevated p95 latency on /v1/chat/completions',
    description: 'Latency returned to baseline without intervention.',
    evidence_report_id: 'ev_a2',
    created_at: iso(3 * DAY),
    updated_at: iso(3 * DAY - 2 * HOUR),
    title: 'Model API latency excursion',
    vendor: 'OpenAI',
    region: 'us-east-1',
    confidence: 'MEDIUM',
  },
  {
    id: 'inc_4cd881',
    display_id: 'INC-2469',
    org_id: ORG.id,
    dependency_id: 'dep_stripe',
    started_at: iso(9 * DAY),
    resolved_at: iso(9 * DAY - 41 * MIN),
    severity: 'major',
    status: 'resolved',
    root_cause: '5xx rate above threshold on /v1/charges',
    description: 'Confirmed in two regions; vendor status page acknowledged 26 minutes later.',
    evidence_report_id: 'ev_a3',
    created_at: iso(9 * DAY),
    updated_at: iso(9 * DAY - 41 * MIN),
    title: 'Stripe charge API errors',
    vendor: 'Stripe',
    region: 'eu-west-1',
    confidence: 'HIGH',
  },
];

const TIMELINES = {
  inc_7f31a9: [
    { id: 't1', type: 'detection', timestamp: iso(52 * MIN), description: 'First failed threshold in eu-west-1', metric: '2412 ms' },
    { id: 't2', type: 'vendor_spike', timestamp: iso(49 * MIN), description: 'us-east-1 crossed the same threshold', metric: '2288 ms' },
    { id: 't3', type: 'confirmation', timestamp: iso(48 * MIN), description: 'Quorum confirmed: 2 of 3 regions degraded', metric: '2/3' },
    { id: 't4', type: 'vendor_spike', timestamp: iso(21 * MIN), description: 'Peak observed latency', metric: '4106 ms' },
  ],
  inc_6b0244: [
    { id: 't1', type: 'detection', timestamp: iso(11 * HOUR), description: 'Connection refused in ap-south-1', metric: 'ECONNREFUSED' },
    { id: 't2', type: 'confirmation', timestamp: iso(11 * HOUR - 2 * MIN), description: 'Quorum confirmed: 3 of 3 regions failing', metric: '3/3' },
  ],
};

const CORRELATIONS = {
  inc_7f31a9: [
    {
      id: 'cor_1',
      incident_id: 'inc_7f31a9',
      correlated_dependency_id: 'dep_auth0',
      correlation_confidence: 0.94,
      time_window_seconds: 300,
      correlation_method: 'quorum_latency_overlap',
      created_at: iso(48 * MIN),
    },
  ],
};

const EVIDENCE = [
  {
    id: 'ev_a1', org_id: ORG.id, incident_id: 'inc_7f31a9', file_size_bytes: 184_320,
    checksum: 'sha256:4f1c9a6b2e8d70335ab1c9e4d2f77a10b6c3e59d84f0a1b7c2d3e4f5a6b7c8d9',
    generated_at: iso(40 * MIN), expires_at: null, created_at: iso(40 * MIN), updated_at: iso(40 * MIN),
    title: 'Auth0 token endpoint degradation', vendor: 'Auth0', confidence: 'HIGH', share_token: 'shr_a1',
  },
  {
    id: 'ev_a2', org_id: ORG.id, incident_id: 'inc_5aa130', file_size_bytes: 96_256,
    checksum: 'sha256:aa02f31e77c4d5b6e8901a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f',
    generated_at: iso(3 * DAY - 2 * HOUR), expires_at: null, created_at: iso(3 * DAY - 2 * HOUR), updated_at: iso(3 * DAY - 2 * HOUR),
    title: 'Model API latency excursion', vendor: 'OpenAI', confidence: 'MEDIUM', share_token: 'shr_a2',
  },
  {
    id: 'ev_a3', org_id: ORG.id, incident_id: 'inc_4cd881', file_size_bytes: 251_904,
    checksum: 'sha256:b71d004e2f5a6c8d9e0f1a2b3c4d5e6f70819a2b3c4d5e6f7a8b9c0d1e2f3a4b',
    generated_at: iso(9 * DAY - 40 * MIN), expires_at: null, created_at: iso(9 * DAY - 40 * MIN), updated_at: iso(9 * DAY - 40 * MIN),
    title: 'Stripe charge API errors', vendor: 'Stripe', confidence: 'HIGH', share_token: 'shr_a3',
  },
];

const VENDORS = [
  ['ven_stripe', 'stripe', 'Stripe', 'payments', 'operational', 99.99, 190],
  ['ven_cloudflare', 'cloudflare', 'Cloudflare', 'edge', 'operational', 100, 24],
  ['ven_auth0', 'auth0', 'Auth0', 'identity', 'degraded', 98.2, 1310],
  ['ven_openai', 'openai', 'OpenAI', 'model-apis', 'operational', 99.7, 702],
  ['ven_twilio', 'twilio', 'Twilio', 'messaging', 'down', 90.4, 0],
  ['ven_github', 'github', 'GitHub', 'developer', 'operational', 99.95, 143],
  // A dependency that has been registered but never observed. It exists to
  // prove the "insufficient data" path: the real API returns uptime 100.0 for
  // an empty window, and the UI must never print that as a measurement.
  ['ven_newrelic', 'newrelic', 'New Relic', 'observability', 'unknown', 0, 0],
].map(([id, vendor_name, display_name, category, recent_status, uptime, latency]) => ({
  id, vendor_name, display_name, category, is_public: true,
  last_check_at: vendor_name === 'newrelic' ? null : iso(2 * MIN),
  created_at: iso(300 * DAY), updated_at: iso(2 * MIN),
  recent_status, uptime_percentage_24h: uptime, avg_latency_ms: latency,
  endpoints: [{ id: `${id}_e1`, endpoint_url: `https://api.${vendor_name}.com`, regions: REGIONS, health_status: recent_status, is_active: true, last_check_at: iso(2 * MIN) }],
}));

/* ── Public vendor observatory (/v1/vendors/*) ──────────────────────────────
 * Mirrors app/modules/vendors/schemas.py and the evidence-gate public
 * incidents endpoint. Windows and resolutions match _WINDOW_HOURS /
 * _AUTO_RESOLUTION in the real service, because the public track page reads
 * both from the response rather than assuming them.
 */

const WINDOW_HOURS = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720, '90d': 2160 };
const AUTO_RESOLUTION = { '1h': 60, '6h': 60, '24h': 300, '7d': 900, '30d': 3600, '90d': 21600 };
const RESOLUTION_LABEL = { 60: '1m', 300: '5m', 900: '15m', 3600: '1h', 21600: '6h' };

const VENDOR_PROFILE = {
  stripe:     { base: 190,  jitter: 0.10, fail: 0,     incidentAt: null },
  cloudflare: { base: 24,   jitter: 0.18, fail: 0,     incidentAt: null },
  auth0:      { base: 1310, jitter: 0.22, fail: 0.02,  incidentAt: 0.28 },
  openai:     { base: 702,  jitter: 0.30, fail: 0.004, incidentAt: 0.62 },
  twilio:     { base: 0,    jitter: 0,    fail: 1,     incidentAt: 0.05 },
  newrelic:   { base: 0,    jitter: 0,    fail: 0,     incidentAt: null, empty: true },
  github:     { base: 143,  jitter: 0.12, fail: 0,     incidentAt: null },
};

const REGION_OFFSET = { 'eu-west-1': 1, 'us-east-1': 1.08, 'ap-south-1': 1.19 };

const VENDOR_INCIDENTS = {
  auth0: [
    {
      incident_id: 'inc_7f31a9', vendor_name: 'auth0',
      title: 'Token endpoint latency above threshold',
      started_at: iso(61 * MIN), resolved_at: null, duration_minutes: null,
      severity: 'major', status: 'open', max_latency_ms: 4106,
      downtime_percentage: 0, has_evidence_report: true, download_token: 'gate_auth0_7f31a9',
    },
    {
      incident_id: 'inc_31b0c2', vendor_name: 'auth0',
      title: 'Elevated error responses in eu-west-1',
      started_at: iso(9 * DAY), resolved_at: iso(9 * DAY - 22 * MIN), duration_minutes: 22,
      severity: 'minor', status: 'resolved', max_latency_ms: 2210,
      downtime_percentage: 1.4, has_evidence_report: false, download_token: null,
    },
  ],
  twilio: [
    {
      incident_id: 'inc_9c2f10', vendor_name: 'twilio',
      title: 'API unreachable from all observation regions',
      started_at: iso(11 * HOUR + 9 * MIN), resolved_at: null, duration_minutes: null,
      severity: 'critical', status: 'open', max_latency_ms: null,
      downtime_percentage: 100, has_evidence_report: false, download_token: null,
    },
  ],
  openai: [
    {
      incident_id: 'inc_5aa130', vendor_name: 'openai',
      title: 'Model API latency excursion',
      started_at: iso(3 * DAY), resolved_at: iso(3 * DAY - 2 * HOUR), duration_minutes: 120,
      severity: 'minor', status: 'resolved', max_latency_ms: 5210,
      downtime_percentage: 0, has_evidence_report: true, download_token: 'gate_openai_5aa130',
    },
  ],
  stripe: [
    {
      incident_id: 'inc_4cd881', vendor_name: 'stripe',
      title: 'Charge API error responses',
      started_at: iso(9 * DAY), resolved_at: iso(9 * DAY - 41 * MIN), duration_minutes: 41,
      severity: 'major', status: 'resolved', max_latency_ms: 3320,
      downtime_percentage: 2.6, has_evidence_report: true, download_token: 'gate_stripe_4cd881',
    },
  ],
};

function vendorByName(name) {
  const key = String(name || '').toLowerCase();
  return VENDORS.find((v) => v.vendor_name === key);
}

function vendorStats(vendorName, hours) {
  const p = VENDOR_PROFILE[vendorName] ?? { base: 200, jitter: 0.1, fail: 0 };
  // Mirrors get_endpoint_stats: an empty window reports 100% uptime and a
  // zero average, which is exactly the shape the UI has to refuse to print.
  if (p.empty) return { total_observations: 0, uptime_percentage: 100.0, avg_latency_ms: 0, p95_latency_ms: null };
  const total = Math.round((hours * 60) / 5) * REGIONS.length;
  const uptime = p.fail === 1 ? 0 : Math.max(90, 100 - p.fail * 100 - (hours > 168 ? 0.12 : 0.04));
  return {
    total_observations: total,
    uptime_percentage: Number(uptime.toFixed(2)),
    avg_latency_ms: p.base,
    p95_latency_ms: p.base ? Math.round(p.base * (1 + p.jitter * 3)) : null,
  };
}

function timelinePoints(vendorName, window, region) {
  const p = VENDOR_PROFILE[vendorName] ?? { base: 200, jitter: 0.1, fail: 0, incidentAt: null };
  if (p.empty) return [];
  const hours = WINDOW_HOURS[window] ?? 24;
  const step = AUTO_RESOLUTION[window] ?? 300;
  const count = Math.min(360, Math.round((hours * 3600) / step));
  const regionScale = REGION_OFFSET[region] ?? 1;
  const incidents = VENDOR_INCIDENTS[vendorName] ?? [];
  const points = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(Date.now() - i * step * 1000);
    const phase = (count - i) / count;
    const wobble =
      Math.sin(i / 5.3) * p.base * p.jitter + Math.cos(i / 11.7) * p.base * p.jitter * 0.5;
    const inIncident = p.incidentAt != null && phase > p.incidentAt && phase < p.incidentAt + 0.12;
    const down = p.fail === 1 || (inIncident && vendorName === 'twilio');
    const latency = down ? 0 : Math.max(6, Math.round((p.base + wobble) * regionScale * (inIncident ? 2.7 : 1)));
    points.push({
      timestamp: t.toISOString(),
      avg_latency_ms: latency,
      status_code: down ? null : 200,
      is_up: !down,
      observation_count: Math.max(1, Math.round(step / 60)),
      incident_id: inIncident && incidents[0] ? incidents[0].incident_id : null,
    });
  }
  return points;
}

function vendorDetail(v) {
  return {
    id: v.id, vendor_name: v.vendor_name, display_name: v.display_name,
    category: v.category, is_public: true, last_check_at: v.last_check_at,
    created_at: v.created_at, updated_at: v.updated_at,
    recent_status: v.recent_status, endpoints: v.endpoints,
  };
}

function vendorCurrent(v, region) {
  const p = VENDOR_PROFILE[v.vendor_name] ?? { base: 200, fail: 0 };
  if (p.empty) return { timestamp: null, latency_ms: null, status_code: null, is_up: null };
  const down = p.fail === 1;
  return {
    timestamp: v.last_check_at,
    latency_ms: down ? null : Math.round(p.base * (REGION_OFFSET[region] ?? 1)),
    status_code: down ? null : 200,
    is_up: !down,
  };
}

function latencySeries(hours = 24, base = 200, spikeAt = null) {
  const points = [];
  for (let i = hours * 4; i >= 0; i--) {
    const t = iso(i * 15 * MIN);
    const wobble = Math.sin(i / 3.1) * base * 0.12 + Math.cos(i / 7.7) * base * 0.06;
    let v = Math.max(8, Math.round(base + wobble));
    if (spikeAt != null && i <= spikeAt + 4 && i >= spikeAt - 4) v = Math.round(v * 3.4);
    points.push({ t, v });
  }
  return points;
}

function checkResults(depId, status) {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const region = REGIONS[i % 3];
    const failing = status === 'down' || (status === 'degraded' && i % 3 === 1);
    rows.push({
      id: `${depId}_chk_${i}`,
      dependency_id: depId,
      org_id: ORG.id,
      region,
      executed_at: iso(i * 90_000),
      latency_ms: failing ? (status === 'down' ? 0 : 2400 + (i % 7) * 130) : 90 + (i % 11) * 17,
      status_code: status === 'down' ? null : failing ? 200 : 200,
      is_up: status === 'down' ? false : !failing || status === 'degraded',
      error_message: status === 'down' ? 'ECONNREFUSED' : null,
      quorum_confirmed: failing,
    });
  }
  return rows;
}

const PRICING = {
  plans: [
    { plan: 'free', display_name: 'Free', description: 'Observation for a small stack.', tag: null, price_usd: 0, price_annual_usd: 0, max_dependencies: 3, max_team_members: 1, min_check_interval_seconds: 300, data_retention_days: 7, features: {}, billing_availability: 'self_serve', is_enterprise: false, is_custom_pricing: false, product_price_display: '$0.00 (USD)' },
    { plan: 'pro', display_name: 'Pro', description: 'Evidence for a production stack.', tag: 'Current', price_usd: 39, price_annual_usd: 390, max_dependencies: 50, max_team_members: 10, min_check_interval_seconds: 60, data_retention_days: 90, features: {}, billing_availability: 'self_serve', is_enterprise: false, is_custom_pricing: false, product_price_display: '$39.00 (USD)', payment_amount_display: '₦60,000.00 (NGN)' },
    { plan: 'enterprise', display_name: 'Enterprise', description: 'Agency and multi-client operations.', tag: null, price_usd: 0, price_annual_usd: null, max_dependencies: null, max_team_members: null, min_check_interval_seconds: 30, data_retention_days: 365, features: {}, billing_availability: 'sales', is_enterprise: true, is_custom_pricing: true },
  ],
  payment: PLAN.payment,
};

const routes = [
  ['POST', /^\/v1\/auth\/refresh$/, () => ({ access_token: 'qa-access-token', refresh_token: 'qa-refresh-token', token_type: 'bearer', expires_in: 3600 })],
  ['GET', /^\/v1\/orgs$/, () => [ORG]],
  ['GET', /^\/v1\/orgs\/current$/, () => ORG],
  ['PATCH', /^\/v1\/orgs\/current$/, () => ORG],
  ['GET', /^\/v1\/users\/me$/, () => USER],
  ['GET', /^\/v1\/billing\/plan$/, () => PLAN],
  ['GET', /^\/v1\/pricing$/, () => PRICING],
  ['GET', /^\/v1\/billing\/transactions$/, () => ({
    items: [
      { id: 'txn_1', reference: 'psk_4412ff', provider: 'paystack', plan: 'pro', display_plan: 'Pro', billing_interval: 'monthly', status: 'success', product_currency: 'USD', product_amount_minor: 3900, product_price_display: '$39.00 (USD)', charged_currency: 'NGN', charged_amount_minor: 6_000_000, charged_amount_display: '₦60,000.00 (NGN)', paid_at: iso(11 * DAY), period_start: iso(11 * DAY), period_end: iso(-19 * DAY), created_at: iso(11 * DAY) },
      { id: 'txn_2', reference: 'psk_39a1b0', provider: 'paystack', plan: 'pro', display_plan: 'Pro', billing_interval: 'monthly', status: 'success', product_currency: 'USD', product_amount_minor: 3900, product_price_display: '$39.00 (USD)', charged_currency: 'NGN', charged_amount_minor: 6_000_000, charged_amount_display: '₦60,000.00 (NGN)', paid_at: iso(41 * DAY), period_start: iso(41 * DAY), period_end: iso(11 * DAY), created_at: iso(41 * DAY) },
    ],
    payment: PLAN.payment,
  })],
  ['GET', /^\/v1\/dashboard\/summary$/, () => ({
    active_dependencies_count: DEPS.filter((d) => d.current_status !== 'unknown').length,
    open_incidents_count: INCIDENTS.filter((i) => !i.resolved_at).length,
    overall_uptime_percentage: 99.12,
    alerts_today_count: 4,
  })],
  ['GET', /^\/v1\/dashboard\/dependency-health$/, () => DEPS.map((d) => ({
    dependency_id: d.id, name: d.name, endpoint_url: d.endpoint_url,
    current_status: d.current_status, uptime_percentage_24h: d.uptime_percentage_24h,
    avg_latency_ms_24h: d.avg_latency_ms_24h, last_check_at: d.last_check_at,
    total_checks_24h: d.total_checks_24h,
  }))],
  ['GET', /^\/v1\/dashboard\/vendor-status$/, () => VENDORS],
  ['GET', /^\/v1\/dashboard\/latency/, (m, url) => {
    const depId = url.searchParams.get('dependency_id');
    const dep = DEPS.find((d) => d.id === depId);
    return { points: latencySeries(24, dep?.avg_latency_ms_24h || 200, dep?.current_status === 'degraded' ? 6 : null) };
  }],
  ['GET', /^\/v1\/incidents$/, (m, url) => {
    const status = url.searchParams.get('status');
    const limit = Number(url.searchParams.get('limit') ?? 50);
    let rows = INCIDENTS;
    if (status === 'open') rows = rows.filter((i) => !i.resolved_at);
    if (status === 'resolved') rows = rows.filter((i) => i.resolved_at);
    return rows.slice(0, limit);
  }],
  ['GET', /^\/v1\/incidents\/([^/]+)\/evidence$/, (m) => {
    const inc = INCIDENTS.find((i) => i.id === m[1]);
    const ev = EVIDENCE.find((e) => e.id === inc?.evidence_report_id);
    return ev ?? { __status: 404 };
  }],
  ['GET', /^\/v1\/incidents\/([^/]+)$/, (m) => {
    const inc = INCIDENTS.find((i) => i.id === m[1]);
    if (!inc) return { __status: 404 };
    const dep = DEPS.find((d) => d.id === inc.dependency_id);
    return {
      ...inc,
      correlations: CORRELATIONS[inc.id] ?? [],
      timeline: TIMELINES[inc.id] ?? [],
      impact: {
        your_service: latencySeries(6, 180, inc.resolved_at ? null : 5),
        vendor: latencySeries(6, dep?.avg_latency_ms_24h || 300, inc.resolved_at ? null : 5),
      },
      other_dependencies: DEPS.filter((d) => d.id !== inc.dependency_id).slice(0, 4)
        .map((d) => ({ name: d.name, status: d.current_status, latency_ms: d.avg_latency_ms_24h })),
    };
  }],
  ['GET', /^\/v1\/dependencies$/, () => DEPS.map(depFull)],
  ['GET', /^\/v1\/dependencies\/([^/]+)\/history$/, (m) => {
    const d = DEPS.find((x) => x.id === m[1]);
    if (!d) return { __status: 404 };
    return {
      dependency_id: d.id,
      uptime_percentage: d.uptime_percentage_24h ?? 0,
      avg_latency_ms: d.avg_latency_ms_24h,
      total_checks: d.total_checks_24h ?? 0,
      total_up: Math.round((d.total_checks_24h ?? 0) * ((d.uptime_percentage_24h ?? 0) / 100)),
      total_down: Math.round((d.total_checks_24h ?? 0) * (1 - (d.uptime_percentage_24h ?? 0) / 100)),
    };
  }],
  ['GET', /^\/v1\/dependencies\/([^/]+)\/results$/, (m) => {
    const d = DEPS.find((x) => x.id === m[1]);
    return d ? checkResults(d.id, d.current_status) : { __status: 404 };
  }],
  ['GET', /^\/v1\/dependencies\/([^/]+)$/, (m) => {
    const d = DEPS.find((x) => x.id === m[1]);
    return d ? depFull(d) : { __status: 404 };
  }],
  ['GET', /^\/v1\/evidence$/, () => EVIDENCE],
  ['GET', /^\/v1\/evidence\/([^/]+)$/, (m) => EVIDENCE.find((e) => e.id === m[1]) ?? { __status: 404 }],
  ['GET', /^\/v1\/notifications\/configs$/, () => [
    { id: 'alc_1', org_id: ORG.id, channel_type: 'email', is_active: true, created_at: iso(80 * DAY), updated_at: iso(80 * DAY) },
    { id: 'alc_2', org_id: ORG.id, channel_type: 'slack', is_active: true, created_at: iso(40 * DAY), updated_at: iso(40 * DAY) },
  ]],
  ['GET', /^\/v1\/notifications\/inbox\/unread-count$/, () => ({ unread: 2 })],
  ['GET', /^\/v1\/notifications\/inbox/, () => ({
    items: [
      { id: 'n1', event: 'incident.opened', title: 'Auth0 token endpoint degradation', body: 'Quorum confirmed in 2 of 3 regions.', action_url: '/incidents/inc_7f31a9', action_label: 'View incident', priority: 'urgent', is_read: false, created_at: iso(48 * MIN) },
      { id: 'n2', event: 'evidence.ready', title: 'Evidence record generated', body: 'INC-2481 evidence is ready to export.', action_url: '/evidence', action_label: 'Open evidence', priority: 'high', is_read: false, created_at: iso(40 * MIN) },
      { id: 'n3', event: 'incident.resolved', title: 'Model API latency excursion resolved', body: 'Latency returned to baseline.', action_url: '/incidents/inc_5aa130', action_label: 'View incident', priority: 'normal', is_read: true, created_at: iso(3 * DAY) },
    ],
    page: 1, page_size: 20, total: 3, unread: 2,
  })],
  ['POST', /^\/v1\/notifications\/inbox\/read$/, () => ({ unread: 0 })],
  ['GET', /^\/v1\/api-keys$/, () => [
    { id: 'key_1', org_id: ORG.id, name: 'CI export', prefix: 'rsk_7f2a', scopes: ['evidence:read'], last_used_at: iso(2 * DAY), expires_at: null, created_at: iso(60 * DAY) },
  ]],
  // ── Public vendor observatory ─────────────────────────────────────────
  ['GET', /^\/v1\/vendors$/, (m, url) => {
    const limit = Number(url.searchParams.get('limit') || 50);
    return {
      items: VENDORS.slice(0, limit).map(vendorDetail),
      next_cursor: null,
      has_more: false,
    };
  }],
  ['GET', /^\/v1\/vendors\/([^/]+)\/developer$/, (m) => {
    const v = vendorByName(m[1]);
    if (!v) return { __status: 404 };
    const s24 = vendorStats(v.vendor_name, 24);
    return {
      vendor: vendorDetail(v),
      current_status: vendorCurrent(v, 'us-east-1'),
      metrics_24h: { vendor_name: v.vendor_name, metrics: { '24h': { window: '24h', ...s24 } } },
      recent_incidents: (VENDOR_INCIDENTS[v.vendor_name] ?? []).map((i) => ({
        incident_id: i.incident_id, dependency_name: v.display_name,
        started_at: i.started_at, resolved_at: i.resolved_at,
        severity: i.severity, status: i.status,
        duration_seconds: i.duration_minutes != null ? i.duration_minutes * 60 : null,
      })),
      uptime_7d: vendorStats(v.vendor_name, 168).uptime_percentage,
      uptime_30d: vendorStats(v.vendor_name, 720).uptime_percentage,
      avg_latency_24h: s24.avg_latency_ms,
      p95_latency_24h: s24.p95_latency_ms,
      endpoints: v.endpoints,
      api_docs_url: 'https://docs.reliastra.com/public-api',
      powered_by: { name: 'Reliastra', url: 'https://reliastra.com', message: 'Monitor YOUR vendors at reliastra.com' },
    };
  }],
  ['GET', /^\/v1\/vendors\/([^/]+)\/timeline$/, (m, url) => {
    const v = vendorByName(m[1]);
    if (!v) return { __status: 404 };
    const window = url.searchParams.get('window') || '24h';
    if (!WINDOW_HOURS[window]) return { __status: 422 };
    const region = url.searchParams.get('region') || 'us-east-1';
    const points = timelinePoints(v.vendor_name, window, region);
    return {
      vendor_name: v.vendor_name,
      window,
      resolution: RESOLUTION_LABEL[AUTO_RESOLUTION[window]] ?? 'auto',
      region,
      from:
        points[0]?.timestamp ??
        new Date(Date.now() - WINDOW_HOURS[window] * 3600 * 1000).toISOString(),
      to: new Date().toISOString(),
      current: vendorCurrent(v, region),
      points,
    };
  }],
  ['GET', /^\/v1\/vendors\/([^/]+)\/metrics$/, (m, url) => {
    const v = vendorByName(m[1]);
    if (!v) return { __status: 404 };
    const only = url.searchParams.get('window');
    const labels = only ? [only] : Object.keys(WINDOW_HOURS);
    const metrics = {};
    for (const label of labels) metrics[label] = { window: label, ...vendorStats(v.vendor_name, WINDOW_HOURS[label]) };
    return { vendor_name: v.vendor_name, metrics };
  }],
  ['GET', /^\/v1\/vendors\/([^/]+)\/incidents\/public$/, (m) => {
    const v = vendorByName(m[1]);
    if (!v) return { __status: 404 };
    return VENDOR_INCIDENTS[v.vendor_name] ?? [];
  }],
  ['GET', /^\/v1\/vendors\/([^/]+)\/incidents$/, (m) => {
    const v = vendorByName(m[1]);
    if (!v) return { __status: 404 };
    return {
      vendor_name: v.vendor_name,
      incidents: (VENDOR_INCIDENTS[v.vendor_name] ?? []).map((i) => ({
        incident_id: i.incident_id, dependency_name: v.display_name,
        started_at: i.started_at, resolved_at: i.resolved_at,
        severity: i.severity, status: i.status,
        duration_seconds: i.duration_minutes != null ? i.duration_minutes * 60 : null,
      })),
    };
  }],
  ['GET', /^\/v1\/vendors\/([^/]+)$/, (m) => {
    const v = vendorByName(m[1]);
    return v ? vendorDetail(v) : { __status: 404 };
  }],
  // Public evidence gate. The real endpoint records the requester and returns
  // a signed, expiring token - never a direct file link - so the fixture
  // mirrors that shape exactly.
  ['POST', /^\/v1\/evidence\/gate$/, () => ({
    download_url: 'http://127.0.0.1:8787/v1/evidence/rep_qa_token/download',
    report_id: 'rep_qa',
    report_token: 'rep_qa_token',
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    account_created: true,
    login_url: '/login',
    message: 'Evidence report ready.',
  })],
  ['GET', /^\/v1\/evidence\/([^/]+)\/download$/, (m) => ({
    report_token: m[1],
    format: 'pdf',
    note: 'QA fixture: the real endpoint streams a signed PDF.',
  })],
  ['GET', /^\/v1\/clients$/, () => []],
  ['GET', /^\/v1\/agency\/portfolio$/, () => ({ __status: 404 })],
  ['GET', /^\/v1\/partners\/support\/tickets$/, () => ({ items: [], page: 1, page_size: 50, total: 0 })],
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  for (const [method, pattern, handler] of routes) {
    if (req.method !== method) continue;
    const m = url.pathname.match(pattern);
    if (!m) continue;
    const body = handler(m, url);
    const status = body && body.__status ? body.__status : 200;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(status === 200 ? body : { error: { code: 'NOT_FOUND', message: 'Not found' } }));
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: `No fixture for ${req.method} ${url.pathname}` } }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`QA fixture backend on http://127.0.0.1:${PORT} (development only)`);
});
