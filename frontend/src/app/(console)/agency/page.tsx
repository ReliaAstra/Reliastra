'use client';

import { AgencyPortfolioPage } from '@/components/agency/portfolio';

/**
 * Agency operations overview - the always-visible, first-class Agencies
 * destination of the customer console (sidebar label "Agencies").
 *
 * The public marketing page owns `/agencies`; this route is the
 * authenticated parent-level destination:
 *
 *   Agency overview (/agency)
 *     ├── Client environments (/clients)
 *     ├── Individual client environment (/clients/[id])
 *     └── Add client environment (/clients/onboarding)
 *
 * Organizations without the capability render the gated experience from the
 * same component - the route never 404s and never fabricates data.
 */
export default function AgencyPage() {
  return <AgencyPortfolioPage />;
}
