'use client';

import { Building2, Plus } from 'lucide-react';
import { RsButton } from '../ui/button';
import { EmptyState } from '../ui/empty-state';

/**
 * Clients page — Agency is temporarily disabled.
 *
 * The backend code (app/modules/agencies/) is preserved and the API will be
 * re-enabled once the dashboard-first onboarding, client hierarchy UX, and
 * client portal are ready.  Until then this page shows a clean empty state
 * with no fake data, no blurred previews, and no dead documentation links.
 */
export function ClientsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">Clients</h1>
        <p className="mt-1.5 text-sm text-rs-text-tertiary">
          Manage reliability across every client from one workspace.
        </p>
      </div>

      <EmptyState
        icon={<Building2 size={32} />}
        title="Client workspaces"
        body="Create clients, assign applications and dependencies, and share a live reliability portal with each client. This feature is being refined and will be available soon."
        actionLabel="Create client"
        onAction={() => {
          /* Agency API is temporarily disabled — button is a no-op until
             the onboarding flow and client hierarchy are ready. */
        }}
      />
    </div>
  );
}
