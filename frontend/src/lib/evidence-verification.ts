import { cache } from 'react';

/**
 * The public verification record for one evidence artifact.
 *
 * This module is the single reader of `/v1/verify/{id}`. It is separate from the
 * page because two consumers need the same answer inside one request - the
 * rendered document and its Open Graph metadata - and a `cache()`d loader is how
 * Next is told to ask once. Sharing the loader also prevents the subtler
 * failure: a page that shows one interpretation of the record while its social
 * preview shows another.
 *
 * Four outcomes, deliberately distinct, because they mean different things to
 * a reader who may be in a dispute:
 *   - `verified`    the record exists AND the service re-derived it from the
 *                   stored payload: hash re-computed, signature checked;
 *   - `unverified`  the record exists but did not verify - either the check
 *                   failed, or the record is unsigned / its payload could not be
 *                   read. Reported separately from `verified` because "we have
 *                   a record" and "the record holds" are different claims;
 *   - `not_found`   nothing matches this reference (wrong, revoked, or edited);
 *   - `unavailable` we could not answer. Never presented as "not found".
 *
 * The `verified` state used to be reached on nothing more than an HTTP 200 with
 * `found: true`, and the page rendered a green "Evidence verified" badge off
 * that. A 200 says the endpoint answered; it says nothing about whether the
 * record still holds. The backend now re-derives the verdict on every request
 * and reports it as `verified`, and this module requires that field to be
 * exactly `true` before anything claims to be verified.
 */

const BACKEND_URL =
  process.env.RELIASTRA_API_URL?.replace(/\/$/, '') || 'https://api.reliastra.com';

export interface EvidenceVerificationCheck {
  name: string;
  status: 'pass' | 'fail' | 'unavailable';
  detail?: string;
}

export interface EvidenceVerificationRecord {
  found: true;
  /** Re-derived server-side. `null` when unsigned or the payload was unreadable. */
  verified: boolean | null;
  verification_reason?: string | null;
  verification_checks?: EvidenceVerificationCheck[];
  incident_id: string;
  org_id: string;
  dependency_id: string;
  time_window: { start: string; end: string } | null;
  data_hash: string | null;
  report_checksum: string | null;
  methodology_version: string | null;
  created_at: string | null;
  authenticity: {
    signed: boolean;
    algorithm: string | null;
    encoding: string | null;
    signing_key_id: string | null;
    signature: string | null;
    signature_covers: string | null;
    public_keys: string | null;
    verified?: boolean | null;
    verification_reason?: string | null;
  };
  rendering: {
    renderer: string | null;
    renderer_version: string | null;
    file_size_bytes: number | null;
    note: string | null;
  };
  retention: {
    expires_at: string | null;
    expired: boolean | null;
    artifact_available: boolean;
    retention_days?: number | null;
  };
  verification: {
    payload: string | null;
    procedure: string[];
    note?: string | null;
  };
  report_url: string | null;
  record_url: string | null;
}

export type VerificationLoad =
  | { kind: 'verified'; record: EvidenceVerificationRecord }
  | { kind: 'unverified'; record: EvidenceVerificationRecord; reason: string }
  | { kind: 'not_found'; token: string }
  | { kind: 'unavailable'; token: string; reason: 'degraded' | 'offline' };

function shortHash(value: string | null | undefined, head = 10, tail = 8): string {
  if (!value) return 'not recorded';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Display helpers shared by the page, its metadata and the printed copy. */
export const evidenceFormat = {
  shortHash,
  stamp(value: string | null | undefined): string {
    if (!value) return 'not recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC',
      hour12: false,
    })} UTC`;
  },
  date(value: string | null | undefined): string {
    if (!value) return 'not recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  },
  bytes(value: number | null | undefined): string {
    if (value === null || value === undefined) return 'not recorded';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  },
};

async function fetchRecord(token: string): Promise<VerificationLoad> {
  const url = `${BACKEND_URL}/v1/verify/${encodeURIComponent(token)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      // A verification answer must never be served from a stale cache: a report
      // that expires, a record that is revoked and a key that rotates all change
      // the correct answer for the same URL.
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
  } catch {
    return { kind: 'unavailable', token, reason: 'offline' };
  }
  if (response.status === 404) return { kind: 'not_found', token };
  if (!response.ok) return { kind: 'unavailable', token, reason: 'degraded' };
  let payload: (EvidenceVerificationRecord & { service_degraded?: boolean }) | null = null;
  try {
    payload = await response.json();
  } catch {
    return { kind: 'unavailable', token, reason: 'degraded' };
  }
  if (!payload || payload.found !== true) {
    return payload?.service_degraded
      ? { kind: 'unavailable', token, reason: 'degraded' }
      : { kind: 'not_found', token };
  }
  // The record exists. Whether it *holds* is a separate, stricter question, and
  // the answer must be exactly `true`. `null` is a real answer meaning "unsigned,
  // or the payload could not be read", and it is not a pass.
  if (payload.verified !== true) {
    const reason =
      payload.verification_reason ||
      payload.authenticity?.verification_reason ||
      (payload.verified === null || payload.verified === undefined
        ? 'the service did not report a re-derived verdict, so nothing was checked'
        : 'the record did not match when re-derived');
    return { kind: 'unverified', record: payload, reason };
  }
  return { kind: 'verified', record: payload };
}

/**
 * One verification lookup per request, shared by the page and its metadata.
 *
 * `cache` dedupes by arguments within a render pass, so `generateMetadata` and
 * the component do not double-hit the API for the same token.
 */
export const loadVerificationRecord = cache(fetchRecord);
