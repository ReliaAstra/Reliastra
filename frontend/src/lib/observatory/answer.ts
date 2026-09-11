import type { TrackCurrent, TrackWindowMetrics } from '@/lib/track-api';
import {
  availability,
  latency,
  NO_OBSERVATION,
  statusCode,
  utcStamp,
  type StateVerdict,
} from '@/lib/observatory/format';

/**
 * The direct answer to “is {vendor} down right now?”, composed only from
 * fields the measurement API returned.
 *
 * This module exists because the sentence it builds is the most load-bearing
 * text on the site: it is what a human reads during an incident and what an
 * answer engine will quote. Two rules govern it:
 *
 *  1. Every number and timestamp must exist in the input. Nothing here
 *     computes a figure, guesses a region, or softens an absence - a missing
 *     field renders as the same "no data" wording the rest of the record uses.
 *  2. The answer is scoped to the *observed endpoint*, never to the vendor's
 *     whole service estate. An outside observer of `status.openai.com` is not
 *     an observer of the OpenAI API, and this text never implies it is.
 */

export interface AnswerInput {
  /** Vendor display name, exactly as the API returns it. */
  name: string;
  /** Host of the primary observed endpoint, e.g. `status.openai.com`. */
  endpointHost: string | null;
  /** Regions the record is observed from (deduplicated, as the API declares). */
  regions: string[];
  /** State verdict derived by `deriveState`. */
  verdict: StateVerdict;
  /** The freshest completed observation across regions, when one exists. */
  current: TrackCurrent | null;
  /** 24h window metrics as the API aggregates them, when the endpoint answered. */
  window24h: TrackWindowMetrics | null | undefined;
  /** Measured observation interval in seconds, when derivable. */
  cadenceSeconds: number | null;
}

export interface BuiltAnswer {
  /** The question, phrased the way people type it. */
  question: string;
  /** One leading sentence: the direct answer for the current state. */
  lead: string;
  /** Supporting measured facts, each a complete crawlable sentence. */
  facts: string[];
  /** Scope statements that keep the answer honest. */
  caveats: string[];
}

const regionPhrase = (regions: string[]): string =>
  regions.length ? regions.join(', ') : 'no observation regions declared';

/** `an OpenAI` vs `a Stripe` - a grammar detail worth getting right in prose. */
export function articleFor(word: string): string {
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

export function buildIsDownAnswer(input: AnswerInput): BuiltAnswer {
  const { name, endpointHost, regions, verdict, current, window24h, cadenceSeconds } = input;
  const host = endpointHost ?? 'the listed endpoint';
  const observed = `${articleFor(name)} ${name} endpoint observation`;

  const lead = (() => {
    switch (verdict.state) {
      case 'healthy':
        return `No sign of it right now: the five most recent RELIASTRA observations of ${host} all received the expected response. This measures the endpoint, not all of ${name} - the scope is stated below.`;
      case 'degraded':
        return `Signs of degradation: at least one of the five most recent RELIASTRA observations of ${host} did not receive the expected response.`;
      case 'critical':
        return `The endpoint ${name} is observed at is not responding: the latest RELIASTRA check of ${host} did not receive the expected response. Whether ${name}’s services are affected is a separate question this record does not answer alone.`;
      case 'unknown':
        if (verdict.word === 'Not observed recently') {
          return `Unknown - RELIASTRA’s ${observed} has gone stale, so no current state is reported rather than an old one.`;
        }
        return `Unknown - ${observed} does not exist yet, so there is nothing to report either way.`;
    }
  })();

  const facts: string[] = [];
  if (current?.timestamp) {
    facts.push(
      `Latest observation: ${utcStamp(current.timestamp) ?? NO_OBSERVATION} - HTTP ` +
        `${statusCode(current.status_code)} in ${latency(current.latency_ms)} ms` +
        `${regions.length ? ` from ${regions.join(', ')}` : ''}.`
    );
  } else {
    facts.push(`Latest observation: ${NO_OBSERVATION}.`);
  }

  const m24 = window24h ?? null;
  facts.push(
    `Last 24 hours: ${
      m24
        ? `${m24.total_observations.toLocaleString('en-US')} observation${
            m24.total_observations === 1 ? '' : 's'
          }, availability ${availability(m24.uptime_percentage, m24.total_observations)}, mean response ${latency(
            m24.avg_latency_ms
          )} ms`
        : 'the metrics endpoint did not answer, so no window is reported'
    }. ${
      cadenceSeconds
        ? `Checks arrive about every ${cadenceSeconds} seconds per region.`
        : 'The observation cadence is not derivable from the current window.'
    }`
  );

  const caveats = [
    `This record measures the HTTP behaviour of ${host} - the endpoint RELIASTRA probes for ${name}. ` +
      `It is not a statement that every ${name} service is operational, and an operational endpoint ` +
      `is not a statement about your own integration, your traffic path, or your API key.`,
    `Vendor-reported status is separate: RELIASTRA does not ingest, mirror or reconcile ${name}’s own status reporting, ` +
      `so the two records can legitimately disagree. Read both; only one of them is independent of ${name}.`,
  ];

  return {
    question: `Is ${name} down?`,
    lead,
    facts,
    caveats,
  };
}
