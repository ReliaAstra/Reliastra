#!/usr/bin/env node
/**
 * Indexability manifest: evidence about the LIVE site, not the source.
 *
 * Fetches robots.txt, sitemap.xml and every sitemap URL (plus a fixed set
 * of known public pages), then extracts the identity fields from the
 * served HTML:
 *
 *   url, http_status, indexable, canonical, og_url, title, description,
 *   robots, h1, jsonld_types, jsonld_urls, sitemap_present,
 *   incoming_internal_links, content_type
 *
 * Collisions fail the run (exit 1): canonical != URL, og:url != URL,
 * two URLs sharing one canonical, an indexable page missing from the
 * sitemap, an indexable page with no incoming internal links, or any
 * page whose canonical/og:url is the homepage without being the homepage.
 *
 * Usage:
 *   node scripts/indexability-manifest.mjs [--base https://reliastra.com]
 *     [--limit 50] [--out .indexability/manifest-2026-09-27.json]
 *     [--full]   (include every sitemap URL; default caps at --limit)
 *
 * Snapshots are committed under frontend/indexability/snapshots/ so
 * discoverability can be compared across deployments.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => {
    const m = a.match(/^--([^=]+)(=(.*))?$/);
    if (!m) return [];
    return [m[1], m[3] ?? all[i + 1] ?? ''];
  }).filter(([k]) => k)
);

const BASE = (args.base ?? 'https://reliastra.com').replace(/\/$/, '');
const LIMIT = Number(args.limit ?? 60);
const FULL = 'full' in args;
const STAMP = new Date().toISOString().slice(0, 10);
const OUT = args.out ?? join('indexability', 'snapshots', `manifest-${STAMP}.json`);

const KNOWN_PAGES = [
  '/', '/product', '/product/evidence', '/observatory', '/observatory/incidents',
  '/pricing', '/docs', '/research', '/glossary', '/creators', '/about',
  '/security', '/contact', '/status', '/llms.txt',
];

const CONCURRENCY = 6;

async function get(url, accept = 'text/html') {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Reliastra-Indexability-Manifest/1.0', Accept: accept },
    redirect: 'manual',
    signal: AbortSignal.timeout(25000),
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, headers: res.headers, text };
}

function first(regex, text) {
  const m = text.match(regex);
  return m ? m[1].trim() : null;
}

function all(regex, text) {
  return [...text.matchAll(regex)].map((m) => m[1].trim());
}

function extractJsonLdUrls(text) {
  const urls = [];
  const types = new Set();
  for (const m of text.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const blocks = Array.isArray(JSON.parse(m[1])) ? JSON.parse(m[1]) : [JSON.parse(m[1])];
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (typeof node['@type'] === 'string') types.add(node['@type']);
        for (const key of ['@id', 'url']) {
          if (typeof node[key] === 'string') urls.push(node[key]);
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(walk);
          else if (value && typeof value === 'object') walk(value);
        }
      };
      blocks.forEach(walk);
    } catch { /* unparseable block: recorded by absence */ }
  }
  return { types: [...types].sort(), urls: [...new Set(urls)].sort() };
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const violations = [];
  const pages = [];

  const robots = await get(`${BASE}/robots.txt`, '*/*');
  const sitemapRes = await get(`${BASE}/sitemap.xml`, 'application/xml');
  const sitemapUrls = all(/<loc>\s*([^<]+?)\s*<\/loc>/g, sitemapRes.text).map((u) => u.trim());
  const sitemapSet = new Set(sitemapUrls);

  const targets = [...new Set([...KNOWN_PAGES.map((p) => `${BASE}${p === '/' ? '/' : p}`), ...sitemapUrls])];
  const capped = FULL ? targets : targets.slice(0, LIMIT);

  // Internal link graph: every fetched page contributes its outbound
  // internal hrefs, so record-linked pages (/down/* answers from records,
  // incident records from record tables) are credited, not just hub-linked
  // ones. The hubs are fetched first so their links exist even for URLs
  // outside the crawl cap.
  const linkCounts = new Map();
  const countLinks = (text) => {
    for (const href of all(/href=["']([^"'#]+)["']/gi, text)) {
      let absolute = href;
      if (href.startsWith('/')) absolute = `${BASE}${href}`;
      if (!absolute.startsWith(BASE)) continue;
      const clean = absolute.split('?')[0].replace(/\/$/, '') || `${BASE}/`;
      linkCounts.set(clean, (linkCounts.get(clean) ?? 0) + 1);
    }
  };
  const hubs = ['/', '/product', '/observatory', '/research', '/glossary', '/docs'];
  for (const hub of hubs) {
    try {
      const { text } = await get(`${BASE}${hub}`);
      countLinks(text);
    } catch { /* hub unreadable: links simply uncounted */ }
  }
  const incomingOf = (url) => {
    const clean = url.replace(/\/$/, '') || `${BASE}/`;
    return linkCounts.get(clean) ?? linkCounts.get(`${clean}/`) ?? 0;
  };

  const rows = await mapPool(capped, CONCURRENCY, async (url) => {
    let status = 0;
    let text = '';
    let contentType = '';
    try {
      const res = await get(url);
      status = res.status;
      text = res.text;
      contentType = res.headers.get('content-type') ?? '';
    } catch (e) {
      return { url, error: String(e).slice(0, 120) };
    }
    if (status >= 300 && status < 400) {
      return { url, http_status: status, note: 'redirect (follow manually)' };
    }
    if (status !== 200 || !contentType.includes('html')) {
      return { url, http_status: status, content_type: contentType };
    }
    // Every crawled page contributes its outbound links to the graph.
    countLinks(text);
    const canonical = first(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i, text);
    const ogUrl = first(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i, text);
    const title = first(/<title>([^<]*)<\/title>/i, text);
    const description = first(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i, text
    );
    const robotsMeta = first(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i, text);
    const h1 = stripTags(first(/<h1[^>]*>([\s\S]*?)<\/h1>/i, text) ?? '').slice(0, 160);
    const { types, urls } = extractJsonLdUrls(text);
    const row = {
      url,
      http_status: status,
      indexable: !/noindex/i.test(robotsMeta ?? ''),
      canonical,
      og_url: ogUrl,
      title: title?.slice(0, 160) ?? null,
      description: description?.slice(0, 220) ?? null,
      robots: robotsMeta,
      h1: h1 || null,
      jsonld_types: types,
      jsonld_urls: urls,
      sitemap_present: sitemapSet.has(url) || sitemapSet.has(`${url}/`),
      incoming_internal_links: 0, // filled after the crawl, once every page contributed its outbound links
      content_type: contentType.split(';')[0],
    };
    return row;
  });

  for (const row of rows) if (row.url) pages.push(row);

  // Violations are evaluated after the crawl so incoming-link counts cover
  // the whole crawled graph, not just the hubs fetched first.
  const home = `${BASE}/`;
  for (const row of pages) {
    row.incoming_internal_links = incomingOf(row.url);
    if (row.http_status !== 200) continue;
    if (row.indexable) {
      if (!row.sitemap_present) violations.push(`${row.url}: indexable but missing from sitemap`);
      if (row.incoming_internal_links === 0) violations.push(`${row.url}: indexable but no incoming internal links`);
    }
    if (row.sitemap_present && row.http_status === 404) {
      violations.push(`${row.url}: sitemap lists a URL that returns 404`);
    }
    if (row.canonical && row.canonical.replace(/\/$/, '') !== row.url.replace(/\/$/, '')) {
      violations.push(`${row.url}: canonical is ${row.canonical}`);
    }
    if (row.og_url && row.og_url.replace(/\/$/, '') !== row.url.replace(/\/$/, '')) {
      violations.push(`${row.url}: og:url is ${row.og_url}`);
    }
    if (row.url !== home && row.url !== `${BASE}`) {
      if (row.canonical === home) violations.push(`${row.url}: canonical collapses to homepage`);
      if (row.og_url === home) violations.push(`${row.url}: og:url collapses to homepage`);
    }
  }

  // Duplicate canonical identities across distinct URLs.
  const byCanonical = new Map();
  for (const row of pages) {
    if (!row.canonical) continue;
    const list = byCanonical.get(row.canonical) ?? [];
    list.push(row.url);
    byCanonical.set(row.canonical, list);
  }
  for (const [canonical, urls] of byCanonical) {
    const distinct = [...new Set(urls.map((u) => u.replace(/\/$/, '')))];
    if (distinct.length > 1) violations.push(`canonical ${canonical} shared by: ${distinct.join(', ')}`);
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    base: BASE,
    robots_status: robots.status,
    sitemap_status: sitemapRes.status,
    sitemap_url_count: sitemapUrls.length,
    pages_capped: FULL ? false : capped.length,
    pages,
    violations,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`URLs checked: ${pages.length} (sitemap lists ${sitemapUrls.length})`);
  console.log(`Violations: ${violations.length}`);
  for (const v of violations) console.log(`  VIOLATION ${v}`);
  console.log(`Manifest: ${OUT}`);
  process.exit(violations.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`MANIFEST-FAIL ${e.message}`);
  process.exit(2);
});
