import {
  answerInputFromRecord,
  buildIsDownAnswer,
  type AnswerInput,
  type BuiltAnswer,
} from '@/lib/observatory/answer';
import {
  readVendorRecord,
  RecordUnreadableError,
  type TrackCurrent,
  type UnreadableReason,
  type VendorRecord,
} from '@/lib/track-api';
import { PUBLIC_ROUTES, SHARE_ROUTES, researchRoute } from '@/lib/routes';
import { canonicalUrl } from '@/lib/seo';

/**
 * The question engine.
 *
 * "Is {vendor} down?" is the question people actually type, and RELIASTRA
 * has a measured answer for it - composed by `lib/observatory/answer` from
 * the vendor record the observatory already renders. This module makes that
 * answer addressable: it owns which public questions exist as URLs, how a
 * question slug resolves to a subject, and what the answer page (and its
 * JSON twin) publish.
 *
 * Design constraints this module exists to keep:
 *
 * - **One answer, everywhere.** The question page composes through
 *   `answerInputFromRecord` + `buildIsDownAnswer` - the exact functions the
 *   dependency record's masthead uses. A reader comparing the two surfaces
 *   must find one answer, not two opinions.
 * - **Finite, curated URL set.** A subject exists exactly when the vendor
 *   record exists. No parameters, no slugs derived from ids, no
 *   approximations: a slug the catalog does not name is a 404, and a
 *   category slug is not a subject at all ("is payments down?" is not a
 *   question a measurement of endpoints answers).
 * - **The same three-way read contract as every observatory surface.** ok
 *   renders 200 `index`; missing 404s `noindex`; unreadable throws so the
 *   error boundary answers 5xx and the URL keeps its indexability - a
 *   timeout must never be able to withdraw a published answer.
 * - **Extensible by registration.** v1 answers one question kind. A second
 *   kind (a per-endpoint question, a regional question) joins as one more
   * definition in `QUESTION_KINDS` with its own slug grammar and loader -
 *   it does not get to fork the read contract, the sidecar shape, or the
 *   indexability rules, which live here once.
 */

export type QuestionKind = 'is-down';

/**
 * Slug grammar shared by every question kind: the subject is lowercased and
 * trimmed (URLs arrive in any casing), and an empty subject is no subject.
 * A `null` result means "this URL does not name a question", which is a 404.
 */
export function normalizeSubject(raw: string): string | null {
  const subject = raw.trim().toLowerCase();
  return subject ? subject : null;
}

/** The canonical URL of one vendor's direct-answer page. */
export function vendorQuestionPath(vendor: string): string {
  return SHARE_ROUTES.vendorQuestion(vendor);
}

/**
 * A resolved question: the record the answer was composed from (so the page
 * can link the full measurement and state what was measured), the composed
 * answer, and the input it was built from (the page prints the derived
 * verdict without re-deriving it).
 */
export interface ResolvedQuestion {
  kind: QuestionKind;
  /** The normalized subject - the catalog slug the answer is about. */
  vendor: string;
  record: VendorRecord;
  input: AnswerInput;
  answer: BuiltAnswer;
}

export type QuestionLoad =
  | { kind: 'ok'; question: ResolvedQuestion }
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: UnreadableReason };

/**
 * Resolve one `/down/{slug}` URL to its answer.
 *
 * The only read is `readVendorRecord` - the same composed, throttled fan-out
 * the record page uses. No question-specific backend surface exists, and
 * none should: the public site consumes canonical domain APIs.
 */
export async function loadVendorQuestion(rawVendor: string): Promise<QuestionLoad> {
  const vendor = normalizeSubject(rawVendor);
  if (!vendor) return { kind: 'missing' };

  const read = await readVendorRecord(vendor);
  if (read.kind === 'missing') return { kind: 'missing' };
  if (read.kind === 'unreadable') {
    return { kind: 'unreadable', reason: read.reason };
  }

  const record = read.value;
  const input = answerInputFromRecord(record);
  return {
    kind: 'ok',
    question: {
      kind: 'is-down',
      vendor,
      record,
      input,
      answer: buildIsDownAnswer(input),
    },
  };
}

/**
 * The machine-readable twin of the answer page: the same composed answer the
 * HTML rendered, plus the pointers a machine needs. Pure mapper over a
 * completed load, so the content decisions are testable without network I/O.
 *
 * Every field is a stored value or a composition of stored values - the
 * `as_of` stamp is the freshest observation's own timestamp (or null when
 * none exists), never the time the sidecar was served.
 */
export type QuestionSidecar =
  | { status: 200; document: Record<string, unknown> }
  | { status: 404; document: Record<string, never> };

export function vendorQuestionSidecar(rawVendor: string, load: QuestionLoad): QuestionSidecar {
  if (load.kind === 'unreadable') {
    // Existence unknown: the URL stays indexed and the handler throws for a
    // 5xx. A sidecar must never answer "no such question" for a timeout -
    // the HTML page could still be serving the answer.
    throw new RecordUnreadableError(load.reason, '/public/vendors');
  }
  if (load.kind === 'missing') {
    return { status: 404, document: {} };
  }

  const { vendor, record, input, answer } = load.question;
  const detail = record.detail;
  const path = vendorQuestionPath(vendor);
  const freshest: TrackCurrent | null = input.current;

  return {
    status: 200,
    document: {
      artifact: {
        kind: 'reliastra.observatory.answer',
        question_kind: 'is-down',
        format: 'json-sidecar',
        schema_version: '1.0',
        rendered_from: 'the same canonical reads as the HTML answer page',
      },
      question: answer.question,
      answer: {
        lead: answer.lead,
        facts: answer.facts,
        caveats: answer.caveats,
        state: input.verdict.state,
        state_word: input.verdict.word,
        qualifier: input.verdict.qualifier,
        observed_as_of: freshest?.timestamp ?? null,
      },
      subject: {
        vendor,
        display_name: detail.display_name,
        category: detail.category,
        endpoint_url: detail.endpoints?.[0]?.endpoint_url ?? null,
        regions: record.regions,
      },
      links: {
        html: canonicalUrl(path),
        vendor_record: canonicalUrl(SHARE_ROUTES.observatoryVendor(vendor)),
        incident_search: canonicalUrl(SHARE_ROUTES.observatoryIncidents),
        observatory: canonicalUrl(PUBLIC_ROUTES.observatory),
        methodology: canonicalUrl(researchRoute('how-reliastra-measures-vendor-reliability')),
      },
    },
  };
}
