import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The response contract of the direct-answer surface, asserted against the
 * sources (the measurement API is unreachable in this environment).
 *
 * What is pinned is the part a crawler pays for:
 *
 *   question read   -> 200, indexable, FAQPage only for a resolved record
 *   catalog 404     -> 404, `noindex` (page + sidecar)
 *   API did not answer -> throw; the boundary serves 5xx; URL stays indexed
 *
 * And the one-source-of-truth rule: page and sidecar resolve the SAME
 * subject through the SAME engine, and the answer comes from the shared
 * composer the record page uses - neither surface re-derives it.
 */

// This spec lives in `down/__tests__`; APP is that directory.
const APP = __dirname;
const read = (rel: string) => readFileSync(resolve(APP, rel), 'utf8');

const page = read('../[vendor]/page.tsx');
const sidecar = read('../[vendor]/index.json/route.ts');
const engine = read(
  '../../../lib/observatory/questions.ts'
);
const composer = read(
  '../../../lib/observatory/answer.ts'
);

describe('the direct-answer page', () => {
  it('resolves through the question engine, not its own reads', () => {
    expect(page).toContain('loadVendorQuestion(');
    expect(page).not.toContain('readVendorRecord(');
    expect(page).not.toContain('readVendorDetail(');
  });

  it('throws when the API did not answer - existence stays unknown', () => {
    expect(page).toMatch(/load\.kind === 'unreadable'/);
    expect(page).toContain('throw new RecordUnreadableError');
  });

  it('404s when the catalog does not name the subject', () => {
    expect(page).toMatch(/load\.kind === 'missing'/);
    expect(page).toContain('notFound()');
  });

  it('marks an unreadable answer indexable and only a missing one noindex', () => {
    const metadata = page.slice(
      page.indexOf('export async function generateMetadata'),
      page.indexOf('export default async function')
    );
    const unreadable = metadata.slice(
      metadata.indexOf("load.kind === 'unreadable'"),
      metadata.indexOf("load.kind === 'missing'")
    );
    const missing = metadata.slice(metadata.indexOf("load.kind === 'missing'"));

    expect(unreadable).toContain('index: true');
    expect(unreadable).not.toContain('index: false');
    expect(missing).toContain('index: false');
  });

  it('has an error boundary to turn the throw into a 5xx', () => {
    expect(existsSync(resolve(APP, '../../down/error.tsx'))).toBe(true);
    expect(existsSync(resolve(APP, '../[vendor]/not-found.tsx'))).toBe(true);
  });

  it('publishes structured data only for a resolved record', () => {
    // The FAQPage block sits after the missing/unreadable handling and names
    // the rendered question text, so a 404 or a 5xx can never emit it.
    const body = page.slice(page.indexOf('export default async function'));
    const faq = body.slice(body.indexOf("'@type': 'FAQPage'"));
    expect(faq).toContain("name: answer.question");
    expect(faq).toContain("text: answerText");
  });
});

describe('the direct-answer JSON sidecar', () => {
  it('resolves the same subject through the same engine', () => {
    expect(sidecar).toContain('loadVendorQuestion(');
    expect(sidecar).toContain('vendorQuestionSidecar(');
    expect(sidecar).not.toContain('readVendorRecord(');
  });

  it('serves noindex - the HTML answer is the indexable unit', () => {
    expect(sidecar).toContain("'X-Robots-Tag': 'noindex'");
  });

  it('404s for absent subjects and throws on unreadable', () => {
    expect(sidecar).toContain('status: 404');
    expect(sidecar).not.toMatch(/catch/);
    expect(engine).toMatch(/throw new RecordUnreadableError/);
  });
});

describe('the shared answer composer', () => {
  it('is one function used by both the record page and the question engine', () => {
    expect(composer).toContain('export function answerInputFromRecord');
    expect(engine).toContain('answerInputFromRecord(');
    const recordPage = read(
      '../../../app/observatory/[vendor]/page.tsx'
    );
    expect(recordPage).toContain('answerInputFromRecord(');
  });

  it('derives the verdict through deriveState - no second state machine', () => {
    // The composer must derive the verdict from the shared deriveState, not
    // re-implement the state word rules.
    expect(composer).toMatch(/deriveState\(detail\.recent_status, freshest\)/);
  });
});
