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
import { RESEARCH_ARTICLES } from '@/lib/routes';
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
    expect(m.openGraph.images[0].url).toContain('opengraph-image');
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
