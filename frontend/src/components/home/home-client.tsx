import type { ReactNode } from 'react';

/** Marketing never bootstraps or activates a partner account. */
export function HomeClient({ landing }: { landing: ReactNode }) {
  return <>{landing}</>;
}
