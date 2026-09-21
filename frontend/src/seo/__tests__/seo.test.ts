import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GLOSSARY_TERMS,
  PUBLIC_PAGES,
  articleJsonLd,
  breadcrumbJsonLd,
  buildMetadata,
  canonicalUrl,
  faqJsonLd,
  organizationJsonLd,
  softwareAppJsonLd,
  websiteJsonLd,
} from '@/lib/seo';
import {
  DOCS_ROUTES,
  PUBLIC_ROUTES,
  RESEARCH_ARTICLES,
  RESEARCH_CATEGORIES,
  RESEARCH_HUBS,
  RETIRED_ROUTES,
  researchArticle,
  researchCategoryArticles,
  researchCategoryRoute,
  researchHubArticles,
  researchHubRoute,
  researchRoute,
  researchStandaloneArticles,
} from '@/lib/routes';
import { RESEARCH_ARTICLE_BODIES } from '@/content/research-articles';
import robots from '@/app/robots';
import { PAPER_OG_IMAGES, researchSocialImage } from '@/lib/research/social';

const PRIVATE_FRAGMENTS = [
  '/admin',
  '/dashboard',
  '/dependencies',
  '/incidents',
  '/evidence',
  '/clients',
  '/settings',
  '/onboarding',
  '/portal',
  '/reports',
  '/api',
  '/login',
  '/signup',
  '/verify-email',
  '/reset-password',
  '/checkout',
  '?page=',
];

describe('canonical URL architecture', () => {
  it('produces absolute HTTPS canonical URLs', () => {
    expect(canonicalUrl('/')).toBe('https://reliastra.com/');
    expect(canonicalUrl('/observatory')).toBe('https://reliastra.com/observatory');
    expect(canonicalUrl('/product/evidence')).toBe(
      'https://reliastra.com/product/evidence'
    );
    expect(canonicalUrl('/glossary/sla-evidence')).toBe(
      'https://reliastra.com/glossary/sla-evidence'
    );
  });

  it('lists only canonical indexable paths in PUBLIC_PAGES', () => {
    const paths = PUBLIC_PAGES.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) {
      expect(p.startsWith('/')).toBe(true);
      expect(p).not.toContain('?');
      expect(p).not.toContain('//');
      for (const frag of PRIVATE_FRAGMENTS) {
        expect(p === frag || p.startsWith(`${frag}/`)).toBe(false);
      }
    }
  });

  it('keeps every glossary term routable with internal related links', () => {
    const slugs = GLOSSARY_TERMS.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const g of GLOSSARY_TERMS) {
      expect(g.term.length).toBeGreaterThan(0);
      expect(g.definition.length).toBeGreaterThan(40);
      for (const r of g.related) {
        expect(r.href.startsWith('/')).toBe(true);
      }
    }
  });

  it('keeps research slugs, bodies and sitemap source in sync', () => {
    for (const a of RESEARCH_ARTICLES) {
      expect(RESEARCH_ARTICLE_BODIES[a.slug]).toBeDefined();
    }
    for (const slug of Object.keys(RESEARCH_ARTICLE_BODIES)) {
      expect(RESEARCH_ARTICLES.some((a) => a.slug === slug)).toBe(true);
    }
  });

  it('gives every article exactly one canonical URL through the hub architecture', () => {
    // Hub articles live under the hub; the rest under /research directly.
    for (const hub of RESEARCH_HUBS) {
      expect(researchHubRoute(hub.slug)).toBe(`/research/${hub.slug}`);
      for (const a of researchHubArticles(hub.slug)) {
        expect(researchRoute(a.slug)).toBe(`/research/${hub.slug}/${a.slug}`);
      }
    }
    for (const a of researchStandaloneArticles()) {
      expect(researchRoute(a.slug)).toBe(`/research/${a.slug}`);
    }
    // A hub slug must never double as an article slug: both live at `/research/*`.
    for (const hub of RESEARCH_HUBS) {
      expect(RESEARCH_ARTICLES.some((a) => (a.slug as string) === (hub.slug as string))).toBe(false);
    }
    // Unknown slugs fall through to the flat pattern (they 404 at render).
    expect(researchRoute('no-such-article')).toBe('/research/no-such-article');
    expect(researchArticle('the-dependency-gap')?.title).toBe('The Dependency Gap');
  });

  it('keeps the vendor segment free of a segment-level loading boundary', () => {
    // Soft-404 regression guard. `track/[vendor]/loading.tsx` committed a 200
    // before the page body could call notFound(), so `/observatory/<unknown>` and
    // `/observatory/<vendor>/incidents/<unknown>` served "not found" copy with an
    // indexable 200. A loading boundary ABOVE a segment that can 404 is
    // therefore forbidden; the boundary below (the telemetry Suspense) is
    // fine because it only renders after the page has decided it exists.
    const boundary = new URL('../../app/observatory/[vendor]/loading.tsx', import.meta.url);
    expect(existsSync(boundary)).toBe(false);
  });

  it('keeps the sitemap source list canonical: hubs, glossary, no redirects', () => {
    const paths = PUBLIC_PAGES.map((p) => p.path);
    // Every glossary term is in PUBLIC_PAGES (indexable) - and vice versa.
    for (const g of GLOSSARY_TERMS) {
      expect(paths).toContain(`/glossary/${g.slug}`);
    }
    // Hubs are indexable and linked.
    for (const hub of RESEARCH_HUBS) {
      expect(paths).toContain(researchHubRoute(hub.slug));
    }
    // Removed B2B surfaces are NOT in the sitemap source: they are gone,
    // not redirected - index bloat or soft-404 signals are both wrong. The
    // agencies marketing page has been restored as a real route and page,
    // so it IS expected in the source list.
    for (const removed of ['/partner', '/partner/commission']) {
      expect(paths).not.toContain(removed);
    }
    expect(paths).toContain(PUBLIC_ROUTES.agencies);
    // The lightweight creator page is indexable.
    expect(paths).toContain(PUBLIC_ROUTES.creators);
  });

  it('advertises the consolidated IA and nothing that redirects away', () => {
    // A sitemap entry pointing at a 308 is a contradiction: the crawler is
    // told the URL is canonical and then told it is not. After the
    // developer-first consolidation the four capability pages and /track are
    // retired, so none of them may appear here.
    const paths = PUBLIC_PAGES.map((p) => p.path);
    for (const retired of Object.values(RETIRED_ROUTES)) {
      expect(paths).not.toContain(retired);
    }
    // The consolidated surfaces are advertised.
    for (const path of [
      PUBLIC_ROUTES.product,
      PUBLIC_ROUTES.productEvidence,
      PUBLIC_ROUTES.observatory,
    ]) {
      expect(paths).toContain(path);
    }
  });

  it('advertises every published paper, and only paths a route exists for', () => {
    const paths = PUBLIC_PAGES.map((p) => p.path);
    for (const article of RESEARCH_ARTICLES) {
      expect(paths).toContain(researchRoute(article.slug));
    }
    // Every advertised path is one of: a declared public route, a docs
    // guide, or a derived glossary / research path. A literal typo in a
    // sitemap entry is otherwise invisible until Search Console reports it.
    const declared = new Set<string>([
      ...Object.values(PUBLIC_ROUTES),
      ...Object.values(DOCS_ROUTES),
      ...GLOSSARY_TERMS.map((g) => `/glossary/${g.slug}`),
      ...RESEARCH_ARTICLES.map((a) => researchRoute(a.slug)),
      ...RESEARCH_HUBS.map((h) => researchHubRoute(h.slug)),
      ...RESEARCH_CATEGORIES.filter((c) => researchCategoryArticles(c.slug).length > 0).map(
        (c) => researchCategoryRoute(c.slug)
      ),
    ]);
    const orphaned = paths.filter((p) => !declared.has(p));
    expect(orphaned).toEqual([]);
  });
});

describe('metadata system', () => {
  it('builds unique title/description/canonical/OG/Twitter per page', () => {
    const m: any = buildMetadata({
      title: 'Evidence records',
      description: 'Timestamped, independently verifiable evidence.',
      path: '/product/evidence',
    });
    expect(m.alternates.canonical).toBe('https://reliastra.com/product/evidence');
    expect(m.openGraph.url).toBe('https://reliastra.com/product/evidence');
    expect(m.openGraph.images[0]).toMatchObject({
      url: 'https://reliastra.com/opengraph-image.png',
      width: 1584,
      height: 396,
    });
    expect(m.twitter.images).toEqual(['https://reliastra.com/opengraph-image.png']);
    expect(m.twitter.card).toBe('summary_large_image');
    expect(m.robots.index).toBe(true);
  });

  it('emits noindex when requested', () => {
    const m: any = buildMetadata({
      title: 'Dashboard',
      description: 'Private.',
      path: '/dashboard',
      noindex: true,
    });
    expect(m.robots.index).toBe(false);
    expect(m.robots.follow).toBe(false);
  });
});

describe('structured data', () => {
  it('produces parseable JSON-LD matching visible content', () => {
    const blocks = [
      organizationJsonLd(),
      websiteJsonLd(),
      softwareAppJsonLd(),
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Evidence records', path: '/product/evidence' },
      ]),
      faqJsonLd([{ q: 'What is SLA evidence?', a: 'Timestamped records.' }]),
      articleJsonLd({
        title: 'The Dependency Gap',
        description: 'Why outages look identical.',
        path: '/research/the-dependency-gap',
        publishedAt: '2025-11-18',
      }),
    ];
    for (const b of blocks) {
      expect(() => JSON.stringify(b)).not.toThrow();
      expect((b as any)['@context']).toBe('https://schema.org');
    }
    expect((blocks[0] as any)['@id']).toContain('#organization');
  });
});

describe('research paper social artwork', () => {
  it('declares committed 1200x630 cards only for papers that exist', () => {
    for (const [slug, card] of Object.entries(PAPER_OG_IMAGES)) {
      // The card must belong to a published paper, or it is dead weight in
      // the metadata path.
      expect(researchArticle(slug)).toBeDefined();
      expect(card.path).toMatch(/^\/social\/research\/[a-z0-9-]+-og\.png$/);
      const file = new URL(`../../../public${card.path}`, import.meta.url);
      expect(existsSync(file), `${card.path} must be committed`).toBe(true);
      // A card the wrong size silently becomes a cropped preview on the
      // platforms that matter. Read the IHDR rather than trust the filename.
      const png = readFileSync(file);
      expect(png.readUInt32BE(16)).toBe(1200);
      expect(png.readUInt32BE(20)).toBe(630);
      expect(card.alt.length).toBeGreaterThan(40);
    }
  });

  it('falls back to the site-wide card for papers without one', () => {
    const img = researchSocialImage('the-dependency-gap', 'The Dependency Gap');
    expect(img.url).toBe('https://reliastra.com/opengraph-image.png');
    const card = researchSocialImage(
      'aws-iam-policy-evaluation-order',
      'AWS IAM policy evaluation logic: identity vs resource'
    );
    expect(card.url).toBe(
      'https://reliastra.com/social/research/aws-iam-policy-evaluation-order-og.png'
    );
  });
});

describe('robots.txt policy', () => {
  it('allows public, disallows private, references the sitemap', () => {
    const r: any = robots();
    expect(r.sitemap).toBe('https://reliastra.com/sitemap.xml');
    const rule = r.rules[0];
    expect(rule.allow).toBe('/');
    const dis: string[] = rule.disallow;
    for (const p of ['/admin', '/dashboard', '/portal/', '/reports/', '/api/', '/login']) {
      expect(dis).toContain(p);
    }
    // Crawler resources must stay reachable: no blanket static-asset blocks.
    expect(dis.some((d) => d.includes('_next') || d.includes('.css') || d.includes('.js'))).toBe(false);
  });
});

describe('machine-readable discovery', () => {
  it('serves llms.txt and llms-full.txt as plain text with absolute URLs', async () => {
    const llms = await import('@/app/llms.txt/route');
    const full = await import('@/app/llms-full.txt/route');
    for (const mod of [llms, full]) {
      const res: Response = await mod.GET();
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/plain');
      const body = await res.text();
      expect(body).toContain('https://reliastra.com/');
      // The proposition a model should repeat, and the limit it must not
      // drop: both files state that one observation point is deployed, so an
      // answer generated from them cannot invent multi-region confirmation.
      expect(body).toContain('RELIASTRA');
      expect(body.toLowerCase()).toContain('observation point');
      expect(body).not.toContain('multi-region confirmation is claimed');
    }
    const body = await (await llms.GET()).text();
    for (const path of [
      '/creators',
      '/observatory',
      '/product',
      '/product/evidence',
      '/docs',
      '/pricing',
      '/security',
      '/research',
    ]) {
      expect(body).toContain(`https://reliastra.com${path}`);
    }
    // The AI infrastructure hub and its scope statement must be machine-readable.
    expect(body).toContain('https://reliastra.com/research/ai-infrastructure');
    expect(body).toContain('status.openai.com');
  });

  it('reads each discovery file as plain text a machine can lift URLs from', async () => {
    // The previous version of this test compared a hand-written list of
    // titles against itself, which asserted nothing about the site: it would
    // have passed unchanged with every title in the file wrong, and it did.
    // What is actually checkable here is that both files are self-consistent
    // - every URL they advertise is absolute and on the canonical origin.
    for (const mod of [
      await import('@/app/llms.txt/route'),
      await import('@/app/llms-full.txt/route'),
    ]) {
      const body = await (await mod.GET()).text();
      const urls = [...body.matchAll(/https?:\/\/[^\s)>,]+/g)].map((m) => m[0]);
      expect(urls.length).toBeGreaterThan(10);
      // Citations to AWS docs, RFCs, vendor status endpoints and published
      // papers are expected - the research corpus carries its sources. What
      // must hold is that every URL RELIASTRA owns is on the canonical HTTPS
      // origin: `www.`, a preview host or plain HTTP in a discovery file is a
      // duplicate-origin signal to a crawler.
      const ours = urls.filter((u) => u.includes('reliastra.com'));
      expect(ours.length).toBeGreaterThan(5);
      for (const u of ours) {
        expect(u).toMatch(/^https:\/\/(api\.)?reliastra\.com/);
      }
    }
  });
});
