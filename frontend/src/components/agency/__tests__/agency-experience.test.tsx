import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The Agencies experience, asserted the way a customer would see it.
 *
 * These tests render the real console surfaces (sidebar, mobile menu,
 * command palette, top bar, the /agency page, the client-management pages)
 * against a controlled session and a recorded query layer. The query mock
 * records the `enabled` argument of every hook: TanStack Query does not
 * issue a request for a disabled hook, so "the hook was called with
 * enabled=false" is the same contract as "no request went out" - and it is
 * what lets a disabled organization be asserted to never request portfolio
 * or client data.
 *
 * The entitlement rule under test is the real one: `hasAgencyWorkspace`
 * (organization flag OR effective Enterprise plan). The store, the query
 * layer and the navigation are the mocks; nothing in between is.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

const calls: Record<string, unknown[][]> = {};
const record = (name: string, args: unknown[]) => {
  (calls[name] ??= []).push(args);
};

vi.mock('next/navigation', () => ({
  usePathname: () => '/agency',
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}));

vi.mock('next/link', () => ({
  default: (props: { href?: string; children?: React.ReactNode }) =>
    React.createElement('a', { href: props.href }, props.children),
}));

const storeState: Record<string, unknown> = {};
vi.mock('@/stores/app-store', () => ({
  useAppStore: (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState,
}));

// Fixture portfolio: one client with data, one client with no monitors (the
// "not observed" case the UI must not print as healthy).
const fixtureClients = [
  { id: 'cli_1', org_id: 'org_x', name: 'Meridian Health', description: 'Telehealth platform' },
  { id: 'cli_2', org_id: 'org_x', name: 'Verdant Energy', description: null },
];
const fixturePortfolio = {
  org_name: 'Northwind Systems',
  generated_at: '2026-09-10T12:00:00.000Z',
  share_token: 'org_x.qafixtureportfoliotoken00000000',
  clients: [
    { id: 'cli_1', name: 'Meridian Health', description: 'Telehealth platform', application_count: 2, dependency_count: 3, uptime_24h: 99.21, avg_latency_ms: 321.4, open_incidents: 1, critical_incidents: 0, last_incident_at: '2026-09-09T08:00:00.000Z', status: 'degraded' },
    { id: 'cli_2', name: 'Verdant Energy', description: null, application_count: 0, dependency_count: 0, uptime_24h: 100.0, avg_latency_ms: 0.0, open_incidents: 0, critical_incidents: 0, last_incident_at: null, status: 'operational' },
  ],
  totals: { clients: 2, dependencies: 3, avg_uptime_24h: 99.21, open_incidents: 1, clients_needing_attention: 1 },
  unassigned_monitors: 1,
};

const queryBase = {
  isLoading: false,
  isError: false,
  data: undefined,
  refetch: () => {},
};

vi.mock('@/lib/dashboard/queries', () => ({
  usePortfolio: (enabled = true) => {
    record('portfolio', [enabled]);
    return { ...queryBase, data: enabled ? fixturePortfolio : undefined };
  },
  useClients: (enabled = true) => {
    record('clients', [enabled]);
    return { ...queryBase, data: enabled ? fixtureClients : [] };
  },
  useAllApplications: (ids: string[], enabled = true) => {
    record('applications', [ids, enabled]);
    return { data: enabled ? [] : [], isLoading: false, isError: false };
  },
  useApplications: (clientId: string | null | undefined, enabled = true) => {
    record('client-applications', [clientId, enabled]);
    return { ...queryBase, data: [] };
  },
  useDependencies: (enabled = true) => {
    record('dependencies', [enabled]);
    return { ...queryBase, data: [] };
  },
  useHealth: (enabled = true) => {
    record('health', [enabled]);
    return { ...queryBase, data: [] };
  },
  useIncidents: (status?: string, limit = 20, enabled = true) => {
    record('incidents', [status, limit, enabled]);
    return { ...queryBase, data: [] };
  },
  useEvidence: (enabled = true) => {
    record('evidence', [enabled]);
    return { ...queryBase, data: [] };
  },
  useCreateClient: () => ({ mutateAsync: async () => ({ id: 'cli_new' }), isPending: false }),
  useCreateApplication: () => ({ mutateAsync: async () => ({}), isPending: false }),
  useUpdateDependency: () => ({ mutateAsync: async () => ({}), isPending: false }),
  useInbox: () => ({ data: undefined, isLoading: false }),
  useMarkInboxRead: () => ({ mutate: () => {} }),
}));

// Imports after the mocks so the components see the mocked layer.
import { ConsoleRail, ConsoleMobileBar } from '@/components/console/console-nav';
import { ConsoleTopBar } from '@/components/console/console-topbar';
import { CommandPalette } from '@/components/dashboard/shell/command-palette';
import { AgencyGatedExperience } from '@/components/agency/gated';
import { AgencyPortfolioPage } from '@/components/agency/portfolio';
import { ClientEnvironmentPage } from '@/components/agency/client-environment';
import { ClientSetupSequence } from '@/components/sequence/client-setup';
import type { Organization, PlanDetails } from '@/lib/dashboard/types';

const org = (enabled: boolean) =>
  ({
    id: 'org_x',
    name: 'Northwind Systems',
    slug: 'northwind',
    plan: 'pro',
    has_agency_mode: enabled,
    ai_explanations_enabled: false,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }) as Organization;
const plan = (id: 'free' | 'pro' | 'enterprise') =>
  ({
    org_id: 'org_x',
    plan: id,
    effective_plan: id,
    subscription_status: 'active',
    price_usd: id === 'pro' ? 19 : 0,
    max_dependencies: null,
    min_check_interval_seconds: null,
  }) as PlanDetails;

function setSession(o: Organization | null, p: PlanDetails | null, extra: Record<string, unknown> = {}) {
  Object.assign(storeState, {
    org: o,
    plan: p,
    user: { full_name: 'Ada Okonkwo', email: 'ops@northwind.systems' },
    sessionState: 'authenticated',
    commandOpen: false,
    recent: [],
    openUpgrade: () => {},
    closeUpgrade: () => {},
    setCommandOpen: () => {},
    setAddDependencyOpen: () => {},
    setHelpOpen: () => {},
    ...extra,
  });
}

const allFalse = (name: string) =>
  calls[name].every((args) => args[args.length - 1] === false);

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
});

/* ── 1 · Sidebar and mobile navigation expose Agencies to everyone ──────── */

describe('console navigation', () => {
  it('a Free user without agency mode sees the Agencies entry', () => {
    setSession(org(false), plan('free'));
    const html = renderToStaticMarkup(<ConsoleRail />);
    expect(html).toContain('Agencies');
    expect(html).toContain('href="/agency"');
    expect(html).toContain('Agency overview');
  });

  it('a Pro user without agency mode sees the Agencies entry', () => {
    setSession(org(false), plan('pro'));
    const html = renderToStaticMarkup(<ConsoleRail />);
    expect(html).toContain('href="/agency"');
  });

  it('does not expose client-management entries to a non-eligible user', () => {
    setSession(org(false), plan('free'));
    const html = renderToStaticMarkup(<ConsoleRail />);
    expect(html).not.toContain('href="/clients"');
    expect(html).not.toContain('href="/clients/onboarding"');
  });

  it('an Enterprise user sees the client navigation and management actions', () => {
    setSession(org(false), plan('enterprise'));
    const html = renderToStaticMarkup(<ConsoleRail />);
    expect(html).toContain('href="/agency"');
    expect(html).toContain('href="/clients"');
    expect(html).toContain('href="/clients/onboarding"');
  });

  it('an explicitly enabled non-Enterprise user sees the client navigation', () => {
    setSession(org(true), plan('pro'));
    const html = renderToStaticMarkup(<ConsoleRail />);
    expect(html).toContain('href="/clients"');
    expect(html).toContain('href="/clients/onboarding"');
  });

  it('the mobile menu exposes Agencies with the same rule (desktop and mobile cannot drift)', () => {
    setSession(org(false), plan('free'));
    let html = renderToStaticMarkup(<ConsoleMobileBar />);
    expect(html).toContain('href="/agency"');
    expect(html).not.toContain('href="/clients"');

    setSession(org(false), plan('enterprise'));
    html = renderToStaticMarkup(<ConsoleMobileBar />);
    expect(html).toContain('href="/agency"');
    expect(html).toContain('href="/clients"');
    expect(html).toContain('href="/clients/onboarding"');
  });
});

/* ── 2 · The gated experience is premium feature discovery ───────────────── */

describe('gated experience', () => {
  it('is a feature-discovery presentation, not an error or a generic notice', () => {
    setSession(org(false), plan('free'));
    const html = renderToStaticMarkup(<AgencyGatedExperience />);

    expect(html).toContain('Agency operations');
    expect(html).toContain('Manage every client environment from one operational view');
    expect(html).toContain(
      'Separate each client\u2019s applications, monitors, incidents and evidence'
    );
    expect(html).toContain('Not enabled');
  });

  it('presents the restrained capability preview', () => {
    setSession(org(false), plan('pro'));
    const html = renderToStaticMarkup(<AgencyGatedExperience />);
    for (const capability of [
      'Multi-client operational overview',
      'Isolated client environments',
      'Cross-client incident prioritization',
      'Evidence and reports attributed by client',
      'Unassigned-monitor detection',
      'Shareable client-facing reliability portal',
      'Enterprise controls and scalable monitoring',
      'Clear organization and client scope',
    ]) {
      expect(html, `capability ${capability}`).toContain(capability);
    }
  });

  it('labels the structural preview as a preview, never as live data', () => {
    setSession(org(false), plan('free'));
    const html = renderToStaticMarkup(<AgencyGatedExperience />);
    expect(html).toContain('Capability preview');
    expect(html).toMatch(/no client data, no live measurements/i);
  });

  it('uses the existing contact and pricing routes, and states the entitlement exactly', () => {
    setSession(org(false), plan('free'));
    const html = renderToStaticMarkup(<AgencyGatedExperience />);
    expect(html).toContain('href="/contact"');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Talk to RELIASTRA');
    expect(html).toContain('Review Enterprise capabilities');
    expect(html).toContain(
      'Agency operations is available to Enterprise organizations and organizations explicitly enabled by RELIASTRA.'
    );
    // Enterprise is contact-sales only: no invented checkout, no price.
    expect(html).not.toMatch(/\$\d/);
  });

  it('never sells or fabricates', () => {
    setSession(org(false), plan('free'));
    const html = renderToStaticMarkup(<AgencyGatedExperience />);
    expect(html).not.toMatch(/upgrade to/i);
    expect(html).not.toMatch(/enterprise tier/i);
    expect(html).not.toContain('Meridian');
    expect(html).not.toContain('Verdant');
    expect(html).not.toMatch(/100\.00%|\d{2}\.\d{2}%/);
  });

  it('renders for ineligible users on the /agency route itself', () => {
    setSession(org(false), plan('pro'));
    const html = renderToStaticMarkup(<AgencyPortfolioPage />);
    expect(html).toContain('Manage every client environment from one operational view');
    expect(html).not.toContain('Meridian Health');
  });
});

/* ── 3 · No agency portfolio/client requests while gated ─────────────────── */

describe('request gating', () => {
  it('the /agency page issues no portfolio or client requests for a Free organization', () => {
    setSession(org(false), plan('free'));
    renderToStaticMarkup(<AgencyPortfolioPage />);
    expect(calls.portfolio.length).toBeGreaterThan(0);
    expect(allFalse('portfolio')).toBe(true);
    expect(allFalse('clients')).toBe(true);
    expect(allFalse('applications')).toBe(true);
    expect(allFalse('dependencies')).toBe(true);
    expect(allFalse('incidents')).toBe(true);
    expect(allFalse('evidence')).toBe(true);
  });

  it('the /agency page issues no requests for a Pro organization without agency mode', () => {
    setSession(org(false), plan('pro'));
    renderToStaticMarkup(<AgencyPortfolioPage />);
    expect(allFalse('portfolio')).toBe(true);
    expect(allFalse('clients')).toBe(true);
  });

  it('the client environment route requests no client data while gated', () => {
    setSession(org(false), plan('free'));
    const html = renderToStaticMarkup(<ClientEnvironmentPage clientId="cli_1" />);
    expect(html).toContain('Manage every client environment from one operational view');
    expect(allFalse('client-applications')).toBe(true);
    expect(allFalse('portfolio')).toBe(true);
    expect(allFalse('clients')).toBe(true);
    expect(allFalse('health')).toBe(true);
    expect(html).not.toContain('Meridian Health');
  });

  it('the client setup sequence requests no client data while gated', () => {
    setSession(org(false), plan('pro'));
    const html = renderToStaticMarkup(<ClientSetupSequence />);
    expect(html).toContain('Manage every client environment from one operational view');
    expect(html).not.toContain('Establish a client environment');
    expect(allFalse('clients')).toBe(true);
    expect(allFalse('applications')).toBe(true);
    expect(allFalse('dependencies')).toBe(true);
  });

  it('enabled organizations do issue the requests (the gate is not a no-op)', () => {
    setSession(org(false), plan('enterprise'));
    renderToStaticMarkup(<AgencyPortfolioPage />);
    expect(calls.portfolio.every((a) => a[0] === true)).toBe(true);
    expect(calls.clients.every((a) => a[0] === true)).toBe(true);
    expect(calls.applications.every((a) => a[a.length - 1] === true)).toBe(true);
  });
});

/* ── 4 · Enabled organizations get the live operational experience ──────── */

describe('enabled experience', () => {
  it('an Enterprise organization sees the live portfolio, not the gated page', () => {
    setSession(org(false), plan('enterprise'));
    const html = renderToStaticMarkup(<AgencyPortfolioPage />);

    expect(html).not.toContain('Manage every client environment from one operational view');
    expect(html).toContain('Northwind Systems \u00b7 client environments');
    // Live client data from the (mocked) API.
    expect(html).toContain('Meridian Health');
    expect(html).toContain('Verdant Energy');
    // The unmonitored client is "not observed", never 100%.
    expect(html).toContain('Not observed');
    expect(html).toContain('no monitors');
    // Management actions and the portal share.
    expect(html).toContain('Add client environment');
    expect(html).toContain('Open client portal');
    // Cross-client sections.
    expect(html).toContain('Active incidents across clients');
    expect(html).toContain('Recent evidence by client');
  });

  it('an explicitly enabled non-Enterprise organization sees the live portfolio', () => {
    setSession(org(true), plan('pro'));
    const html = renderToStaticMarkup(<AgencyPortfolioPage />);
    expect(html).toContain('Northwind Systems \u00b7 client environments');
    expect(html).toContain('Meridian Health');
    expect(html).toContain('Add client environment');
  });

  it('an enabled user can open a client environment and sees its scope', () => {
    setSession(org(true), plan('pro'));
    const html = renderToStaticMarkup(<ClientEnvironmentPage clientId="cli_1" />);
    expect(html).toContain('Meridian Health');
    expect(html).not.toContain('Manage every client environment from one operational view');
  });

  it('an enabled user enters the client setup sequence', () => {
    setSession(org(true), plan('pro'));
    const html = renderToStaticMarkup(<ClientSetupSequence />);
    expect(html).toContain('Establish a client environment');
    expect(html).not.toContain('Manage every client environment from one operational view');
  });
});

/* ── 5 · Command palette and top-bar scope share the same rule ───────────── */

describe('command palette', () => {
  it('lists the agency overview for a non-eligible user and nothing client-managed', () => {
    setSession(org(false), plan('free'), { commandOpen: true });
    const html = renderToStaticMarkup(<CommandPalette />);
    expect(html).toContain('Agency overview');
    expect(html).not.toContain('Client environments');
    expect(html).not.toContain('Create Client Workspace');
    expect(html).not.toContain('Client: ');
    expect(allFalse('clients')).toBe(true);
  });

  it('exposes client management to an eligible user from the same rule', () => {
    setSession(org(true), plan('pro'), { commandOpen: true });
    const html = renderToStaticMarkup(<CommandPalette />);
    expect(html).toContain('Agency overview');
    expect(html).toContain('Client environments');
    expect(html).toContain('Create Client Workspace');
    expect(html).toContain('Client: Meridian Health');
    expect(calls.clients.every((a) => a[0] === true)).toBe(true);
  });
});

describe('top bar agency/client scope control', () => {
  it('is absent for a non-eligible organization', () => {
    setSession(org(false), plan('free'));
    const html = renderToStaticMarkup(<ConsoleTopBar />);
    // The scope control prints the organization name; the closed account
    // menu does not, so the name is the scope control's signature.
    expect(html).not.toContain('Northwind Systems');
    expect(allFalse('clients')).toBe(true);
  });

  it('is present for an eligible organization and reads the clients', () => {
    setSession(org(false), plan('enterprise'));
    const html = renderToStaticMarkup(<ConsoleTopBar />);
    expect(html).toContain('Northwind Systems');
    expect(calls.clients.every((a) => a[0] === true)).toBe(true);
  });
});
