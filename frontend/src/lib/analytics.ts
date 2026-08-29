'use client';

/**
 * Minimal analytics for onboarding — mirrors existing `app.modules.analytics` conventions.
 * No heavy SDK. Every event is also logged to console in dev so QA can verify.
 * If a backend endpoint exists, it is called best-effort; failures never block UX.
 */
type Props = Record<string, string | number | boolean | null | undefined>;

const ENDPOINT = '/api/v1/analytics/events';

async function send(event: string, props: Props = {}) {
  if (typeof window === 'undefined') return;
  // dev visibility
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug(`[analytics] ${event}`, props);
  }
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, props, ts: new Date().toISOString() }),
      keepalive: true,
    });
  } catch {
    // best-effort
  }
}

export const analytics = {
  onboardingStarted: (p?: Props) => send('onboarding_started', p),
  contextCompleted: (p?: Props) => send('context_completed', p),
  dependencySetupStarted: (p?: Props) => send('dependency_setup_started', p),
  dependencyCreated: (p?: Props) => send('dependency_created', p),
  firstObservationReceived: (p?: Props) => send('first_observation_received', p),
  alertsEnabled: (p?: Props) => send('alerts_enabled', p),
  evidenceViewed: (p?: Props) => send('evidence_viewed', p),
  secondDependencyAdded: (p?: Props) => send('second_dependency_added', p),
  teamInviteStarted: (p?: Props) => send('team_invite_started', p),
  onboardingCompleted: (p?: Props) => send('onboarding_completed', p),
  upgradeViewed: (p?: Props) => send('upgrade_viewed', p),
  upgradeStarted: (p?: Props) => send('upgrade_started', p),
  onboardingAbandoned: (p?: Props) => send('onboarding_abandoned', p),
};
