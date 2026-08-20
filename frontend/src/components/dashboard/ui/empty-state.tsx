'use client';

import type { ReactNode } from 'react';
import { RsButton } from './button';

interface Props {
  icon: ReactNode;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  helpLabel?: string;
  onHelp?: () => void;
}

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  helpLabel,
  onHelp,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-rs-border-subtle bg-rs-elevated px-6 py-16 text-center">
      <div className="mb-4 text-rs-text-tertiary">{icon}</div>
      <h3 className="text-base font-medium text-rs-text">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-rs-text-secondary">{body}</p>
      {actionLabel && onAction && (
        <RsButton className="mt-5" onClick={onAction}>
          {actionLabel}
        </RsButton>
      )}
      {helpLabel && onHelp && (
        <button
          type="button"
          onClick={onHelp}
          className="mt-3 text-sm text-rs-text-accent hover:underline"
        >
          {helpLabel}
        </button>
      )}
    </div>
  );
}
