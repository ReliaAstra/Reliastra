import { describe, expect, it } from 'vitest';
import { hasAgencyWorkspace } from '../access';
import type { Organization, PlanDetails } from '@/lib/dashboard/types';

const org = (enabled: boolean) => ({ has_agency_mode: enabled } as Organization);
const plan = (id: 'free' | 'pro' | 'enterprise') => ({
  plan: id,
  effective_plan: id,
} as PlanDetails);

describe('hasAgencyWorkspace', () => {
  it('allows an explicitly enabled organization on any plan', () => {
    expect(hasAgencyWorkspace(org(true), plan('free'))).toBe(true);
    expect(hasAgencyWorkspace(org(true), plan('pro'))).toBe(true);
  });

  it('allows an Enterprise organization without a separate capability flag', () => {
    expect(hasAgencyWorkspace(org(false), plan('enterprise'))).toBe(true);
  });

  it('does not expose the workspace to an unflagged non-Enterprise organization', () => {
    expect(hasAgencyWorkspace(org(false), plan('free'))).toBe(false);
    expect(hasAgencyWorkspace(org(false), plan('pro'))).toBe(false);
  });

  it('fails closed while organization and entitlement state are unavailable', () => {
    expect(hasAgencyWorkspace(null, null)).toBe(false);
  });
});
