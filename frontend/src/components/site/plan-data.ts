import {
  dependencyLabel,
  intervalLabel,
  retentionLabel,
  type PlanMeta,
} from '@/lib/dashboard/plans';
import { AUTH_ROUTES } from '@/lib/routes';

/**
 * Plan presentation data, kept OUT of the client component that renders it.
 *
 * `plan-matrix.tsx` carries a `'use client'` directive, and a client module can
 * only export client references - a server component importing a plain
 * constant from it receives a proxy, not the array. These values are needed by
 * both server (`/pricing` capability table) and client (`PlanMatrix`) code, so
 * they live here, in a module with no directive at all.
 */

/**
 * Capability rows.
 *
 * Every row reads a boolean off `lib/dashboard/plans`, which mirrors the
 * backend's `app.core.permissions` entitlement table. There is no hand-written
 * feature list anywhere on the public site: if the backend does not grant a
 * capability, the UI physically cannot advertise it.
 */
export const PLAN_CAPABILITIES: {
  label: string;
  get: (p: PlanMeta) => boolean;
}[] = [
  { label: 'Custom endpoint monitoring', get: () => true },
  { label: 'Email alerts', get: () => true },
  { label: 'Incident detection', get: () => true },
  { label: 'Slack alerts', get: (p) => p.slackAlerts },
  { label: 'API access', get: (p) => p.api },
  { label: 'Deterministic attribution', get: (p) => p.attribution },
  { label: 'Evidence generation', get: (p) => p.evidence },
  { label: 'Historical analysis', get: (p) => p.historicalAnalysis },
];

/** The four limits that actually decide which plan someone picks. */
export function planLimits(p: PlanMeta): [string, string][] {
  return [
    ['Dependencies', dependencyLabel(p.dependencies)],
    ['Check interval', intervalLabel(p.minIntervalSeconds)],
    ['Retention', retentionLabel(p.retentionDays)],
    // Not `seatLabel`: that helper is written for the console's billing view,
    // where a count of seats is a real quantity to manage. On the public page
    // it produced "Team 1 seat", which describes an organisation buying
    // access for colleagues - the commercial model this product does not
    // have. One account, one engineer.
    ['Accounts', teamLabel(p.teamMembers)],
  ];
}

/** Public wording for the account count. There is no seat to buy. */
function teamLabel(count: number | null | undefined): string {
  if (count == null) return '—';
  return count === 1 ? '1 account' : `${count} accounts`;
}

export function planCta(p: PlanMeta): { href: string; label: string } {
  return {
    href: AUTH_ROUTES.signup,
    label: 'Start 14-day trial',
  };
}
