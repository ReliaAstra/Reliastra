import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { agenciesNavItems, consoleNavGroups } from '../navigation';
import { hasAgencyWorkspace } from '../access';
import { CONSOLE_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import type { Organization, PlanDetails } from '@/lib/dashboard/types';

const org = (enabled: boolean, name = 'Northwind Systems') =>
  ({ id: 'org_x', name, slug: 'northwind', plan: 'pro', has_agency_mode: enabled, ai_explanations_enabled: false, created_at: '', updated_at: '' }) as Organization;
const plan = (id: 'free' | 'pro' | 'enterprise') =>
  ({ org_id: 'org_x', plan: id, effective_plan: id, subscription_status: null, price_usd: 0, max_dependencies: null, min_check_interval_seconds: null }) as PlanDetails;

/**
 * The destination model every console surface renders from.
 *
 * The requirement: Agencies is a destination for EVERY authenticated
 * organization - the overview entry must never depend on the entitlement -
 * while the client-management entries follow `hasAgencyWorkspace` exactly.
 */
describe('agenciesNavItems', () => {
  it('a Free organization without agency mode gets the overview entry', () => {
    const items = agenciesNavItems(org(false), plan('free'));
    expect(items[0]).toEqual({ href: '/agency', label: 'Agency overview' });
  });

  it('a Pro organization without agency mode gets the overview entry', () => {
    const items = agenciesNavItems(org(false), plan('pro'));
    expect(items[0]).toEqual({ href: '/agency', label: 'Agency overview' });
  });

  it('does not expose client-management destinations to a non-eligible organization', () => {
    for (const p of [plan('free'), plan('pro')] as PlanDetails[]) {
      const hrefs = agenciesNavItems(org(false), p).map((i) => i.href);
      expect(hrefs).not.toContain('/clients');
      expect(hrefs).not.toContain('/clients/onboarding');
    }
  });

  it('an Enterprise organization gets the full client hierarchy', () => {
    expect(
      agenciesNavItems(org(false), plan('enterprise')).map((i) => i.href)
    ).toEqual(['/agency', '/clients', '/clients/onboarding']);
  });

  it('an explicitly enabled non-Enterprise organization gets the full hierarchy', () => {
    expect(
      agenciesNavItems(org(true), plan('free')).map((i) => i.href)
    ).toEqual(['/agency', '/clients', '/clients/onboarding']);
    expect(
      agenciesNavItems(org(true), plan('pro')).map((i) => i.href)
    ).toEqual(['/agency', '/clients', '/clients/onboarding']);
  });

  it('the overview entry is present while session state is still loading', () => {
    expect(agenciesNavItems(null, null)[0]).toEqual({
      href: '/agency',
      label: 'Agency overview',
    });
  });
});

describe('consoleNavGroups', () => {
  it('keeps the Agencies group in the hierarchy for every entitlement', () => {
    const entitlements: Array<[Organization | null, PlanDetails | null]> = [
      [org(false), plan('free')],
      [org(false), plan('pro')],
      [org(true), plan('pro')],
      [org(false), plan('enterprise')],
      [null, null],
    ];
    for (const [o, p] of entitlements) {
      const group = consoleNavGroups(o, p).find((g) => g.label === 'Agencies');
      expect(group, 'Agencies group must exist').toBeTruthy();
      expect(group?.items[0]).toEqual({ href: '/agency', label: 'Agency overview' });
    }
  });

  it('surfaces the client destinations only where the entitlement holds', () => {
    const withClients = (o: Organization, p: PlanDetails) =>
      consoleNavGroups(o, p).find((g) => g.label === 'Agencies')?.items.map((i) => i.href);
    expect(withClients(org(false), plan('free'))).toEqual(['/agency']);
    expect(withClients(org(false), plan('enterprise'))).toEqual([
      '/agency',
      '/clients',
      '/clients/onboarding',
    ]);
  });

  it('keeps the existing console destinations and the account group intact', () => {
    const groups = consoleNavGroups(org(false), plan('free'));
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    for (const expected of [
      '/dashboard',
      '/dependencies',
      '/incidents',
      '/evidence',
      '/reports',
      '/agency',
      '/settings',
      '/settings/billing',
      '/settings/notifications',
      '/support',
    ]) {
      expect(hrefs).toContain(expected);
    }
    // The PR #40 destination was moved to /agency, not duplicated.
    expect(hrefs).not.toContain('/organization');
  });

  it('is derived from the same rule the pages use (hasAgencyWorkspace)', () => {
    const cases: Array<[Organization | null, PlanDetails | null]> = [
      [org(false), plan('free')],
      [org(false), plan('pro')],
      [org(true), plan('free')],
      [org(true), plan('pro')],
      [org(false), plan('enterprise')],
      [org(true), plan('enterprise')],
      [null, null],
    ];
    for (const [o, p] of cases) {
      const items = agenciesNavItems(o, p).map((i) => i.href);
      const eligible = hasAgencyWorkspace(o, p);
      expect(items.includes('/clients')).toBe(eligible);
      expect(items.includes('/clients/onboarding')).toBe(eligible);
      // The overview never follows the entitlement.
      expect(items[0]).toBe('/agency');
    }
  });
});

/* ── Routing: the public page, the console route, the alias ─────────────── */

const FRONTEND_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const read = (rel: string) => readFileSync(`${FRONTEND_ROOT}/${rel}`, 'utf8');

describe('agencies routing', () => {
  it('the public marketing page owns /agencies and is unchanged in shape', () => {
    const source = read('src/app/agencies/page.tsx');
    expect(source).toContain('path: \'/agencies\'');
    expect(source).toContain('For agencies & MSPs');
    expect(PUBLIC_ROUTES.agencies).toBe('/agencies');
  });

  it('the authenticated destination lives at /agency inside the console group', () => {
    expect(
      existsSync('src/app/(console)/agency/page.tsx'),
      'src/app/(console)/agency/page.tsx must exist'
    ).toBe(true);
    expect(CONSOLE_ROUTES.agency).toBe('/agency');
  });

  it('does not create a second /agencies page inside the console group', () => {
    expect(existsSync('src/app/(console)/agencies/page.tsx')).toBe(false);
  });

  it('the PR #40 /organization route redirects to /agency', () => {
    const config = read('next.config.ts');
    expect(config).toContain('"/organization"');
    expect(config).toContain('"/agency"');
    expect(existsSync('src/app/(console)/organization/page.tsx')).toBe(false);
  });

  it('existing client routes stay backward-compatible', () => {
    expect(CONSOLE_ROUTES.clients).toBe('/clients');
    expect(CONSOLE_ROUTES.clientOnboarding).toBe('/clients/onboarding');
    for (const rel of [
      'src/app/(console)/clients/page.tsx',
      'src/app/(console)/clients/[id]/page.tsx',
      'src/app/(console)/clients/onboarding/page.tsx',
    ]) {
      expect(existsSync(rel), `${rel} must exist`).toBe(true);
    }
  });
});
