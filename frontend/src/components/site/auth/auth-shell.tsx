'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/site/wordmark';
import { cn } from '@/lib/utils';

/**
 * The authentication shell.
 *
 * One layout serves customer sign-in, customer sign-up, email verification,
 * password reset and the partner equivalents, so the four moments where trust
 * is most fragile look like the same company.
 *
 * Layout rules:
 * - Mobile first, genuinely. The form column is the whole page below `lg`,
 *   with a compact 56px masthead and no decorative imagery competing for
 *   vertical space above the fold. Auth on a phone is the common case.
 * - The aside is `hidden lg:block`, so its image is never requested on
 *   mobile at all.
 * - The form column is capped at 400px regardless of viewport, because a
 *   1920px-wide email field is a usability failure, not a luxury.
 *
 * Content rule: the aside may state only what the product verifiably does.
 * The previous version claimed "SOC 2-aligned controls" in a footer strip;
 * there is no such attestation, so it is gone.
 */
export function AuthShell({
  eyebrow,
  title,
  intro,
  children,
  footer,
  aside,
  image = '/media/edge-infrastructure-night.jpg',
  imageAlt = 'Night view of edge infrastructure: a lit equipment cabinet beside dark fibre trunking.',
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  aside?: ReactNode;
  image?: string;
  imageAlt?: string;
}) {
  return (
    <div className="ob flex min-h-screen flex-col lg:flex-row">
      <a href="#auth-form" className="ob-skip">
        Skip to form
      </a>

      {/* Form column */}
      <div className="flex w-full flex-col px-[var(--ob-gutter)] py-7 lg:w-[min(52%,620px)] lg:shrink-0 lg:px-16 lg:py-10">
        <div className="flex items-center justify-between gap-6">
          <Link href="/" aria-label="RELIASTRA home" className="w-fit">
            <Wordmark size="sm" />
          </Link>
          <Link
            href="/"
            className="ob-label transition-colors hover:text-[var(--ob-signal)]"
          >
            ← Back to site
          </Link>
        </div>

        <main
          id="auth-form"
          className="flex flex-1 items-center py-12 lg:py-16"
        >
          <div className="w-full max-w-[400px]">
            <p className="ob-label text-[var(--ob-signal)]">{eyebrow}</p>
            <h1 className="ob-h2 mt-4 text-[clamp(1.75rem,4vw,2.25rem)]">
              {title}
            </h1>
            {intro && (
              <div className="ob-body mt-4 text-[14.5px]">{intro}</div>
            )}
            <div className="mt-9">{children}</div>
          </div>
        </main>

        {footer && (
          <div className="border-t border-[var(--ob-line)] pt-5">{footer}</div>
        )}
      </div>

      {/* Evidence column: desktop only, so mobile never downloads it */}
      <aside className="relative hidden flex-1 overflow-hidden border-l border-[var(--ob-line)] bg-[var(--ob-base)] lg:block">
        <Image
          src={image}
          alt={imageAlt}
          fill
          sizes="50vw"
          quality={70}
          className="ob-photo object-cover object-center opacity-[0.42]"
        />
        <div className="ob-scrim-left absolute inset-0" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-14 xl:p-16">
          <p className="ob-mono text-[var(--ob-text-4)]">reliastra.com</p>
          {aside ?? <DefaultAside />}
          <p className="ob-mono text-[var(--ob-text-4)]">
            Evidence records are checksummed
          </p>
        </div>
      </aside>
    </div>
  );
}

function DefaultAside() {
  return (
    <div className="max-w-[46ch]">
      <p className="ob-label">The record</p>
      <h2 className="ob-h3 mt-4">
        When the vendor fails, the measurement already exists.
      </h2>
      <dl className="mt-10 flex flex-col">
        {[
          [
            'Independent observation',
            'Checks from infrastructure the vendor does not control, on a fixed interval.',
          ],
          [
            'Deterministic attribution',
            'Incidents correlated against observed vendor behaviour in the same window.',
          ],
          [
            'Evidence you can send',
            'Timestamped, checksummed records for a defined window. Exportable.',
          ],
        ].map(([term, desc]) => (
          <div key={term} className="border-t border-[var(--ob-line)] py-5">
            <dt className="text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--ob-text)]">
              {term}
            </dt>
            <dd className="mt-1.5 text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
              {desc}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ── Form primitives ─────────────────────────────────────────────────────── */

/**
 * A labelled text input.
 *
 * `label` is a real `<label for>` - never a placeholder standing in for one.
 * Help text and error text are wired through `aria-describedby`, and the
 * invalid state sets `aria-invalid` so it is announced rather than merely
 * coloured.
 */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col', className)}>
      <label htmlFor={id} className="ob-field-label">
        {label}
      </label>
      <input
        id={id}
        className="ob-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      {hint && (
        <p id={hintId} className="ob-help">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="ob-help text-[var(--ob-critical)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Status and error messaging.
 *
 * `role="alert"` for failures (assertive), `role="status"` for confirmations
 * (polite) - so a screen-reader user learns a sign-in failed without having
 * to go hunting for the reason.
 */
export function AuthAlert({
  tone,
  children,
}: {
  tone: 'error' | 'ok' | 'note';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'ob-alert',
        tone === 'error' && 'ob-alert-error',
        tone === 'ok' && 'ob-alert-ok',
        tone === 'note' && 'ob-alert-note'
      )}
    >
      {children}
    </div>
  );
}

/** Primary submit control with an accessible busy state. */
export function AuthSubmit({
  loading,
  children,
  loadingLabel = 'Working…',
}: {
  loading: boolean;
  children: ReactNode;
  loadingLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      className="ob-btn ob-btn-signal ob-btn-block"
    >
      {loading ? loadingLabel : children}
    </button>
  );
}
