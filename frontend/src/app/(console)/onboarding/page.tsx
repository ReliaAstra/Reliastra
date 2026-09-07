'use client';

import { ObservationSetupSequence } from '@/components/sequence/observation-setup';

/**
 * The observation configuration sequence.
 *
 * It renders outside the console chrome on purpose: during setup there is one
 * task, and a navigation rail full of surfaces that have no data in them yet
 * is a distraction and a small lie.
 */
export default function OnboardingPage() {
  return <ObservationSetupSequence />;
}
