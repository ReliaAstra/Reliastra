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
  externalDependencyIntelligence: '/external-dependency-intelligence',
  dependencyMonitoring: '/dependency-monitoring',
  slaEvidence: '/sla-evidence',
  incidentEvidence: '/incident-evidence',
  track: '/track',
  pricing: '/pricing',
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
  clients: '/clients',
  evidence: '/evidence',
  onboarding: '/onboarding',
  settings: '/settings',
  billing: '/settings/billing',
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
} as const;

// ── Research ────────────────────────────────────────────────────────────────

/**
 * Research articles. The slug is the URL segment, so this list *is* the set of
 * valid `/research/[slug]` routes: `generateStaticParams` and the sitemap both
 * read it, which means a slug cannot exist in one place and not the other.
 */
export const RESEARCH_ARTICLES = [
  {
    slug: 'the-dependency-gap',
    title: 'The Dependency Gap',
    summary:
      'Why an outage you caused and an outage your vendor caused look identical from inside your own monitoring — and what it takes to tell them apart.',
    publishedAt: '2025-11-18',
    category: 'Research',
    tags: ['Dependency management', 'Incident analysis'],
  },
  {
    slug: 'how-reliastra-measures-vendor-reliability',
    title: 'How RELIASTRA measures vendor reliability',
    summary:
      'The measurement methodology behind every check: regional origination, retry semantics, quorum rules, and the cases we deliberately refuse to call an outage.',
    publishedAt: '2025-11-18',
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
] as const;

export type ResearchSlug = (typeof RESEARCH_ARTICLES)[number]['slug'];

/** Build a `/research/[slug]` URL from a known slug. */
export function researchRoute(slug: ResearchSlug | string): string {
  return `${PUBLIC_ROUTES.research}/${slug}`;
}

/** True when `slug` is a published research article. */
export function isResearchSlug(slug: string): slug is ResearchSlug {
  return RESEARCH_ARTICLES.some((a) => a.slug === slug);
}

// ── Partner network ─────────────────────────────────────────────────────────

/**
 * Partner public pages are state-routed rather than file-routed: the partner
 * experience renders from `usePartnerStore.currentPage` at `/`. The `?page=`
 * entry point is what makes a partner page survive a refresh or a cold load,
 * and `app/page.tsx` only honours it for public pages — dashboard pages are
 * deliberately excluded so a shared URL cannot leak into a protected surface.
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
  'tiers',
  'resources',
  'support',
] as const;

export type PartnerPublicPage = (typeof PARTNER_PUBLIC_PAGES)[number];

/**
 * A refresh-safe URL for a partner public page.
 *
 * Partner *signup* must use this, not `AUTH_ROUTES.signup`: `/signup` is the
 * customer registration form and never creates a partner profile, so pointing
 * a "join as partner" link there silently enrols the visitor as a customer.
 */
export function partnerUrl(page: PartnerPublicPage): string {
  return page === 'home' ? '/?page=home' : `/?page=${page}`;
}

// ── External ────────────────────────────────────────────────────────────────

export const EXTERNAL_LINKS = {
  github: 'https://github.com/ReliaAstra',
  salesEmail: 'mailto:sales@reliastra.com?subject=Enterprise%20plan',
  billingEmail: 'mailto:billing@reliastra.com?subject=Pro%20plan%20pricing',
} as const;

/**
 * Landing-page section anchors. `scrollToId` silently scrolls to the top when
 * an id is missing, so a stale anchor is a dead link that still looks like it
 * works. Every id here must exist in the rendered landing composition — the
 * accompanying test asserts that.
 */
export const LANDING_SECTIONS = [
  'top',
  'evidence',
  'live',
  'research',
  'comparison',
  'pricing',
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];
