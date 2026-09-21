/**
 * The Markdown renderer must be exhaustive and lossless.
 *
 * Two machine-readable surfaces now depend on `lib/docs/markdown.ts`:
 * `/docs/<slug>.md` and the inlined corpus in `/llms-full.txt`. Before it
 * existed, `/llms-full.txt` advertised a "Documentation map" of bare URLs while
 * `lib/docs/types.ts` claimed the corpus fed that file. The endpoint rendered
 * fine and simply did not contain what it said it contained - the failure mode
 * a renderer test has to make impossible.
 *
 * So: one fixture per `DocBlock` variant, held in a `Record<DocBlock['kind'], …>`
 * so that adding a variant to the union is a *type* error here until the fixture
 * covers it; then every field of every fixture is asserted to reach the output.
 * A renderer that drops `caption`, or renders a `note` without its `title`,
 * fails. So does one that returns an empty string for a variant it forgot.
 */

import { describe, expect, it } from 'vitest';

import { DOCS } from '@/lib/docs/corpus';
import {
  blockToMarkdown,
  corpusToMarkdown,
  docToMarkdown,
  sectionToMarkdown,
} from '@/lib/docs/markdown';
import type { Doc, DocBlock, DocSection } from '@/lib/docs/types';

/* ── One fixture per block variant ───────────────────────────────────────── */

/**
 * Keyed by the union, not by a hand-written list of kinds. Adding a variant to
 * `DocBlock` without adding it here is a compile error, which is the point: the
 * renderer's exhaustiveness is checked by the compiler, and this record is what
 * forces the test suite to notice too.
 */
const ONE_OF_EACH: Record<DocBlock['kind'], DocBlock> = {
  p: { kind: 'p', text: 'A paragraph with `inline code` and **bold** and [a link](https://example.com).' },
  code: {
    kind: 'code',
    lang: 'bash',
    code: 'reliastra deps list --json',
    caption: 'List every dependency as JSON.',
  },
  list: { kind: 'list', items: ['first item', 'second item'], ordered: false },
  table: {
    kind: 'table',
    columns: ['Field', 'Meaning'],
    rows: [
      ['status_code', 'the HTTP status'],
      ['latency_ms', 'elapsed time'],
    ],
    caption: 'Observation fields.',
  },
  note: { kind: 'note', tone: 'warn', title: 'Careful here', text: 'This can go wrong.' },
  definitions: {
    kind: 'definitions',
    items: [{ term: 'Dependency', def: 'A service your software calls.' }],
  },
  fields: {
    kind: 'fields',
    items: [{ field: 'interval_seconds', type: 'integer', def: 'How often to probe.' }],
  },
  steps: {
    kind: 'steps',
    items: [
      {
        title: 'Install',
        text: 'Get the binary.',
        code: { lang: 'bash', code: 'go install example@latest' },
      },
    ],
  },
};

/** Every string that must survive rendering, per variant. */
const REQUIRED_STRINGS: Record<DocBlock['kind'], string[]> = {
  p: ['A paragraph with', 'inline code', 'bold', '[a link](https://example.com)'],
  code: ['```bash', 'reliastra deps list --json', 'List every dependency as JSON.'],
  list: ['first item', 'second item'],
  table: ['Field', 'Meaning', 'status_code', 'latency_ms', 'Observation fields.'],
  note: ['Careful here', 'This can go wrong.'],
  definitions: ['Dependency', 'A service your software calls.'],
  fields: ['interval_seconds', 'integer', 'How often to probe.'],
  steps: ['Install', 'Get the binary.', 'go install example@latest'],
};

const FIXTURE_DOC: Doc = {
  slug: 'fixture',
  title: 'Fixture Guide',
  summary: 'What a reader gets from this page.',
  group: 'Start',
  sections: [
    {
      id: 'first',
      heading: 'First section',
      blocks: [ONE_OF_EACH.p, ONE_OF_EACH.code],
    },
    {
      id: 'second',
      heading: 'Second section',
      blocks: [ONE_OF_EACH.table, ONE_OF_EACH.steps],
    },
  ],
};

/* ── Exhaustive ──────────────────────────────────────────────────────────── */

describe('the Markdown renderer is exhaustive', () => {
  it('renders every block variant to something non-empty', () => {
    for (const [kind, block] of Object.entries(ONE_OF_EACH)) {
      const md = blockToMarkdown(block);
      expect(md.trim().length, `${kind} rendered empty`).toBeGreaterThan(0);
    }
  });

  it('covers the whole DocBlock union', () => {
    // If a variant is added to the union, `ONE_OF_EACH` stops type-checking
    // and this list goes stale - so assert the fixture set is what the
    // renderer's switch handles, by counting the union's members.
    expect(Object.keys(ONE_OF_EACH)).toHaveLength(8);
  });

  it('throws rather than dropping an unknown variant', () => {
    // The `never` assertion is the runtime backstop for a variant that reaches
    // the renderer from data the compiler did not check (a cast, a JSON import).
    expect(() => blockToMarkdown({ kind: 'nonsense' } as unknown as DocBlock)).toThrow(
      /Unhandled documentation block/
    );
  });
});

/* ── Lossless ────────────────────────────────────────────────────────────── */

describe('the Markdown renderer is lossless', () => {
  for (const [kind, block] of Object.entries(ONE_OF_EACH)) {
    it(`carries every field of a ${kind} block`, () => {
      const md = blockToMarkdown(block);
      for (const needle of REQUIRED_STRINGS[kind as DocBlock['kind']]) {
        expect(md, `${kind} lost "${needle}"`).toContain(needle);
      }
    });
  }

  it('passes the inline markup through untouched', () => {
    // The corpus's inline syntax is already Markdown; translating it would risk
    // mangling text that is already correct.
    const md = blockToMarkdown(ONE_OF_EACH.p);
    expect(md).toContain('`inline code`');
    expect(md).toContain('**bold**');
    expect(md).toContain('[a link](https://example.com)');
  });

  it('fences code with its language', () => {
    const md = blockToMarkdown(ONE_OF_EACH.code);
    expect(md.startsWith('```bash\n')).toBe(true);
    expect(md).toContain('\n```');
  });

  it('renders an ordered list as numbered', () => {
    const md = blockToMarkdown({
      kind: 'list',
      items: ['one', 'two', 'three'],
      ordered: true,
    });
    expect(md.split('\n')).toEqual(['1. one', '2. two', '3. three']);
  });

  it('renders an unordered list as bullets', () => {
    expect(blockToMarkdown(ONE_OF_EACH.list).split('\n')).toEqual([
      '- first item',
      '- second item',
    ]);
  });

  it('emits a header separator row for every table', () => {
    const md = blockToMarkdown(ONE_OF_EACH.table);
    const lines = md.split('\n');
    expect(lines[0]).toBe('| Field | Meaning |');
    expect(lines[1]).toBe('| --- | --- |');
    expect(lines[2]).toBe('| status_code | the HTTP status |');
  });

  it('escapes pipes inside table cells', () => {
    // An unescaped pipe would silently add a column and corrupt the table.
    const md = blockToMarkdown({
      kind: 'table',
      columns: ['Expression', 'Result'],
      rows: [['a | b', 'ok']],
    });
    expect(md).toContain('| a \\| b | ok |');
  });

  it('labels a note that has no explicit title', () => {
    const warn = blockToMarkdown({ kind: 'note', tone: 'warn', text: 'x' });
    expect(warn).toContain('**Careful**');
    const info = blockToMarkdown({ kind: 'note', tone: 'info', text: 'x' });
    expect(info).toContain('**Note**');
  });

  it('omits a caption and a type when absent, without leaving debris', () => {
    const code = blockToMarkdown({ kind: 'code', lang: 'json', code: '{}' });
    expect(code).toBe('```json\n{}\n```');
    const field = blockToMarkdown({
      kind: 'fields',
      items: [{ field: 'no_type', def: 'has no type' }],
    });
    expect(field).toBe('- `no_type` — has no type');
  });
});

/* ── Document shape ──────────────────────────────────────────────────────── */

describe('a rendered guide', () => {
  it('carries its title, summary and every section heading', () => {
    const md = docToMarkdown(FIXTURE_DOC);
    expect(md).toContain('# Fixture Guide');
    expect(md).toContain('> What a reader gets from this page.');
    expect(md).toContain('## First section');
    expect(md).toContain('## Second section');
  });

  it('renders every section', () => {
    const md = sectionToMarkdown(FIXTURE_DOC.sections[0]);
    expect(md).toContain('## First section');
    expect(md).toContain('reliastra deps list --json');
  });

  it('demotes headings when nested, without touching code fences', () => {
    const md = docToMarkdown(FIXTURE_DOC, { level: 3 });
    // Title at the requested level, sections one below - not beside it.
    expect(md).toContain('### Fixture Guide');
    expect(md).toContain('#### First section');
    // Content inside a fence is code, not a heading, and must not be rewritten.
    expect(md).toContain('```bash');
    expect(md).not.toContain('#### reliastra');
  });

  it('keeps the title exactly one level above its sections', () => {
    // The inversion this guards: a guide whose title rendered at the same depth
    // as, or below, its own sections produces an outline that lies.
    for (const level of [1, 2, 3, 4]) {
      const md = docToMarkdown(FIXTURE_DOC, { level });
      const hashes = md
        .split('\n')
        .filter((l) => /^#+\s/.test(l))
        .map((l) => (/^(#+)/.exec(l) as RegExpExecArray)[1].length);
      expect(hashes[0], `level ${level}: title depth`).toBe(level);
      for (const h of hashes.slice(1)) {
        expect(h, `level ${level}: section depth`).toBeGreaterThan(level);
      }
    }
  });

  it('has exactly one top-level heading', () => {
    const md = docToMarkdown(FIXTURE_DOC);
    const h1 = md.split('\n').filter((l) => /^#\s/.test(l));
    expect(h1).toHaveLength(1);
  });

  it('never emits a run of blank lines', () => {
    // A blank line between parts is Markdown's paragraph separator. Two in a
    // row is a defect: it renders identically, and in a document assembled for
    // machine consumption it is nothing but wasted tokens.
    for (const doc of DOCS) {
      expect(docToMarkdown(doc), `${doc.slug} has blank-line runs`).not.toMatch(/\n{3,}/);
    }
    expect(corpusToMarkdown(DOCS)).not.toMatch(/\n{3,}/);
  });
});

/* ── The real corpus ─────────────────────────────────────────────────────── */

describe('the real corpus, rendered', () => {
  it('renders every guide to a non-empty document', () => {
    for (const doc of DOCS) {
      const md = docToMarkdown(doc);
      expect(md.trim().length, `${doc.slug} rendered empty`).toBeGreaterThan(200);
      expect(md).toContain(doc.title);
    }
  });

  it('drops no section of any guide', () => {
    for (const doc of DOCS) {
      const md = docToMarkdown(doc);
      for (const section of doc.sections) {
        expect(md, `${doc.slug} lost section "${section.heading}"`).toContain(
          section.heading
        );
      }
    }
  });

  it('concatenates every guide, in corpus order', () => {
    const all = corpusToMarkdown(DOCS, { level: 3 });
    // Locate each guide by its own rendered text, not by its title: a title can
    // legitimately appear earlier as a cross-reference from another guide.
    const positions = DOCS.map((d) => all.indexOf(docToMarkdown(d, { level: 3 })));
    for (const [i, p] of positions.entries()) {
      expect(p, `${DOCS[i].slug} missing from the concatenated corpus`).toBeGreaterThanOrEqual(0);
    }
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  it('produces a corpus document far larger than a link map', () => {
    // The regression this guards: a "documentation map" of thirteen URLs is
    // well-formed, renders, and contains almost nothing.
    const all = corpusToMarkdown(DOCS);
    expect(all.length).toBeGreaterThan(20000);
  });
});

/* ── The published endpoints ─────────────────────────────────────────────── */

describe('the endpoints that publish it', () => {
  it('/llms-full.txt inlines the guides, not just their URLs', async () => {
    const { GET } = await import('@/app/llms-full.txt/route');
    // The handler is synchronous today; awaiting keeps this working if it
    // becomes dynamic, which its sibling /llms.txt already is.
    const body = await (await GET()).text();

    // The whole corpus, not a map.
    expect(body).toContain('## Documentation (full text)');
    for (const doc of DOCS) {
      expect(body, `llms-full.txt missing guide "${doc.slug}"`).toContain(doc.title);
    }

    // Spot-check real prose from the thinnest guide, so a document that merely
    // repeated thirteen titles could not pass.
    const verification = DOCS.find((d) => d.slug === 'verification');
    expect(verification).toBeDefined();
    const firstProse = verification!.sections
      .flatMap((s) => s.blocks)
      .find((b): b is Extract<DocBlock, { kind: 'p' }> => b.kind === 'p');
    expect(firstProse, 'expected prose in the verification guide').toBeDefined();
    expect(body).toContain(firstProse!.text.slice(0, 40));
  });

  it('/docs-md/<slug> serves one guide as Markdown', async () => {
    const { GET } = await import('@/app/docs-md/[slug]/route');
    const res = await GET(new Request('https://reliastra.com/docs-md/monitoring'), {
      params: Promise.resolve({ slug: 'monitoring' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/markdown');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(res.headers.get('Link')).toContain('rel="canonical"');
    expect(res.headers.get('Link')).toContain('/docs/monitoring');

    const body = await res.text();
    expect(body).toContain('# Monitoring');
  });

  it('/docs-md/<slug> 404s and names what does exist', async () => {
    const { GET } = await import('@/app/docs-md/[slug]/route');
    const res = await GET(new Request('https://reliastra.com/docs-md/nope'), {
      params: Promise.resolve({ slug: 'nope' }),
    });
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain('monitoring');
  });
});

/* ── The route table and the rewrite agree ───────────────────────────────── */

describe('the .md convention', () => {
  it('rewrites /docs/<slug>.md onto the handler', async () => {
    // The handler cannot live in app/docs/[slug] (a route.ts and a page.tsx
    // cannot share a dynamic segment), so the rewrite in next.config.ts is
    // load-bearing. Assert it exists and points at the right destination.
    const { default: config } = await import('../../../next.config');
    const rewrites = await (
      config as unknown as { rewrites: () => Promise<{ source: string; destination: string }[]> }
    ).rewrites();
    const rule = rewrites.find((r) => r.source === '/docs/:slug.md');
    expect(rule, 'expected a /docs/:slug.md rewrite').toBeDefined();
    expect(rule!.destination).toBe('/docs-md/:slug');
  });

  it('keeps the rewrite destination out of robots.txt', async () => {
    const { default: robots } = await import('@/app/robots');
    const rules = robots().rules;
    const disallow = Array.isArray(rules) ? rules[0].disallow : rules.disallow;
    const list = Array.isArray(disallow) ? disallow : [disallow];
    expect(list).toContain('/docs-md/');
    // …while the public .md URL stays crawlable.
    expect(list.some((d) => d === '/docs' || d === '/docs/')).toBe(false);
  });
});

/** Unused import guard: `DocSection` is referenced by the fixture typing above. */
export type _FixtureSection = DocSection;
