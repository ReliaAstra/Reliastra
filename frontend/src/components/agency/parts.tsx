'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCreateClient } from '@/lib/dashboard/queries';
import { PUBLIC_ROUTES } from '@/lib/routes';
import { Fact, PageHead, Section } from '@/components/console/primitives';

/* ═══════════════════════════════════════════════════════════════════════════
   Shared agency parts: the capability notice, the client dialog, the portal
   share control. Kept out of the page files so the portfolio and the client
   environment read as documents rather than as component soup.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Agency mode is a capability, not a paywall.
 *
 * When `has_agency_mode` is false the nav entry does not exist at all; this is
 * what a direct navigation lands on. It states the fact and how the capability
 * is enabled — it does not quote a price, imply a plan, or dress a missing
 * feature up as an upgrade opportunity, because nothing in the billing system
 * sells agency mode.
 */
export function AgencyUnavailable() {
  return (
    <>
      <PageHead
        eyebrow="Agency operations"
        title="Multi-client operations is not enabled for this organization"
      />
      <Section title="What this capability is" id="agency-capability">
        <div className="max-w-[76ch] space-y-4 text-[13px] leading-[1.7] text-[var(--obc-text-2)]">
          <p>
            Agency mode groups the dependencies you already monitor into client
            environments. Each environment owns its applications and monitors, and rolls
            up its own availability, incidents and evidence — so an operator running
            infrastructure for several organizations can see which client needs attention
            without switching accounts.
          </p>
          <p>
            It is a capability flag on your organization rather than a plan feature. Your
            monitors, incidents and evidence records are unaffected either way: enabling
            agency mode adds the client hierarchy on top of them, and nothing already
            recorded is moved or re-scoped.
          </p>
        </div>
        <dl className="mt-6 grid gap-x-10 gap-y-4 border-t border-[var(--obc-line)] pt-5 sm:grid-cols-2">
          <div>
            <dt className="obc-label">Enable it</dt>
            <dd className="mt-1.5 text-[12.5px] text-[var(--obc-text-2)]">
              <Link className="obc-link" href={PUBLIC_ROUTES.contact}>
                Contact RELIASTRA
              </Link>{' '}
              — agency mode is switched on per organization.
            </dd>
          </div>
          <div>
            <dt className="obc-label">In the meantime</dt>
            <dd className="mt-1.5 text-[12.5px] text-[var(--obc-text-2)]">
              <Link className="obc-link" href="/dependencies">
                Your dependencies
              </Link>{' '}
              and{' '}
              <Link className="obc-link" href="/evidence">
                evidence records
              </Link>{' '}
              work exactly as they do for any organization.
            </dd>
          </div>
        </dl>
      </Section>
    </>
  );
}

/* ── Client creation ─────────────────────────────────────────────────────── */

/**
 * Creating a client environment is two fields and a consequence, stated.
 * Focus is trapped to the dialog, Escape closes it, and the first field is
 * focused on open — the same contract as every other console dialog.
 */
export function ClientCreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useCreateClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('A client environment needs a name.');
      return;
    }
    try {
      const client = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onCreated(client.id);
    } catch {
      setError(
        'The client environment could not be created. Check your permissions and try again.'
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-[rgb(8_9_10_/_0.72)] p-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-dialog-title"
        className="w-full max-w-[480px] border border-[var(--obc-line-2)] bg-[var(--obc-base)]"
      >
        <div className="border-b border-[var(--obc-line)] px-5 py-4">
          <p className="obc-label">Agency operations</p>
          <h2 id="client-dialog-title" className="obc-h2 mt-1.5">
            New client environment
          </h2>
        </div>
        <form onSubmit={submit} className="px-5 py-5">
          <div className="space-y-4">
            <div>
              <label className="obc-field-label" htmlFor="client-name">
                Client name
              </label>
              <input
                ref={firstField}
                id="client-name"
                className="obc-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={150}
                required
                autoComplete="off"
              />
            </div>
            <div>
              <label className="obc-field-label" htmlFor="client-description">
                Description (optional)
              </label>
              <input
                id="client-description"
                className="obc-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                placeholder="What this environment covers"
                autoComplete="off"
              />
            </div>
          </div>

          <p className="mt-4 border-t border-[var(--obc-line)] pt-4 text-[12px] leading-[1.6] text-[var(--obc-text-3)]">
            The environment starts empty. You then add applications to it and attach
            monitors to those applications — that hierarchy is what produces the client&apos;s
            availability rollup, incident attribution and evidence.
          </p>

          {error && (
            <p role="alert" className="mt-3 text-[12px] text-[#E58C85]">
              {error}
            </p>
          )}

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-[var(--obc-line)] pt-4">
            <button type="button" className="obc-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="obc-btn obc-btn-primary"
              disabled={create.isPending}
            >
              {create.isPending ? 'Creating…' : 'Create environment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Portfolio share ─────────────────────────────────────────────────────── */

/**
 * The portfolio portal is a real, signed, read-only page at
 * `/portal/{share_token}` covering every client in this organization — so it
 * is offered at agency level and never on a single client, where it would
 * imply an isolation the link does not have.
 */
export function PortfolioShare({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const href = `/portal/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link href={href} className="obc-btn obc-btn-sm" target="_blank" rel="noopener noreferrer">
        Open client portal
      </Link>
      <button type="button" className="obc-btn obc-btn-sm" onClick={copy}>
        {copied ? 'Link copied' : 'Copy portal link'}
      </button>
    </div>
  );
}

/* ── Small shared bits ───────────────────────────────────────────────────── */

export function MetaFact({ label, value }: { label: string; value: string | number }) {
  return <Fact label={label} value={value} />;
}
