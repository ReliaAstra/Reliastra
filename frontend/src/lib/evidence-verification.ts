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
 * Three outcomes, deliberately distinct, because they mean different things to
 * a reader who may be in a dispute:
 *   - `verified`    the record exists, with its hashes, signature and retention;
 *   - `not_found`   nothing matches this reference (wrong, revoked, or edited);
 *   - `unavailable` we could not answer. Never presented as "not found".
 */

const BACKEND_URL =
  process.env.RELIASTRA_API_URL?.replace(/\/$/, '') || 'https://api.reliastra.com';

export interface EvidenceVerificationRecord {
  found: true;
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
  };
  report_url: string | null;
  record_url: string | null;
}

export type VerificationLoad =
  | { kind: 'verified'; record: EvidenceVerificationRecord }
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
  return { kind: 'verified', record: payload };
}

/**
 * One verification lookup per request, shared by the page and its metadata.
 *
 * `cache` dedupes by arguments within a render pass, so `generateMetadata` and
 * the component do not double-hit the API for the same token.
 */
export const loadVerificationRecord = cache(fetchRecord);
