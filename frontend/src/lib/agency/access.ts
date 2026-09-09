import type { Organization, PlanDetails } from '@/lib/dashboard/types';
import { effectivePlan } from '@/lib/dashboard/plans';

/**
 * One authoritative frontend rule for the multi-client workspace.
 *
 * An organization is eligible when RELIASTRA has explicitly enabled agency
 * mode or when its effective entitlement is Enterprise. The backend remains
 * authoritative for every API operation; this helper only keeps navigation,
 * routing and scope controls from disagreeing with one another.
 */
export function hasAgencyWorkspace(
  org: Organization | null | undefined,
  plan: PlanDetails | null | undefined
): boolean {
  return Boolean(org?.has_agency_mode) || effectivePlan(plan).isEnterprise;
}
