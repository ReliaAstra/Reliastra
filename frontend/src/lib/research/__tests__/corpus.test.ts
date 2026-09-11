import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_BASES,
  RESEARCH_DOMAINS,
  RESEARCH_TYPES,
} from '@/lib/research/types';
import { RESEARCH_PAPERS, researchPaper } from '@/lib/research/corpus';
import { RESEARCH_AUTHORS, bylineFor, citationFor, RESEARCH_PUBLISHER } from '@/lib/research/authors';
import {
  datasetJsonLd,
  personJsonLd,
  researchArticleJsonLd,
  researchWebPageJsonLd,
} from '@/lib/research/structured-data';
import { PUBLIC_PAGES } from '@/lib/seo';
import {
  RESEARCH_ARTICLES,
  RESEARCH_CATEGORIES,
  RESEARCH_HUBS,
  researchCategoryArticles,
  researchCategoryRoute,
  researchRoute,
} from '@/lib/routes';
import { RESEARCH_ARTICLE_BODIES } from '@/content/research-articles';

/**
 * The publication gate, as tests.
 *
 * A research corpus degrades the moment a page can be added without declaring
 * what it claims. These tests make the declaration structural: a paper that is
 * missing a research question, a limitation, or a source cannot be built, let
 * alone published.
 *
 * They also guard the two things that are easy to lose quietly - URL stability
 * for published papers, and the absence of embellished structured data.
 */

const repoRoot = (path: string) =>
  new URL(`../../../../../${path}`, import.meta.url);

describe('research corpus completeness', () => {
  it('has papers, and every paper has a route record and a body', () => {
    expect(RESEARCH_PAPERS.length).toBeGreaterThanOrEqual(4);
    for (const paper of RESEARCH_PAPERS) {
      const article = RESEARCH_ARTICLES.find((a) => a.slug === paper.slug);
      expect(article, `no route record for ${paper.slug}`).toBeDefined();
      expect(RESEARCH_ARTICLE_BODIES[paper.slug], `no body for ${paper.slug}`).toBeDefined();
    }
  });

  it('declares a research question that is actually a question', () => {
    for (const p of RESEARCH_PAPERS) {
      expect(p.researchQuestion.trim().endsWith('?'), p.slug).toBe(true);
      // One sentence. A question with a full stop in the middle is two claims.
      expect(p.researchQuestion.split(/(?<=\.)\s/).length).toBe(1);
    }
  });

  it('declares an abstract that stands alone', () => {
    for (const p of RESEARCH_PAPERS) {
      expect(p.abstract.length, p.slug).toBeGreaterThan(400);
    }
  });

  it('declares between three and seven key findings, each with a basis', () => {
    for (const p of RESEARCH_PAPERS) {
      expect(p.keyFindings.length, p.slug).toBeGreaterThanOrEqual(3);
      expect(p.keyFindings.length, p.slug).toBeLessThanOrEqual(7);
      for (const f of p.keyFindings) {
        expect(f.claim.length).toBeGreaterThan(40);
        expect(EVIDENCE_BASES).toContain(f.basis);
      }
    }
  });

  it('never labels a claim "measured" without an observation window', () => {
    for (const p of RESEARCH_PAPERS) {
      const hasMeasured = p.keyFindings.some((f) => f.basis === 'measured');
      if (hasMeasured || p.evidenceBasis === 'measured') {
        expect(p.observation, `${p.slug} claims measurement with no window`).toBeDefined();
        expect(p.observation!.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(p.observation!.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(p.observation!.source.startsWith('http')).toBe(true);
        expect(p.observation!.method.length).toBeGreaterThan(20);
      }
    }
  });

  it('states its limitations and its recommendations', () => {
    for (const p of RESEARCH_PAPERS) {
      // A paper with no stated limits cannot be told apart from marketing.
      expect(p.limitations.length, p.slug).toBeGreaterThanOrEqual(3);
      expect(p.recommendations.length, p.slug).toBeGreaterThanOrEqual(3);
      for (const l of p.limitations) expect(l.length).toBeGreaterThan(40);
      for (const r of p.recommendations) {
        expect(r.title.length).toBeGreaterThan(6);
        expect(r.detail.length).toBeGreaterThan(60);
      }
    }
  });

  it('names its entities rather than saying "the provider"', () => {
    for (const p of RESEARCH_PAPERS) {
      expect(p.entities.length, p.slug).toBeGreaterThanOrEqual(2);
      for (const e of p.entities) expect(e.name.length).toBeGreaterThan(1);
    }
  });

  it('uses the declared taxonomy', () => {
    for (const p of RESEARCH_PAPERS) {
      expect(p.domains.length, p.slug).toBeGreaterThanOrEqual(1);
      for (const d of p.domains) expect(RESEARCH_DOMAINS).toContain(d);
      expect(RESEARCH_TYPES).toContain(p.researchType);
      expect(EVIDENCE_BASES).toContain(p.evidenceBasis);
    }
  });

  it('only names an author that has been declared', () => {
    for (const p of RESEARCH_PAPERS) {
      if (p.author) {
        expect(
          RESEARCH_AUTHORS.some((a) => a.id === p.author),
          `${p.slug} names an undeclared author`
        ).toBe(true);
      }
    }
  });

  it('falls back to the imprint, never to an invented person', () => {
    expect(bylineFor(undefined)).toBe(RESEARCH_PUBLISHER.imprint);
    expect(bylineFor('no-such-author')).toBe(RESEARCH_PUBLISHER.imprint);
    expect(personJsonLd(undefined)).toBeNull();
    expect(personJsonLd('no-such-author')).toBeNull();
    const cite = citationFor({
      title: 'T',
      publishedAt: '2026-09-11',
      url: 'https://reliastra.com/x',
    });
    expect(cite).toContain(RESEARCH_PUBLISHER.imprint);
    expect(cite).toContain('2026');
  });
});

describe('references', () => {
  it('are unique, resolvable and dated where they can change', () => {
    const CHANGEABLE = new Set(['web', 'vendor-documentation', 'reliastra-measurement']);
    for (const p of RESEARCH_PAPERS) {
      expect(p.references.length, p.slug).toBeGreaterThanOrEqual(3);
      const ids = p.references.map((r) => r.id);
      expect(new Set(ids).size, `${p.slug} has duplicate reference ids`).toBe(ids.length);

      for (const r of p.references) {
        expect(r.title.length).toBeGreaterThan(6);
        if (r.url) expect(r.url.startsWith('http'), `${p.slug}/${r.id}`).toBe(true);
        if (CHANGEABLE.has(r.kind)) {
          expect(r.accessedAt, `${p.slug}/${r.id} needs an access date`).toMatch(
            /^\d{4}-\d{2}-\d{2}$/
          );
        }
        if (r.kind === 'rfc' || r.kind === 'standard') {
          expect(
            r.identifier || r.publisher,
            `${p.slug}/${r.id} is a standard with no identifier or publisher`
          ).toBeTruthy();
        }
      }
    }
  });
});

describe('artifacts', () => {
  it('exist on disk when they claim a path in this repository', () => {
    for (const p of RESEARCH_PAPERS) {
      for (const a of p.artifacts) {
        if (a.path) {
          expect(existsSync(repoRoot(a.path)), `${p.slug}: missing ${a.path}`).toBe(true);
        } else {
          // A figure with no file is fine; anything else must point somewhere.
          expect(a.kind, `${p.slug}: ${a.label} has neither path nor url`).toBe('diagram');
        }
      }
      if (p.dataset) {
        expect(existsSync(repoRoot(p.dataset.path)), `${p.slug}: missing dataset`).toBe(true);
        expect(p.dataset.variables.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keep at least one paper reproducible end to end', () => {
    const scripted = RESEARCH_PAPERS.filter((p) =>
      p.artifacts.some((a) => a.kind === 'script' && a.path)
    );
    expect(scripted.length).toBeGreaterThanOrEqual(1);
  });
});

describe('URL architecture', () => {
  it('routes category papers under /research/{category}/{slug}', () => {
    for (const p of RESEARCH_PAPERS) {
      const article = RESEARCH_ARTICLES.find((a) => a.slug === p.slug)!;
      if ('section' in article && article.section) {
        expect(researchRoute(p.slug)).toBe(`/research/${article.section}/${p.slug}`);
      }
    }
  });

  it('keeps every published URL where it already was', () => {
    // Published addresses are stable. These five went out before categories
    // existed and must not move - they are already in sitemaps and backlinks.
    const frozen: Record<string, string> = {
      'the-dependency-gap': '/research/the-dependency-gap',
      'how-reliastra-measures-vendor-reliability':
        '/research/how-reliastra-measures-vendor-reliability',
      'reliastra-research-agenda': '/research/reliastra-research-agenda',
      'is-openai-down': '/research/ai-infrastructure/is-openai-down',
      'ai-api-outage-evidence': '/research/ai-infrastructure/ai-api-outage-evidence',
    };
    for (const [slug, url] of Object.entries(frozen)) {
      expect(researchRoute(slug)).toBe(url);
    }
  });

  it('gives every category at least one paper, so no category is a thin page', () => {
    for (const c of RESEARCH_CATEGORIES) {
      expect(researchCategoryArticles(c.slug).length, c.slug).toBeGreaterThan(0);
      expect(PUBLIC_PAGES.map((p) => p.path)).toContain(researchCategoryRoute(c.slug));
    }
  });

  it('keeps category, hub and article slugs disjoint at /research/{segment}', () => {
    const categories = RESEARCH_CATEGORIES.map((c) => c.slug as string);
    const hubs = RESEARCH_HUBS.map((h) => h.slug as string);
    const articles = RESEARCH_ARTICLES.map((a) => a.slug as string);

    for (const c of categories) {
      expect(hubs, `category ${c} collides with a hub`).not.toContain(c);
      expect(articles, `category ${c} collides with an article`).not.toContain(c);
    }
    expect(new Set(categories).size).toBe(categories.length);
  });

  it('resolves every paper to exactly one address', () => {
    const urls = RESEARCH_ARTICLES.map((a) => researchRoute(a.slug));
    expect(new Set(urls).size, 'two papers share a canonical URL').toBe(urls.length);
  });
});

describe('structured data', () => {
  const article = RESEARCH_ARTICLES.find((a) => a.slug === 'availability-record-audit')!;
  const paper = researchPaper('availability-record-audit')!;

  it('emits parseable JSON-LD that survives a round trip', () => {
    const nodes = [
      researchArticleJsonLd(paper, {
        title: article.title,
        summary: article.summary,
        path: researchRoute(article.slug),
        publishedAt: article.publishedAt,
        category: article.category,
        tags: [...article.tags],
        readingMinutes: 12,
        wordCount: 2700,
      }),
      researchWebPageJsonLd(paper, {
        title: article.title,
        summary: article.summary,
        path: researchRoute(article.slug),
        publishedAt: article.publishedAt,
      }),
      datasetJsonLd(paper, researchRoute(article.slug)),
    ].filter(Boolean) as object[];

    expect(nodes.length).toBe(3);
    for (const node of nodes) {
      const parsed = JSON.parse(JSON.stringify(node));
      expect(parsed['@context']).toBe('https://schema.org');
      expect(parsed['@type']).toBeTruthy();
    }
  });

  it('carries the research question and the findings as machine-readable text', () => {
    const ld = researchArticleJsonLd(paper, {
      title: article.title,
      summary: article.summary,
      path: researchRoute(article.slug),
      publishedAt: article.publishedAt,
      readingMinutes: 12,
      wordCount: 2700,
    }) as Record<string, unknown>;

    expect(ld.abstract).toBe(paper.abstract);
    expect((ld.about as unknown[]).length).toBe(paper.entities.length);
    expect((ld.citation as unknown[]).length).toBe(paper.references.length);
    expect(ld.isAccessibleForFree).toBe(true);

    const page = researchWebPageJsonLd(paper, {
      title: article.title,
      summary: article.summary,
      path: researchRoute(article.slug),
      publishedAt: article.publishedAt,
    }) as Record<string, unknown>;
    expect(page.description).toBe(paper.researchQuestion);
  });

  it('never embellishes', () => {
    // These are the properties an LLM-generated page invents. A search engine
    // that catches one stops trusting the rest of the document.
    const FORBIDDEN = [
      'award',
      'aggregateRating',
      'isPeerReviewed',
      'citationCount',
      'review',
      'reviewCount',
      'ratingValue',
    ];
    for (const p of RESEARCH_PAPERS) {
      const blob = JSON.stringify(
        researchArticleJsonLd(p, {
          title: p.slug,
          summary: p.abstract,
          path: `/research/${p.slug}`,
          publishedAt: p.publishedAt,
          readingMinutes: 10,
          wordCount: 2000,
        })
      );
      for (const key of FORBIDDEN) {
        expect(blob, `${p.slug} claims ${key}`).not.toContain(`"${key}"`);
      }
    }
  });

  it('declares a dataset only for a paper that ships one', () => {
    for (const p of RESEARCH_PAPERS) {
      const node = datasetJsonLd(p, `/research/${p.slug}`);
      expect(node === null).toBe(!p.dataset);
    }
  });
});

describe('basis labelling', () => {
  it('never calls a paper "measured" unless a finding is', () => {
    for (const p of RESEARCH_PAPERS) {
      const bases = new Set(p.keyFindings.map((f) => f.basis));
      if (p.evidenceBasis === 'measured') {
        expect(bases, `${p.slug} is labelled measured with no measured finding`).toContain(
          'measured'
        );
      }
      // A paper that leans on reasoning must say what it cannot establish.
      if (p.evidenceBasis === 'reasoned') {
        expect(p.limitations.length, p.slug).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('labels every finding, so no claim is left unattributed', () => {
    for (const p of RESEARCH_PAPERS) {
      for (const f of p.keyFindings) {
        expect(EVIDENCE_BASES, `${p.slug}: unlabelled finding`).toContain(f.basis);
      }
    }
  });
});

/** Depth-first walk of source files under a directory (test helper). */
function walk(dir: URL): URL[] {
  const out: URL[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) out.push(...walk(url));
    else out.push(url);
  }
  return out;
}

// Frontend package root: corpus.test.ts lives at src/lib/research/__tests__/.
const FRONTEND = new URL('../../../../', import.meta.url);

/**
 * The figures and paper blocks are styled entirely with `var(--ob-*)` custom
 * properties defined in globals.css. A typo in one is invisible to tsc and to
 * the build: the property simply does not resolve and the element renders
 * transparent or inherits an unintended colour, which on a dark diagram reads
 * as missing content. Asserting the set is closed is cheaper than eyeballing
 * every figure after a styling change.
 */
it('every var(--ob-*) used by the research template resolves', () => {
  const css = readFileSync(new URL('src/app/globals.css', FRONTEND), 'utf8');
  const defined = new Set(
    [...css.matchAll(/(--ob-[a-z0-9-]+)\s*:/g)].map((m) => m[1])
  );
  expect(defined.size).toBeGreaterThan(10);
  const used = new Map<string, string[]>();
  for (const dir of ['src/components/research', 'src/content/research', 'src/app/research']) {
    for (const file of walk(new URL(`${dir}/`, FRONTEND))) {
      // `file` is a URL: there is no `.name` on it, so the basename has to be
      // taken from the pathname.
      const name = file.pathname.split('/').pop() ?? '';
      if (!/\.(tsx|ts|css)$/.test(name)) continue;
      const source = readFileSync(file, 'utf8');
      for (const token of source.match(/var\(--ob-[a-z0-9-]+/g) ?? []) {
        const tokenName = token.slice('var('.length);
        const list = used.get(tokenName) ?? [];
        list.push(name);
        used.set(tokenName, list);
      }
    }
  }
  expect(used.size).toBeGreaterThan(5);
  const missing = [...used].filter(([token]) => !defined.has(token));
  expect(missing.map(([t, files]) => `${t} (${files.join(', ')})`)).toEqual([]);
});
