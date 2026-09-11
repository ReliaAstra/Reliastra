/**
 * Formatting and state derivation for the public observatory.
 *
 * The single rule this file exists to enforce: a value that was not measured
 * is never printed as a number. Every formatter returns a sentinel string the
 * UI renders in a muted style, and the sentinels are distinct because the
 * facts are distinct - "no observation" (nothing was recorded), "no data"
 * (the field came back empty), "not recorded" (the API does not carry it).
 *
 * Two backend behaviours are compensated for here, deliberately:
 *
 *  1. `get_endpoint_stats` returns `uptime_percentage: 100.0` when there are
 *     zero observations in the window. Printing "100%" for a vendor nobody has
 *     measured is the exact failure mode this product exists to argue against,
 *     so availability is only ever formatted together with its observation
 *     count, and zero observations formats as "insufficient data".
 *  2. Latency aggregates come back as `0` when there is nothing to average.
 *     Zero milliseconds is not a measurement, so it formats as "no data".
 */

export const NO_OBSERVATION = 'no observation';
export const NO_DATA = 'no data';
export const NOT_RECORDED = 'not recorded';
export const INSUFFICIENT = 'insufficient data';

/* ── Time ───────────────────────────────────────────────────────────────── */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** `18:51:08` - the observation clock, always UTC, always to the second. */
export function utcClock(iso: string | null | undefined): string | null {
  const d = parse(iso);
  if (!d) return null;
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** `07 Sep 2026 18:51:08 UTC` - a timestamp in a record, unambiguous. */
export function utcStamp(iso: string | null | undefined): string | null {
  const d = parse(iso);
  if (!d) return null;
  return (
    `${p2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ` +
    `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} UTC`
  );
}

/** `07 Sep 2026` */
export function utcDate(iso: string | null | undefined): string | null {
  const d = parse(iso);
  if (!d) return null;
  return `${p2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `07 Sep 18:51:08` - a timestamp in a column where the year is redundant. */
export function utcCompact(iso: string | null | undefined): string | null {
  const d = parse(iso);
  if (!d) return null;
  return (
    `${p2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ` +
    `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`
  );
}

/** `18:51` - axis and window labels. */
export function utcShort(iso: string | null | undefined): string | null {
  const d = parse(iso);
  if (!d) return null;
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

export function msSince(iso: string | null | undefined, now = Date.now()): number | null {
  const d = parse(iso);
  if (!d) return null;
  return Math.max(0, now - d.getTime());
}

/** `4s` / `18m` / `3h 04m` / `9d` - elapsed time, never rounded up to a lie. */
export function elapsed(iso: string | null | undefined, now = Date.now()): string {
  const ms = msSince(iso, now);
  if (ms === null) return NO_OBSERVATION;
  return duration(ms / 1000);
}

/** Seconds to a compact human duration. */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return NO_DATA;
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${p2(m % 60)}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/* ── Measurements ───────────────────────────────────────────────────────── */

/** Latency in ms. Zero is not a measurement - see the file header. */
export function latency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return NO_DATA;
  if (ms < 10) return ms.toFixed(1);
  return Math.round(ms).toLocaleString('en-US');
}

/**
 * Availability for a window. `observations` is required, because the API
 * reports 100% for an empty window and this is the only place that fact can
 * be caught before it reaches a reader.
 */
export function availability(
  percentage: number | null | undefined,
  observations: number | null | undefined
): string {
  if (!observations || observations <= 0) return INSUFFICIENT;
  if (percentage === null || percentage === undefined || !Number.isFinite(percentage)) {
    return NO_DATA;
  }
  return `${percentage.toFixed(2)}%`;
}

export function count(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NO_DATA;
  return Math.round(n).toLocaleString('en-US');
}

export function statusCode(code: number | null | undefined): string {
  if (code === null || code === undefined || !Number.isFinite(code)) return NO_DATA;
  return String(code);
}

/* ── Windows ────────────────────────────────────────────────────────────── */

export const WINDOW_LABEL: Record<string, string> = {
  '1h': '1 hour',
  '6h': '6 hours',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

export const RESOLUTION_LABEL: Record<string, string> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '15m': '15 minutes',
  '1h': '1 hour',
  '6h': '6 hours',
};

export function windowLabel(w: string): string {
  return WINDOW_LABEL[w] ?? w;
}

/* ── Observed state ─────────────────────────────────────────────────────── */

export type ObservedState = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface StateVerdict {
  state: ObservedState;
  /** The word printed at the top of the record. */
  word: string;
  /** One plain sentence saying exactly what was observed, and nothing more. */
  qualifier: string;
}

/**
 * Derive the state of the record from the two facts the API returns, in
 * precedence order:
 *
 *  1. `recent_status === 'stale'` from the measurement API: the newest
 *     stored observation is older than the API's 15-minute staleness
 *     threshold. Freshness is a precondition of every other claim - a state
 *     word printed over hours-old data is the exact failure mode this record
 *     exists to prevent, so `stale` outranks even a failed latest observation
 *     (which, being old, describes the past, not the present).
 *  2. The most recent observation itself (`current.is_up`). A failed latest
 *     observation is the strongest, most current signal there is.
 *  3. The rolled-up `recent_status` over the last five observations.
 *
 * When neither exists the state is `unknown`. There is no fallback to
 * "operational": an absence of observations is not health.
 *
 * The wording below tracks the probe's actual success rule for public
 * records: the scheduled probe expects the endpoint's configured status
 * (HTTP 200 for every seeded public vendor endpoint) within a 15-second
 * deadline. A response with any other status, a transport error or a timeout
 * is recorded as a failed observation. "A valid response" and "the vendor is
 * operational" are therefore not the same statement, and only the first is
 * ever printed.
 */
export function deriveState(
  recentStatus: string | null | undefined,
  current: { is_up: boolean | null; timestamp: string | null } | null | undefined
): StateVerdict {
  const rolled = (recentStatus ?? '').toLowerCase();
  const hasCurrent = !!current && current.timestamp !== null && current.is_up !== null;

  if (rolled === 'stale') {
    return {
      state: 'unknown',
      word: 'Not observed recently',
      qualifier:
        'The newest stored observation is older than the measurement API’s 15-minute staleness ' +
        'threshold, so no current state is reported. The observations below are historical ' +
        'facts, not a statement about right now.',
    };
  }

  if (hasCurrent && current!.is_up === false) {
    return {
      state: 'critical',
      word: 'Not responding',
      qualifier:
        'The most recent observation did not receive the expected response from this endpoint.',
    };
  }

  // The vendor detail endpoint reports operational / degraded / unknown, but
  // other producers of this field (and older records) use down-style words.
  // Mapping them is not an interpretation: it is the same claim in another
  // vocabulary, and dropping it to "unknown" would understate a failure.
  if (['down', 'outage', 'critical', 'unavailable', 'offline'].includes(rolled)) {
    return {
      state: 'critical',
      word: 'Not responding',
      qualifier:
        'The most recent observations recorded no expected response from this endpoint.',
    };
  }

  if (rolled === 'degraded') {
    return {
      state: 'degraded',
      word: 'Degraded',
      qualifier:
        'At least one of the five most recent observations recorded a timeout, a transport ' +
        'error, or a status other than the one the probe expects.',
    };
  }

  if (rolled === 'operational') {
    return {
      state: 'healthy',
      word: 'Responding',
      qualifier:
        'The five most recent observations each received the expected response from this ' +
        'endpoint within its deadline.',
    };
  }

  if (hasCurrent && current!.is_up === true) {
    return {
      state: 'healthy',
      word: 'Responding',
      qualifier:
        'The most recent observation received the expected response from this endpoint.',
    };
  }

  return {
    state: 'unknown',
    word: 'No observations',
    qualifier:
      'No completed observation has been recorded for this dependency yet, so no state can be reported.',
  };
}

/** Severity as the incidents module writes it. */
export const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
};

export const INCIDENT_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  investigating: 'Investigating',
  resolved: 'Resolved',
  false_positive: 'Withdrawn',
};

/**
 * Severity maps onto the state palette, but only for the two levels that
 * warrant colour. A minor incident renders neutral: spending red and amber on
 * every severity is how a colour language stops meaning anything.
 */
export function severityState(severity: string): ObservedState {
  const s = severity.toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'major') return 'degraded';
  return 'unknown';
}

/** `https://api.stripe.com/v1/charges` -> `HTTPS` / `api.stripe.com`. */
export function endpointParts(url: string): { protocol: string; host: string; path: string } {
  try {
    const u = new URL(url);
    return {
      protocol: u.protocol.replace(':', '').toUpperCase(),
      host: u.host,
      path: u.pathname === '/' ? '/' : u.pathname,
    };
  } catch {
    return { protocol: NOT_RECORDED, host: url, path: '' };
  }
}
