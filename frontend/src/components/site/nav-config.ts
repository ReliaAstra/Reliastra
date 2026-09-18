import {
  AUTH_ROUTES,
  DOCS_ROUTES,
  EXTERNAL_LINKS,
  PUBLIC_ROUTES,
  RESEARCH_ARTICLES,
  RESEARCH_HUBS,
  researchHubRoute,
  researchRoute,
} from '@/lib/routes';

/**
 * The public information architecture, in one place.
 *
 * Both the header and the footer render from this file, and the link
 * integrity test walks it. That is the mechanism that stops navigation from
 * drifting into placeholder links: there is nowhere to write one. Every href
 * is either a `lib/routes` constant or an explicit external URL.
 *
 * The model, and why it is this one:
 *
 *   Product      what the thing does, in one page - not five overlapping ones
 *   Observatory  the public instrument: what RELIASTRA measures where anyone can see it
 *   Docs         how to install, configure and call it
 *   Research     the published work the methodology rests on
 *   Pricing      one plan, one page
 *
 * About and Technical Creators are not in the bar. They are not what a visitor
 * arrives for, and a six-item navigation bar is how a product signals that it
 * does not know which of its pages matters.
 *
 * Naming note: the public observatory was called "public dependency
 * intelligence" and lived at `/track`. A visitor reading that had to work out
 * whether it was a product feature, a vendor directory or marketing. It is a
 * measurement instrument, so it is called one.
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
 * The Product panel is where the capability set lives now. It is grouped by
 * the question a visitor is holding ("what does it do", "how do I wire it
 * up"), not by internal feature names.
 */
export const PRODUCT_PANEL: NavGroup[] = [
  {
    label: 'What it does',
    links: [
      {
        label: 'Overview',
        href: PUBLIC_ROUTES.product,
        description: 'Observe a dependency, confirm a fault, keep the record',
      },
      {
        label: 'Evidence records',
        href: PUBLIC_ROUTES.productEvidence,
        description: 'The artifact, its checksum and how it is verified',
      },
      {
        label: 'Public observatory',
        href: PUBLIC_ROUTES.observatory,
        description: 'What RELIASTRA measures, visible to anyone',
      },
    ],
  },
  {
    label: 'Use it',
    links: [
      {
        label: 'Quickstart',
        href: DOCS_ROUTES.quickstart,
        description: 'First observation in about five minutes',
      },
      {
        label: 'REST API',
        href: DOCS_ROUTES.api,
        description: 'Add dependencies, read observations, fetch records',
      },
      {
        label: 'CLI',
        href: DOCS_ROUTES.cli,
        description: 'reliastra deps, checks, incidents, evidence, verify',
      },
      {
        label: 'Webhooks',
        href: DOCS_ROUTES.webhooks,
        description: 'Push incidents and evidence into your own systems',
      },
    ],
  },
];

export const PRIMARY_NAV: NavLink[] = [
  { label: 'Product', href: PUBLIC_ROUTES.product },
  { label: 'Observatory', href: PUBLIC_ROUTES.observatory },
  { label: 'Docs', href: PUBLIC_ROUTES.docs },
  { label: 'Research', href: PUBLIC_ROUTES.research },
  { label: 'Pricing', href: PUBLIC_ROUTES.pricing },
];

export const HEADER_ACTIONS = {
  signIn: { label: 'Sign in', href: AUTH_ROUTES.login },
  start: { label: 'Start observing', href: AUTH_ROUTES.signup },
} as const;

/* ── Documentation ──────────────────────────────────────────────────────── */

/**
 * The documentation spine, in reading order.
 *
 * Declared here rather than inside a component so the side navigation, the
 * docs index and the footer map cannot disagree about which guides exist.
 */
export const DOCS_NAV: NavLink[] = [
  { label: 'Overview', href: PUBLIC_ROUTES.docs },
  { label: 'Quickstart', href: DOCS_ROUTES.quickstart },
  { label: 'Concepts', href: DOCS_ROUTES.concepts },
  { label: 'Configuration', href: DOCS_ROUTES.configuration },
  { label: 'Monitoring', href: DOCS_ROUTES.monitoring },
  { label: 'Incidents', href: DOCS_ROUTES.incidents },
  { label: 'Evidence', href: DOCS_ROUTES.evidence },
  { label: 'Verification', href: DOCS_ROUTES.verification },
  { label: 'REST API', href: DOCS_ROUTES.api },
  { label: 'CLI', href: DOCS_ROUTES.cli },
  { label: 'Webhooks', href: DOCS_ROUTES.webhooks },
  { label: 'Methodology', href: DOCS_ROUTES.methodology },
  { label: 'Security', href: DOCS_ROUTES.security },
];

/** Grouped form, used by the docs index and the mobile panel. */
export const DOCS_GROUPS: NavGroup[] = [
  {
    label: 'Start',
    links: [
      { label: 'Quickstart', href: DOCS_ROUTES.quickstart, description: 'Sign up, add a dependency, read the first observation' },
      { label: 'Concepts', href: DOCS_ROUTES.concepts, description: 'Observation, confirmation, attribution, evidence' },
    ],
  },
  {
    label: 'Operate',
    links: [
      { label: 'Configuration', href: DOCS_ROUTES.configuration, description: 'Endpoints, intervals, expected codes, secret headers' },
      { label: 'Monitoring', href: DOCS_ROUTES.monitoring, description: 'What a probe records and what it cannot see' },
      { label: 'Incidents', href: DOCS_ROUTES.incidents, description: 'The detection rule, severity, resolution' },
      { label: 'Evidence', href: DOCS_ROUTES.evidence, description: 'Generate, share, retain' },
      { label: 'Verification', href: DOCS_ROUTES.verification, description: 'Check an artifact without an account' },
    ],
  },
  {
    label: 'Integrate',
    links: [
      { label: 'REST API', href: DOCS_ROUTES.api, description: 'Endpoints, auth, pagination, rate limits' },
      { label: 'CLI', href: DOCS_ROUTES.cli, description: 'Install, login, script, exit codes' },
      { label: 'Webhooks', href: DOCS_ROUTES.webhooks, description: 'Delivery, signatures, replay' },
    ],
  },
  {
    label: 'Reference',
    links: [
      { label: 'Methodology', href: DOCS_ROUTES.methodology, description: 'The canonical explanation of every rule and number' },
      { label: 'Security', href: DOCS_ROUTES.security, description: 'Encryption, key handling, data boundaries' },
      { label: 'Glossary', href: PUBLIC_ROUTES.glossary, description: 'Every core term, defined once' },
    ],
  },
];

/* ── Footer ─────────────────────────────────────────────────────────────── */

/**
 * The footer is the complete public site map. It carries the destinations the
 * header deliberately does not (About, Technical Creators, status, legal).
 */
export const FOOTER_GROUPS: NavGroup[] = [
  {
    label: 'Product',
    links: [
      { label: 'Overview', href: PUBLIC_ROUTES.product },
      { label: 'Evidence records', href: PUBLIC_ROUTES.productEvidence },
      { label: 'Public observatory', href: PUBLIC_ROUTES.observatory },
      { label: 'Pricing', href: PUBLIC_ROUTES.pricing },
    ],
  },
  {
    label: 'Documentation',
    links: [
      { label: 'Overview', href: PUBLIC_ROUTES.docs },
      { label: 'Quickstart', href: DOCS_ROUTES.quickstart },
      { label: 'REST API', href: DOCS_ROUTES.api },
      { label: 'CLI', href: DOCS_ROUTES.cli },
      { label: 'Webhooks', href: DOCS_ROUTES.webhooks },
      { label: 'Methodology', href: DOCS_ROUTES.methodology },
      { label: 'Glossary', href: PUBLIC_ROUTES.glossary },
    ],
  },
  {
    label: 'Research',
    links: [
      { label: 'All research', href: PUBLIC_ROUTES.research },
      ...RESEARCH_HUBS.map((hub) => ({
        label: hub.navLabel,
        href: researchHubRoute(hub.slug),
      })),
      ...RESEARCH_ARTICLES.filter((a) => a.slug === 'the-dependency-gap').map((a) => ({
        label: a.title,
        href: researchRoute(a.slug),
      })),
    ],
  },
  {
    label: 'Project',
    links: [
      { label: 'About & maintainer', href: PUBLIC_ROUTES.about },
      { label: 'Security', href: PUBLIC_ROUTES.security },
      { label: 'Technical creators', href: PUBLIC_ROUTES.creators },
      { label: 'Contact', href: PUBLIC_ROUTES.contact },
      { label: 'Platform status', href: PUBLIC_ROUTES.status },
      { label: 'GitHub', href: EXTERNAL_LINKS.github, external: true },
    ],
  },
  {
    label: 'Legal',
    links: [
      { label: 'Privacy & cookies', href: PUBLIC_ROUTES.privacy },
      { label: 'Terms of service', href: PUBLIC_ROUTES.terms },
      { label: 'Refund policy', href: PUBLIC_ROUTES.refundPolicy },
    ],
  },
];

/**
 * Social accounts. Exactly one, because exactly one is real. An invented
 * profile on a product that asks to be trusted with infrastructure is a claim
 * a visitor can check in one click.
 */
export const SOCIAL_LINKS: NavLink[] = [
  { label: 'GitHub', href: EXTERNAL_LINKS.github, external: true },
];
