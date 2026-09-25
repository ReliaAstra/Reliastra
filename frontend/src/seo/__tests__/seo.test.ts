import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  GONE_ROUTES,
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
    // not redirected - index bloat or soft-404 signals are both wrong.
    // `/agencies` (old agency/MSP positioning) is permanently retired with a
    // 410, so it must not be advertised either.
    for (const removed of ['/partner', '/partner/commission', ...Object.values(GONE_ROUTES)]) {
      expect(paths).not.toContain(removed);
    }
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
  it('disallows private surfaces, references the sitemap', () => {
    const r: any = robots();
    expect(r.sitemap).toBe('https://reliastra.com/sitemap.xml');
    const rule = r.rules[0];
    const dis: string[] = rule.disallow;
    for (const p of ['/admin', '/dashboard', '/portal/', '/reports/', '/api/', '/login']) {
      expect(dis).toContain(p);
    }
    // Crawler resources must stay reachable: no blanket static-asset blocks.
    expect(dis.some((d) => d.includes('_next') || d.includes('.css') || d.includes('.js'))).toBe(false);
  });

  it('emits no blanket Allow, so the disallow list means something', () => {
    /**
     * Next.js writes `Allow` lines before `Disallow` lines. Longest-match
     * interpreters (Google, Python 3.13+) resolve that correctly, but
     * first-match interpreters - Python's `urllib.robotparser` up to 3.12 and
     * the ports of it that a lot of LLM and agent crawlers use - stop at the
     * first matching rule. With `Allow: /` present, every disallow below it was
     * void for those crawlers: the console, the admin surface and the auth
     * pages were published as crawlable.
     *
     * Everything not disallowed is allowed by default, so the blanket rule was
     * never granting access - only ambiguity.
     */
    const rule: any = robots().rules[0];
    expect(rule.allow).toBeUndefined();

    // The same property, checked the way a first-match interpreter reads it:
    // for every private path, the first rule that matches must be a disallow.
    const dis: string[] = rule.disallow;
    const allows: string[] = rule.allow ? [rule.allow].flat() : [];
    for (const path of ['/admin/users', '/dashboard', '/incidents', '/api/v1/vendors', '/login']) {
      const firstAllow = allows.find((a) => path.startsWith(a));
      const firstDisallow = dis.find((d) => path.startsWith(d));
      expect(firstDisallow, `${path} is not disallowed`).toBeDefined();
      if (firstAllow) {
        expect(firstAllow.length).toBeGreaterThan((firstDisallow ?? '').length);
      }
    }
  });

  it('grants OAI-SearchBot explicit access to public content, but not private routes', () => {
    /**
     * The OpenAI search crawler gets a dedicated, explicit allowlist for the
     * public site. The blanket `Allow: /` is safe *only* because it targets one
     * known, longest-match crawler; the private-route disallows still win on
     * every protected path. The `*` group above stays allow-free so it remains
     * correct for the first-match interpreters in the long tail of agent
     * crawlers.
     */
    const r: any = robots();
    const bot = r.rules.find((rule: any) => rule.userAgent === 'OAI-SearchBot');
    expect(bot, 'OAI-SearchBot must have an explicit rule').toBeDefined();
    expect([bot.allow].flat()).toContain('/');
    for (const p of ['/admin', '/dashboard', '/api/', '/login', '/reports/']) {
      expect(bot.disallow, `OAI-SearchBot must still be barred from ${p}`).toContain(p);
    }
    // Googlebot is not blocked: it is covered by the permissive `*` group.
    expect(r.rules.some((rule: any) => /googlebot/i.test(rule.userAgent ?? ''))).toBe(false);
    // GPTBot is a separate, unapproved decision and must not appear.
    expect(r.rules.some((rule: any) => rule.userAgent === 'GPTBot')).toBe(false);
  });

  it('disallows everything on a deployment that must not be indexed', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://staging.reliastra.example');
    const stagingRobots = (await import('@/app/robots')).default;

    const r: any = stagingRobots();

    expect(r.rules[0].disallow).toBe('/');
    // No sitemap line: advertising the production sitemap from a preview host
    // is how preview URLs get indexed.
    expect(r.sitemap).toBeUndefined();

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe('machine-readable discovery', () => {
  /**
   * `/llms.txt` enumerates the published dependency records, so generating it
   * reads the catalog. Stubbed here on purpose: what matters is that the file
   * lists the records the API says exist, and that it says so honestly when the
   * API does not answer. Neither is observable against a live API, and a model
   * that is handed one index URL will guess vendor slugs - a guessed slug 404s.
   */
  const CATALOG = {
    items: [
      {
        id: 'b1f0a5c2-0000-4000-8000-000000000001',
        vendor_name: 'openai',
        display_name: 'OpenAI',
        category: 'ai',
        is_public: true,
        recent_status: 'operational',
        last_check_at: '2026-09-20T12:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-09-20T12:00:00Z',
      },
    ],
    next_cursor: null,
    has_more: false,
  };
  let catalogFails = false;

  /**
   * Clear the last-good catalog through the module registry these tests
   * actually run against.
   *
   * A statically imported `resetDiscoveryCatalog` is bound to the
   * `lib/track-api` instance created before the `vi.resetModules()` in the
   * describe above, while a dynamically imported route uses the newer one - so
   * resetting it that way clears a cache the route never reads, and the previous
   * test's last-good list leaks into the next one. That leak is invisible when
   * every test expects a successful read, and it silently rewrites the answer
   * for the tests that expect a failure.
   */
  const resetDiscoveryCatalog = async () => {
    (await import('@/lib/track-api')).resetDiscoveryCatalog();
  };

  beforeEach(async () => {
    catalogFails = false;
    await resetDiscoveryCatalog();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        catalogFails
          ? new Response(JSON.stringify({ detail: 'unavailable' }), { status: 503 })
          : new Response(JSON.stringify(CATALOG), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
      )
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await resetDiscoveryCatalog();
  });

  it('enumerates the published dependency records in llms.txt', async () => {
    const { GET } = await import('@/app/llms.txt/route');
    const body = await (await GET()).text();

    expect(body).toContain('https://reliastra.com/observatory/openai');
    expect(body).toContain('Enumerated from the public catalog at');
    // The reader is told not to invent slugs, which is the failure the
    // enumeration exists to prevent.
    expect(body).toContain('do not guess slugs');
  });

  it('serves the last good record list, labelled stale, when the catalog goes unreadable', async () => {
    // One module instance for both reads: the last-good catalog is process-local
    // state on `lib/track-api`, so a fresh import would start with nothing to
    // fall back to and would not exercise the path this test exists for.
    const { GET } = await import('@/app/llms.txt/route');
    expect(await (await GET()).text()).toContain('Enumerated from the public catalog at');

    catalogFails = true;
    const body = await (await GET()).text();

    // The records stay listed - withdrawing every record URL from a discovery
    // document because one read failed is how a model concludes the observatory
    // is empty. What changes is that the file says the list is not current.
    expect(body).toContain('https://reliastra.com/observatory/openai');
    expect(body).toContain('Enumerated from the last successful catalog read at');
    expect(body).toContain('may be missing from this list');
    expect(body).not.toContain('could not be read when this file was generated');
  });

  it('reports an unreadable catalog instead of listing no records', async () => {
    catalogFails = true;
    const { GET } = await import('@/app/llms.txt/route');

    const body = await (await GET()).text();

    // "No records are published" is a false claim about the product, and it is
    // exactly the kind of false claim a model repeats verbatim.
    expect(body).toContain('could not be read');
    expect(body).not.toContain('https://reliastra.com/observatory/openai');
    // Nor may it claim the opposite: that RELIASTRA publishes no records.
    expect(body).not.toContain('No dependency records are published yet');
  });

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
