'use client';

import { AlertTriangle } from 'lucide-react';
import { RsButton } from './button';

interface Props {
  /** What failed to load, in the user's terms. Defaults to a generic label. */
  title?: string;
  body?: string;
  onRetry?: () => void;
  /** True while a refetch is in flight, so the button cannot double-submit. */
  retrying?: boolean;
}

/**
 * Rendered when a query *failed*, as opposed to succeeded with no rows.
 *
 * These two must never look the same. Before this existed, pages such as the
 * dependency list destructured only `{ data, isLoading }` from their query, so
 * a 500 produced `data === undefined` and the page rendered its empty state -
 * "No dependencies yet" - for an account that actually had dependencies. For an
 * infrastructure product that is the worst possible failure mode: the user is
 * told their system is fine when in fact we could not ask it.
 *
 * The status/reason is deliberately not rendered here. Query errors may carry a
 * backend message; surfacing it raw risks leaking internals and it is already
 * reported to the console and toast layer.
 */
export function QueryErrorState({
  title = 'Unable to load this data',
  body = 'The request failed. Your data may still be there - this is a problem reaching the API, not an empty account.',
  onRetry,
  retrying = false,
}: Props) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-rs-degraded/30 bg-rs-degraded/5 px-6 py-16 text-center"
    >
      <div className="mb-4 text-rs-degraded">
        <AlertTriangle className="h-8 w-8" aria-hidden="true" />
      </div>
      <h3 className="text-base font-medium text-rs-text">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-rs-text-secondary">{body}</p>
      {onRetry && (
        <RsButton className="mt-5" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Retry'}
        </RsButton>
      )}
    </div>
  );
}
