import { describe, expect, it } from 'vitest';
import { consoleNavGroups } from '../navigation';
import { CONSOLE_ROUTES } from '@/lib/routes';
import type { Organization, PlanDetails } from '@/lib/dashboard/types';

const org = (name = 'Solo Engineer') =>
  ({ id: 'org_x', name, slug: 'solo', plan: 'pro', has_agency_mode: false, ai_explanations_enabled: false, created_at: '', updated_at: '' }) as Organization;
const plan = (id: 'free' | 'pro' | 'enterprise') =>
  ({ org_id: 'org_x', plan: id, effective_plan: id, subscription_status: null, price_usd: 0, max_dependencies: null, min_check_interval_seconds: null }) as PlanDetails;

/**
 * The destination model every console surface renders from.
 *
 * The developer-first console has no Agencies group and no client-facing
 * reports destination: those B2B surfaces are unmounted (stage 1 of the
 * two-stage removal). The core monitoring/evidence/account destinations
 * must always be present, for every plan, with no entitlement branching.
 */
describe('consoleNavGroups', () => {
  it('exposes the monitoring destinations for every plan', () => {
    for (const p of ['free', 'pro', 'enterprise'] as const) {
      const groups = consoleNavGroups(org(), plan(p));
      const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
      expect(hrefs).toContain('/dashboard');
      expect(hrefs).toContain('/dependencies');
      expect(hrefs).toContain('/incidents');
      expect(hrefs).toContain('/evidence');
      expect(hrefs).toContain('/settings');
      expect(hrefs).toContain('/settings/billing');
    }
  });

  it('never advertises the unmounted B2B destinations', () => {
    const groups = consoleNavGroups(org(), plan('pro'));
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain('/agency');
    expect(hrefs).not.toContain('/clients');
    expect(hrefs).not.toContain('/reports');
    expect(hrefs.some((h) => h.startsWith('/clients/'))).toBe(false);
  });

  it('has no group whose routes were removed from the route table', () => {
    const groups = consoleNavGroups(org(), plan('enterprise'));
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    for (const href of hrefs) {
      const known = (Object.values(CONSOLE_ROUTES) as readonly string[]).includes(href);
      // '/support' lives inside the (console) group but is a public route.
      expect(known || href === '/support').toBe(true);
    }
  });
});
