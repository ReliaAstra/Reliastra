/**
 * Single source of truth for frontend routes.
 *
 * Every internal `href` in the app should be built from this module. The
 * concrete failure this prevents: the footer hard-coded `/research` and three
 * article slugs while no such route existed, so four public navigation links
 * 404'd. With the slugs declared here, the sitemap, the `/research` index and
 * `/research/[slug]` all derive from one list and cannot diverge.
 *
 * Adding a page: add the path here, then import it. Do not hand-write a
 * literal path in a component.
 */

// ── Public marketing ────────────────────────────────────────────────────────

export const PUBLIC_ROUTES = {
  home: '/',
  product: '/product',
  agencies: '/agencies',
  externalDependencyIntelligence: '/external-dependency-intelligence',
  dependencyMonitoring: '/dependency-monitoring',
  slaEvidence: '/sla-evidence',
  incidentEvidence: '/incident-evidence',
  track: '/track',
  pricing: '/pricing',
  partner: '/partner',
  security: '/security',
  docs: '/docs',
  docsQuickstart: '/docs/quickstart',
  docsMonitoring: '/docs/monitoring',
  docsEvidence: '/docs/evidence',
  docsApi: '/docs/api',
  glossary: '/glossary',
  research: '/research',
  about: '/about',
  contact: '/contact',
  status: '/status',
  privacy: '/privacy',
  terms: '/terms',
  refundPolicy: '/refund-policy',
  /**
   * Customer support. NOTE: this lives inside the `(console)` route group, so
   * the URL is `/support` but it renders inside the authenticated console
   * layout. Listed here because navigation treats it as a public destination.
   */
  support: '/support',
} as const;

// ── Auth ────────────────────────────────────────────────────────────────────

export const AUTH_ROUTES = {
  login: '/login',
  signup: '/signup',
  verifyEmail: '/verify-email',
  resetPassword: '/reset-password',
  adminLogin: '/admin/login',
} as const;

// ── Customer console (route group `(console)`, so no group in the URL) ──────

export const CONSOLE_ROUTES = {
  dashboard: '/dashboard',
  dependencies: '/dependencies',
  incidents: '/incidents',
  /**
   * The authenticated agency operations overview. The public marketing page
   * owns `/agencies`, so the console destination lives at `/agency`; the
   * sidebar label is "Agencies" either way. `/organization` (PR #40) is
   * permanently redirected here.
   */
  agency: '/agency',
  clients: '/clients',
  clientOnboarding: '/clients/onboarding',
  evidence: '/evidence',
  onboarding: '/onboarding',
  settings: '/settings',
  billing: '/settings/billing',
  notifications: '/settings/notifications',
} as const;

// ── Admin ───────────────────────────────────────────────────────────────────

export const ADMIN_ROUTES = {
  home: '/admin',
  login: '/admin/login',
  customers: '/admin/customers',
  partners: '/admin/partners',
  revenue: '/admin/revenue',
  growth: '/admin/growth',
  product: '/admin/product',
  operations: '/admin/operations',
  support: '/admin/support',
  audit: '/admin/audit',
  communications: '/admin/communications',
} as const;

// ── Token-scoped public shares ──────────────────────────────────────────────

export const SHARE_ROUTES = {
  portal: (token: string) => `/portal/${token}`,
  report: (token: string) => `/reports/${token}`,
  trackVendor: (vendor: string) => `/track/${vendor}`,
  /**
   * Permanent public incident record for one measured vendor. The URL is
   * derived from the incident id exactly as the measurement API returns it,
   * so an incident record is stable forever: the list page is where freshness
   * lives, the incident page is a historical artifact and never re-truthed.
   */
  trackIncident: (vendor: string, incidentId: string) =>
    `/track/${encodeURIComponent(vendor)}/incidents/${encodeURIComponent(incidentId)}`,
  /**
   * Canonical partner referral URL. Partners share this; `/r/{code}` records
   * the click, sets the attribution cookie, and redirects into the public
   * signup/landing flow. Do not confuse with the PLG `/ref/{code}` programme.
   */
  partnerReferral: (code: string) => `/r/${code}`,
  referralUnavailable: '/referral-unavailable',
} as const;

// ── Research ────────────────────────────────────────────────────────────────

/**
 * Research hubs (pillars). A hub is a real route under `/research`, so the
 * static segment `ai-infrastructure` must never also be readable as an
 * article slug: the hub slug list and the article list are checked for
 * disjointness by `seo.test.ts`.
 *
 * A hub clusters articles *and* live observatory data for one topic. It is
 * not a tag page: it renders current measurements, so it is ISR'd on the
 * same cadence as the records it cites.
 */
export const RESEARCH_HUBS = [
  {
    slug: 'ai-infrastructure',
    title: 'AI Infrastructure Status & Reliability',
    /** Compact label for nav/footer; the full title is the page identity. */
    navLabel: 'AI infrastructure hub',
    lede:
      'An independent, continuously measured public record of the endpoints AI ' +
      'infrastructure is reached through - what RELIASTRA observed, from where, ' +
      'when, and what those observations do and do not establish.',
    summary:
      'Live status records, measured reliability windows, incident history and ' +
      'technical methodology for AI API providers - independently observed by ' +
      'RELIASTRA, not read from vendor status pages.',
  },
] as const;

export type ResearchHubSlug = (typeof RESEARCH_HUBS)[number]['slug'];

/**
 * Research categories. A category is a URL segment under `/research` that
 * groups papers by technical discipline: `/research/{category}/{slug}`.
 *
 * Two rules, both enforced by tests:
 *
 *  1. A category is created only when a paper exists for it. An empty
 *     category is a thin page, and thin pages are not indexed.
 *  2. A category slug must not collide with a hub slug or with a top-level
 *     article slug - all three live at `/research/{segment}`.
 *
 * A category page is a real file (`src/app/research/{slug}/page.tsx`), not a
 * dynamic route. That is deliberate: it keeps the segment free of the
 * `[slug]` route that serves top-level articles, gives each category its own
 * metadata, and makes adding a discipline a reviewed act rather than a
 * parameter.
 */
export const RESEARCH_CATEGORIES = [
  {
    slug: 'measurement-integrity',
    title: 'Measurement integrity',
    lede:
      'What a reliability record actually measures, what it silently omits, and the audits that expose the difference. ' +
      'Papers here treat RELIASTRA’s own public record as the primary subject.',
  },
  {
    slug: 'cloud-security',
    title: 'Cloud & AI infrastructure security',
    lede:
      'Trust boundaries, failure domains and attack surface in architectures that depend on cloud control planes and hosted model APIs.',
  },
] as const;

export type ResearchCategorySlug = (typeof RESEARCH_CATEGORIES)[number]['slug'];


/**
 * Research articles. The slug is the URL segment, so this list *is* the set of
 * valid `/research/[slug]` routes: `generateStaticParams` and the sitemap both
 * read it, which means a slug cannot exist in one place and not the other.
 *
 * An article that carries a `hub` lives under the hub URL
 * (`/research/{hub}/{slug}`) instead of the top-level article URL. The hub
 * field is part of the identity of the route, not a label - `researchRoute()`
 * is the only function allowed to build an article URL, so a hub article can
 * never be linked at two addresses.
 */
export const RESEARCH_ARTICLES = [
  {
    slug: 'the-dependency-gap',
    title: 'The Dependency Gap',
    summary:
      'Why an outage you caused and an outage your vendor caused look identical from inside your own monitoring - and what it takes to tell them apart.',
    publishedAt: '2025-11-18',
    category: 'Research',
    tags: ['Dependency management', 'Incident analysis'],
  },
  {
    slug: 'how-reliastra-measures-vendor-reliability',
    title: 'How RELIASTRA measures vendor reliability',
    summary:
      'The measurement methodology behind every check: where probes originate, retry semantics, the incident detection rule, and the cases we deliberately refuse to call an outage.',
    publishedAt: '2025-11-18',
    updatedAt: '2026-09-10',
    category: 'Methodology',
    tags: ['Measurement', 'Methodology'],
  },
  {
    slug: 'reliastra-research-agenda',
    title: 'The RELIASTRA research agenda',
    summary:
      'What we intend to publish, what we will not, and the standards we hold our own reliability data to.',
    publishedAt: '2025-11-18',
    category: 'Research',
    tags: ['Agenda'],
  },
  {
    slug: 'is-openai-down',
    hub: 'ai-infrastructure',
    title: '“Is OpenAI down?” - how to answer the question honestly',
    summary:
      'The question hides three different claims - API, consumer app, status site. What an outside observer can measure, what RELIASTRA actually measures today, and a probe you can reproduce in thirty seconds.',
    publishedAt: '2026-09-10',
    category: 'AI infrastructure',
    tags: ['OpenAI', 'Status semantics', 'Measurement'],
  },
  {
    slug: 'ai-api-outage-evidence',
    hub: 'ai-infrastructure',
    title: 'When an AI API misbehaves: an evidence playbook',
    summary:
      'What to capture in the first ten minutes of an AI-provider incident so the window is still checkable a month later - and how independent observations turn a bad evening into an attributable record.',
    publishedAt: '2026-09-10',
    category: 'AI infrastructure',
    tags: ['Incident response', 'Evidence', 'Attribution'],
  },
  {
    slug: 'status-page-payload-anatomy',
    hub: 'ai-infrastructure',
    title: 'What a status-page payload actually asserts',
    summary:
      'RELIASTRA read the machine-readable summary behind OpenAI’s status site: 25 components, one aggregate indicator, and a last-change timestamp sixty-four days old. A structural analysis of what a status page can and cannot support as evidence.',
    publishedAt: '2026-09-11',
    category: 'AI infrastructure',
    tags: ['Status pages', 'Incident evidence', 'OpenAI'],
  },
  {
    slug: 'availability-record-audit',
    section: 'measurement-integrity',
    title: 'How much evidence stands behind a published availability figure?',
    summary:
      'RELIASTRA audited its own public availability record and found the 30- and 90-day windows returning aggregates identical to the 7-day window, and roughly 2.1 days of observations behind a "90 days" label. Three checks - window monotonicity, history depth, expected-versus-observed density - that expose a thin denominator in any availability record.',
    publishedAt: '2026-09-11',
    category: 'Measurement integrity',
    tags: ['Availability', 'Observability', 'Audit', 'Telemetry integrity'],
  },
  {
    slug: 'probe-interval-from-bucketed-telemetry',
    section: 'measurement-integrity',
    title: 'Why an interval estimated from bucketed telemetry converges on the bucket length',
    summary:
      'A production record printed "about every 60 seconds" for a dependency probed every 300 seconds, and printed 300 seconds for the same schedule elsewhere on the same page. The estimator is bounded above by the resolution it is fed. The bound, the proof, the fix and the regression test.',
    publishedAt: '2026-09-11',
    category: 'Measurement integrity',
    tags: ['Telemetry', 'Estimation', 'Observability', 'Defect analysis'],
  },
  {
    slug: 'ai-api-trust-boundary',
    section: 'cloud-security',
    title: 'The trust boundary of an AI API dependency',
    summary:
      'What changes about an application’s trust boundary when its model is a network call: prompt content leaving the domain, routing the consumer cannot observe, retries that are a cost control as well as a reliability one - and the controls that follow from each.',
    publishedAt: '2026-09-11',
    category: 'Cloud security',
    tags: ['Zero trust', 'AI infrastructure', 'Trust boundaries', 'Dependency security'],
  },
] as const;

export type ResearchSlug = (typeof RESEARCH_ARTICLES)[number]['slug'];

/** The article record behind a slug, or undefined when it is not published. */
export function researchArticle(slug: string) {
  return RESEARCH_ARTICLES.find((a) => a.slug === slug);
}

/** Articles belonging to a hub, in publication order. */
export function researchHubArticles(hub: ResearchHubSlug) {
  return RESEARCH_ARTICLES.filter((a) => 'hub' in a && a.hub === hub);
}

/** Articles that live at the top level of `/research` (no hub, no category). */
export function researchStandaloneArticles() {
  return RESEARCH_ARTICLES.filter(
    (a) => !('hub' in a && a.hub) && !('section' in a && a.section)
  );
}

/** Canonical URL of a research hub. */
export function researchHubRoute(hub: ResearchHubSlug | string): string {
  return `${PUBLIC_ROUTES.research}/${hub}`;
}

/** Canonical URL of a research category. */
export function researchCategoryRoute(slug: ResearchCategorySlug | string): string {
  return `${PUBLIC_ROUTES.research}/${slug}`;
}

/** Articles belonging to a category, newest first. */
export function researchCategoryArticles(slug: string) {
  return RESEARCH_ARTICLES.filter((a) => 'section' in a && a.section === slug);
}

/** True when `slug` is a declared research category. */
export function isResearchCategory(slug: string): slug is ResearchCategorySlug {
  return RESEARCH_CATEGORIES.some((c) => c.slug === slug);
}

/**
 * Build the single canonical article URL from a known slug. Hub articles
 * resolve under their hub, category articles under their category, and
 * everything else under `/research` directly.
 *
 * This is the only function allowed to build an article URL. Published URLs
 * are stable: an article that already resolves at `/research/{slug}` must
 * never be moved to `/research/{category}/{slug}` after publication, because
 * the old address is already in sitemaps, backlinks and cached SERPs. New
 * papers take the category form from the start; the five papers published
 * before categories existed keep their addresses.
 */
export function researchRoute(slug: ResearchSlug | string): string {
  const article = researchArticle(slug);
  if (article && 'hub' in article && article.hub) {
    return `${researchHubRoute(article.hub)}/${slug}`;
  }
  if (article && 'section' in article && article.section) {
    return `${researchCategoryRoute(article.section)}/${slug}`;
  }
  return `${PUBLIC_ROUTES.research}/${slug}`;
}

/** True when `slug` is a published research article. */
export function isResearchSlug(slug: string): slug is ResearchSlug {
  return RESEARCH_ARTICLES.some((a) => a.slug === slug);
}

// ── Partner network ─────────────────────────────────────────────────────────

// ── Partner dashboard (URL-driven; membership proven by PartnerSession) ─────

export const PARTNER_DASHBOARD_PAGES = [
  'dashboard',
  'referrals',
  'earnings',
  'payouts',
  'notifications',
  'settings',
] as const;

/**
 * Partner pages live at straightforward file routes under `/partner`.
 * `/partner` is the program home; every other public partner page is
 * `/partner/<slug>`. The legacy `/?page=<slug>` shape from the old
 * state-routed SPA is permanently redirected to these URLs by the proxy
 * (see `src/proxy.ts`), so shared/bookmarked query URLs keep working.
 */
export const PARTNER_PUBLIC_PAGES = [
  'home',
  'login',
  'signup',
  'forgot-password',
  'earn',
  'how-it-works',
  'commission',
  'faq',
  'resources',
  'support',
] as const;

export type PartnerPublicPage = (typeof PARTNER_PUBLIC_PAGES)[number];

/**
 * Every slug that resolves under `/partner/*`, including the program legal
 * pages (kept separate from the customer `/privacy` and `/terms` because
 * they cover referral cookies, attribution windows and commission tracking).
 */
export const PARTNER_ROUTE_SLUGS = [
  ...PARTNER_PUBLIC_PAGES,
  'privacy',
  'terms',
] as const;

export type PartnerRouteSlug = (typeof PARTNER_ROUTE_SLUGS)[number];

/** True for any slug that has a real `/partner/*` route. */
export function isPartnerRouteSlug(slug: string): slug is PartnerRouteSlug {
  return (PARTNER_ROUTE_SLUGS as readonly string[]).includes(slug);
}

/**
 * Partner slugs that are genuine marketing content and belong in the
 * sitemap. Auth/support/legal slugs are routable but never indexed.
 */
export const PARTNER_INDEXABLE_SLUGS = [
  'home',
  'earn',
  'how-it-works',
  'commission',
  'faq',
  'resources',
] as const;

/**
 * A refresh-safe, shareable URL for a partner page.
 *
 * Partner *signup* must use this, not `AUTH_ROUTES.signup`: `/signup` is the
 * customer registration form and never creates a partner profile, so pointing
 * a "join as partner" link there silently enrols the visitor as a customer.
 */
export function partnerUrl(page: PartnerPublicPage): string {
  return page === 'home' ? '/partner' : `/partner/${page}`;
}

/** Canonical URL for any partner route slug (`privacy`/`terms` included). */
export function partnerRouteUrl(slug: PartnerRouteSlug): string {
  return slug === 'home' ? '/partner' : `/partner/${slug}`;
}

// ── External ────────────────────────────────────────────────────────────────

export const EXTERNAL_LINKS = {
  github: 'https://github.com/ReliaAstra',
  salesEmail: 'mailto:sales@reliastra.com?subject=Enterprise%20plan',
  billingEmail: 'mailto:billing@reliastra.com?subject=Pro%20plan%20pricing',
} as const;

/**
 * Homepage section anchors, in narrative order.
 *
 * A stale anchor is a dead link that still looks like it works (the browser
 * simply does nothing, and `scrollToId` silently scrolls to the top), so every
 * id here must exist in the rendered homepage composition.
 *
 * `landing-sections.test.tsx` renders the real composition and asserts this
 * list is exactly the set of ids it emits - not a subset. That direction
 * matters: the previous list carried `chain`, a section that no component had
 * ever rendered, and the e2e spec that walks this list was failing on it. A
 * subset check would have kept passing while the anchor stayed dead.
 *
 * Sections with no anchor are deliberately absent: the RELIASTRA statement
 * band and the final CTA are not link targets, and the agencies block is
 * reached by route rather than by anchor.
 */
export const LANDING_SECTIONS = [
  'top',
  'problem',
  'observation',
  'incident',
  'evidence',
  'how-it-works',
  'research',
  'public-intelligence',
  'partners',
  'pricing',
  'reference',
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];
