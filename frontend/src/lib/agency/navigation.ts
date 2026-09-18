import type { Organization, PlanDetails } from '@/lib/dashboard/types';

/**
 * One destination model for the whole authenticated console.
 *
 * The desktop rail, the mobile sheet, the command palette and the recent
 * destinations all render from this list, so no surface can start advertising
 * a destination another one does not serve.
 *
 * The developer-first console has no Agencies group and no client-facing
 * reports destination: those B2B surfaces are unmounted (stage 1 of a
 * two-stage removal). The signature keeps the org/plan arguments so callers
 * do not need to change again in stage 2.
 */

export interface ConsoleNavItem {
  href: string;
  label: string;
}

export interface ConsoleNavGroup {
  /** Empty label = items render without a group heading (the root entry). */
  label: string;
  items: ConsoleNavItem[];
}

export function consoleNavGroups(
  _org: Organization | null | undefined,
  _plan: PlanDetails | null | undefined
): ConsoleNavGroup[] {
  return [
    { label: '', items: [{ href: '/dashboard', label: 'Overview' }] },
    {
      label: 'Monitoring',
      items: [
        { href: '/dependencies', label: 'Dependencies' },
        { href: '/incidents', label: 'Incidents' },
      ],
    },
    {
      label: 'Evidence',
      items: [{ href: '/evidence', label: 'Evidence records' }],
    },
    {
      label: 'Account',
      items: [
        { href: '/settings', label: 'Settings' },
        { href: '/settings/developer', label: 'Developer' },
        { href: '/settings/billing', label: 'Billing' },
        { href: '/settings/notifications', label: 'Notifications' },
        { href: '/support', label: 'Support' },
      ],
    },
  ];
}
