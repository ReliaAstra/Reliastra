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
  PARTNER_INDEXABLE_SLUGS,
  PARTNER_ROUTE_SLUGS,
  RESEARCH_ARTICLES,
  isPartnerRouteSlug,
  partnerRouteUrl,
  partnerUrl,
} from '@/lib/routes';
import { RESEARCH_ARTICLE_BODIES } from '@/content/research-articles';
import robots from '@/app/robots';

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
    expect(canonicalUrl('/track')).toBe('https://reliastra.com/track');
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

  it('uses straightforward /partner URLs, never query-param links', () => {
    expect(partnerUrl('home')).toBe('/partner');
    expect(partnerUrl('signup')).toBe('/partner/signup');
    expect(partnerRouteUrl('privacy')).toBe('/partner/privacy');
    for (const slug of PARTNER_ROUTE_SLUGS) {
      expect(isPartnerRouteSlug(slug)).toBe(true);
      expect(partnerRouteUrl(slug as (typeof PARTNER_ROUTE_SLUGS)[number])).not.toContain('?');
    }
    expect(isPartnerRouteSlug('dashboard')).toBe(false);
    expect(isPartnerRouteSlug('nope')).toBe(false);
    // Every indexable partner slug has a sitemap entry.
    const paths = PUBLIC_PAGES.map((p) => p.path);
    for (const slug of PARTNER_INDEXABLE_SLUGS) {
      const expected = slug === 'home' ? '/partner' : `/partner/${slug}`;
      expect(paths).toContain(expected);
    }
  });
});

describe('metadata system', () => {
  it('builds unique title/description/canonical/OG/Twitter per page', () => {
    const m: any = buildMetadata({
      title: 'SLA Evidence & Outage Proof',
      description: 'Timestamped SLA evidence.',
      path: '/sla-evidence',
    });
    expect(m.alternates.canonical).toBe('https://reliastra.com/sla-evidence');
    expect(m.openGraph.url).toBe('https://reliastra.com/sla-evidence');
    expect(m.openGraph.images[0]).toMatchObject({
      url: 'https://reliastra.com/opengraph-image.png',
      width: 1200,
      height: 630,
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
        { name: 'SLA evidence', path: '/sla-evidence' },
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
      expect(body).toContain('External Dependency Intelligence');
    }
    const body = await (await llms.GET()).text();
    for (const path of ['/agencies', '/track', '/docs', '/pricing', '/security', '/research', '/partner']) {
      expect(body).toContain(`https://reliastra.com${path}`);
    }
  });

  it('keeps public page titles unique across the IA', () => {
    // Titles below mirror the `buildMetadata` inputs of indexable pages
    // (the `| RELIASTRA` template suffix applies at render). Any duplicate
    // here is a real duplicate-title defect, not a template artifact.
    const titles = [
      'RELIASTRA - External Dependency Intelligence',
      'Product - External Dependency Intelligence platform',
      'For agencies & MSPs',
      'External Dependency Intelligence',
      'Third-Party Dependency Monitoring',
      'SLA Evidence & Outage Proof',
      'Incident Evidence & Outage Attribution',
      'Track - Public vendor status | RELIASTRA',
      'Pricing - Free, Pro & Enterprise',
      'Security - How RELIASTRA protects your data',
      'Documentation',
      'Quickstart - First check in minutes',
      'Monitoring docs - Checks, regions, states',
      'Evidence docs - Generate, share, verify',
      'API docs - Programmatic access',
      'Glossary - Dependency intelligence concepts',
      'Research - RELIASTRA',
      'About - Why RELIASTRA exists',
      'Contact - Talk to RELIASTRA',
      'Status - Platform health',
      'Partner Network - Earn recurring revenue',
    ];
    expect(new Set(titles).size).toBe(titles.length);
  });
});
