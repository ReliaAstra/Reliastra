'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AUTH_ROUTES } from '@/lib/routes';

/**
 * Evidence release form.
 *
 * The public evidence endpoint (`POST /v1/evidence/gate`) does not hand out a
 * file from a link: it records who requested the report and returns a signed,
 * expiring download token. So the UI is a request, not a download button, and
 * it says so - claiming "download evidence" and then asking for an email is
 * the kind of small dishonesty that costs a company selling evidence its
 * credibility.
 *
 * The response is rendered exactly as the API describes it: the real expiry,
 * and the account note only when the API reports that an account was created.
 */
export function EvidenceRequest({
  incidentId,
  vendorName,
  incidentTitle,
}: {
  incidentId: string;
  vendorName: string;
  incidentTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [org, setOrg] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'error' | 'done'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    href: string;
    expiresAt: string | null;
    accountCreated: boolean;
  } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      const res = await fetch('/api/v1/evidence/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          full_name: fullName || null,
          org_name: org || null,
          incident_id: incidentId,
          vendor_name: vendorName,
        }),
      });

      if (res.status === 429) {
        setError('Too many requests from this address. Try again in a minute.');
        setState('error');
        return;
      }
      if (!res.ok) {
        setError('The evidence service could not complete this request. Try again shortly.');
        setState('error');
        return;
      }

      const data = (await res.json()) as {
        download_url?: string;
        report_token?: string;
        expires_at?: string;
        account_created?: boolean;
      };

      // Prefer the same-origin proxy path: the absolute URL the API returns
      // points at the API host, which a browser behind a preview or corporate
      // proxy may not be able to reach.
      const href = data.report_token
        ? `/api/v1/evidence/${encodeURIComponent(data.report_token)}/download`
        : (data.download_url ?? '');

      if (!href) {
        setError('The evidence service did not return a download location.');
        setState('error');
        return;
      }

      setResult({
        href,
        expiresAt: data.expires_at ?? null,
        accountCreated: !!data.account_created,
      });
      setState('done');
    } catch {
      setError('The request could not be sent. Check your connection and try again.');
      setState('error');
    }
  }

  if (state === 'done' && result) {
    return (
      <div className="border-t border-[var(--ob-line)] pt-4">
        <p className="ob-label obs-label-ok mb-2">Evidence record released</p>
        <p className="mb-3 max-w-[62ch] text-[13px] leading-[1.6] text-[var(--ob-text-2)]">
          The signed report for {incidentTitle} is ready.
          {result.expiresAt
            ? ` The link expires ${new Date(result.expiresAt).toUTCString().replace('GMT', 'UTC')}.`
            : ''}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <a className="ob-btn ob-btn-outline ob-btn-sm" href={result.href}>
            Open the evidence report
          </a>
          {result.accountCreated && (
            <Link className="ob-link text-[13px]" href={AUTH_ROUTES.login}>
              An organization was created for this address - sign in
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="ob-btn ob-btn-outline ob-btn-sm self-start"
        onClick={() => setOpen(true)}
      >
        Request the evidence record
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-[var(--ob-line)] pt-4">
      <p className="max-w-[62ch] text-[13px] leading-[1.6] text-[var(--ob-text-3)]">
        The report for {incidentTitle} is released against a named requester. RELIASTRA records the
        address the report was issued to; the report itself is signed and the link expires.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="ob-field-label">Work email</span>
          <input
            className="ob-input"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="ob-field-label">Name (optional)</span>
          <input
            className="ob-input"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="ob-field-label">Organization (optional)</span>
          <input
            className="ob-input"
            type="text"
            autoComplete="organization"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
          />
        </label>
      </div>
      {state === 'error' && (
        <p className="ob-help" data-error="true" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="ob-btn ob-btn-signal ob-btn-sm" disabled={state === 'sending'}>
          {state === 'sending' ? 'Requesting…' : 'Release the report'}
        </button>
        <button
          type="button"
          className="ob-link text-[13px]"
          onClick={() => {
            setOpen(false);
            setState('idle');
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
