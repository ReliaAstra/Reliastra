import type { Organization, PlanDetails } from '@/lib/dashboard/types';
import { effectivePlan } from '@/lib/dashboard/plans';

/**
 * One authoritative frontend rule for the multi-client workspace.
 *
 * An organization is eligible when RELIASTRA has explicitly enabled agency
 * mode or when its effective entitlement includes client groups (Pro and
 * Enterprise - and the 14-day trial, which carries the Pro entitlement via
 * `effective_plan`). White-label branding stays Enterprise-only and is
 * gated separately. The backend remains authoritative for every API
 * operation; this helper only keeps navigation, routing and scope controls
 * from disagreeing with one another.
 */
export function hasAgencyWorkspace(
  org: Organization | null | undefined,
  plan: PlanDetails | null | undefined
): boolean {
  const effective = effectivePlan(plan);
  return (
    Boolean(org?.has_agency_mode) || effective.clientGroups || effective.isEnterprise
  );
}
