import {
  AUTH_ROUTES,
  EXTERNAL_LINKS,
  PUBLIC_ROUTES,
  RESEARCH_ARTICLES,
  partnerRouteUrl,
  partnerUrl,
  researchRoute,
} from '@/lib/routes';

/**
 * The public information architecture, in one place.
 *
 * Both the header and the footer render from this file, and the link
 * integrity test walks it. That is the mechanism that stops the footer from
 * drifting back into placeholder or `#` links: there is nowhere to write one.
 *
 * Every href here is either a `lib/routes` constant or an explicit external
 * URL. No literal internal paths.
 */

export type NavLink = {
  label: string;
  href: string;
  /** One line explaining the destination. Shown in the desktop panel. */
  description?: string;
  external?: boolean;
};

export type NavGroup = {
  label: string;
  links: NavLink[];
};

/* ── Header ─────────────────────────────────────────────────────────────── */

/**
 * The primary bar carries four destinations. Everything else lives one level
 * down inside the Product panel or in the footer map - an infrastructure
 * company does not need eleven top-level links.
 */
export const PRODUCT_PANEL: NavGroup[] = [
  {
    label: 'Platform',
    links: [
      {
        label: 'For Agencies',
        href: PUBLIC_ROUTES.agencies,
        description: 'Client infrastructure. Evidence you can hand over.',
      },
      {
        label: 'Overview',
        href: PUBLIC_ROUTES.product,
        description: 'How observation, attribution and evidence fit together',
      },
      {
        label: 'Dependency monitoring',
        href: PUBLIC_ROUTES.dependencyMonitoring,
        description: 'Multi-region checks with quorum verdicts',
      },
      {
        label: 'Incident attribution',
        href: PUBLIC_ROUTES.incidentEvidence,
        description: 'Whether the fault was yours or a dependency’s',
      },
      {
        label: 'SLA evidence',
        href: PUBLIC_ROUTES.slaEvidence,
        description: 'Timestamped, checksummed fault records',
      },
    ],
  },
  {
    label: 'Category & reference',
    links: [
      {
        label: 'External Dependency Intelligence',
        href: PUBLIC_ROUTES.externalDependencyIntelligence,
        description: 'The discipline RELIASTRA is built around',
      },
      {
        label: 'Public dependency intelligence',
        href: PUBLIC_ROUTES.track,
        description: 'Independently measured status for public vendors',
      },
      {
        label: 'Documentation',
        href: PUBLIC_ROUTES.docs,
        description: 'Quickstart, monitoring, evidence, API',
      },
      {
        label: 'Glossary',
        href: PUBLIC_ROUTES.glossary,
        description: 'Every core term, defined once',
      },
    ],
  },
];

export const PRIMARY_NAV: NavLink[] = [
  { label: 'Product', href: PUBLIC_ROUTES.product },
  { label: 'Research', href: PUBLIC_ROUTES.research },
  { label: 'Pricing', href: PUBLIC_ROUTES.pricing },
  { label: 'Partners', href: PUBLIC_ROUTES.partner },
];

export const HEADER_ACTIONS = {
  signIn: { label: 'Sign in', href: AUTH_ROUTES.login },
  start: { label: 'Start monitoring', href: AUTH_ROUTES.signup },
} as const;

/* ── Footer ─────────────────────────────────────────────────────────────── */

export const FOOTER_GROUPS: NavGroup[] = [
  {
    label: 'Platform',
    links: [
      { label: 'For Agencies', href: PUBLIC_ROUTES.agencies },
      { label: 'Overview', href: PUBLIC_ROUTES.product },
      { label: 'Dependency monitoring', href: PUBLIC_ROUTES.dependencyMonitoring },
      { label: 'Incident attribution', href: PUBLIC_ROUTES.incidentEvidence },
      { label: 'SLA evidence', href: PUBLIC_ROUTES.slaEvidence },
      {
        label: 'External Dependency Intelligence',
        href: PUBLIC_ROUTES.externalDependencyIntelligence,
      },
      { label: 'Pricing', href: PUBLIC_ROUTES.pricing },
    ],
  },
  {
    label: 'Intelligence',
    links: [
      { label: 'Public dependency index', href: PUBLIC_ROUTES.track },
      { label: 'Research', href: PUBLIC_ROUTES.research },
      ...RESEARCH_ARTICLES.map((a) => ({
        label: a.title,
        href: researchRoute(a.slug),
      })),
    ],
  },
  {
    label: 'Reference',
    links: [
      { label: 'Documentation', href: PUBLIC_ROUTES.docs },
      { label: 'Quickstart', href: PUBLIC_ROUTES.docsQuickstart },
      { label: 'Monitoring guide', href: PUBLIC_ROUTES.docsMonitoring },
      { label: 'Evidence guide', href: PUBLIC_ROUTES.docsEvidence },
      { label: 'API', href: PUBLIC_ROUTES.docsApi },
      { label: 'Glossary', href: PUBLIC_ROUTES.glossary },
    ],
  },
  {
    label: 'Partners',
    links: [
      { label: 'Partner program', href: PUBLIC_ROUTES.partner },
      { label: 'How it works', href: partnerUrl('how-it-works') },
      { label: 'Commission', href: partnerUrl('commission') },
      { label: 'Partner sign in', href: partnerUrl('login') },
      { label: 'Apply as a partner', href: partnerUrl('signup') },
    ],
  },
  {
    label: 'Company',
    links: [
      { label: 'About', href: PUBLIC_ROUTES.about },
      { label: 'Contact', href: PUBLIC_ROUTES.contact },
      { label: 'Security', href: PUBLIC_ROUTES.security },
      { label: 'Platform status', href: PUBLIC_ROUTES.status },
      { label: 'GitHub', href: EXTERNAL_LINKS.github, external: true },
    ],
  },
  {
    label: 'Legal',
    links: [
      { label: 'Privacy & cookies', href: PUBLIC_ROUTES.privacy },
      { label: 'Terms of service', href: PUBLIC_ROUTES.terms },
      { label: 'Partner program privacy', href: partnerRouteUrl('privacy') },
      { label: 'Partner program terms', href: partnerRouteUrl('terms') },
    ],
  },
];

/**
 * Social accounts. Exactly one, because exactly one is real. An invented
 * profile on a trust-led product is a lie the visitor can check in a click.
 */
export const SOCIAL_LINKS: NavLink[] = [
  { label: 'GitHub', href: EXTERNAL_LINKS.github, external: true },
];
