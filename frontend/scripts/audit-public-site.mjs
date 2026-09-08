#!/usr/bin/env node
/**
 * Public-site audit: crawler + static QA.
 *
 * Playwright cannot execute in every environment (a browser binary and network
 * egress are required), so this script performs the subset of the verification
 * contract that can be proven from the served HTML alone, with no browser:
 *
 *   1. Every seeded public route returns the expected status.
 *   2. Every internal link discovered anywhere on the site resolves (crawled
 *      transitively, so a broken link three clicks deep is still caught).
 *   3. No `href="#"`, empty or placeholder links are emitted.
 *   4. Every `<img>` has an `alt` attribute (empty alt allowed only when the
 *      image is explicitly aria-hidden or decorative).
 *   5. Every referenced local asset (image, media file) exists and is served.
 *   6. Exactly one `<h1>` per page, and no skipped heading levels.
 *   7. Indexable pages carry a title, a meta description and a canonical URL.
 *   8. Auth routes are noindex; public routes are not accidentally noindex.
 *   9. Every page renders the global header and footer.
 *  10. No banned legacy palette tokens leak into public HTML.
 *
 * Usage:  node scripts/audit-public-site.mjs [baseUrl]
 * Exit code is non-zero if any error-severity finding is recorded.
 */

const BASE = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

/** Routes seeded into the crawl. Everything else is discovered from links. */
const SEEDS = [
  '/',
  '/product',
  '/external-dependency-intelligence',
  '/dependency-monitoring',
  '/sla-evidence',
  '/incident-evidence',
  '/track',
  '/pricing',
  '/research',
  '/glossary',
  '/docs',
  '/about',
  '/contact',
  '/status',
  '/security',
  '/privacy',
  '/terms',
  '/partner',
  '/login',
  '/signup',
  '/verify-email',
  '/reset-password',
];

/** Routes that must return 404. */
const EXPECT_404 = ['/this-route-does-not-exist-zzz'];

/** Prefixes that are crawled for status only (never parsed or descended). */
const HEAD_ONLY = ['/api/', '/portal/', '/reports/', '/checkout'];

/** Authenticated surfaces: linked from the public site, but not crawled. */
const SKIP_PREFIXES = [
  '/dashboard',
  '/dependencies',
  '/incidents',
  '/clients',
  '/evidence',
  '/onboarding',
  '/settings',
  '/support',
  '/admin',
];

const AUTH_ROUTES = ['/login', '/signup', '/verify-email', '/reset-password'];

/**
 * Routable but intentionally not indexed: partner auth screens, partner
 * support and the partner-program legal pages (which duplicate the canonical
 * `/privacy` and `/terms` for a narrower audience).
 */
const INTENTIONALLY_NOINDEX = [
  '/partner/login',
  '/partner/signup',
  '/partner/forgot-password',
  '/partner/support',
  '/partner/privacy',
  '/partner/terms',
];

const findings = [];
const record = (severity, route, rule, detail) =>
  findings.push({ severity, route, rule, detail });

const visited = new Map(); // path -> status
const queue = [...SEEDS];
const referrers = new Map(); // path -> Set(referrer)

function normalise(href, from) {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return { bad: 'empty href' };
  if (trimmed === '#') return { bad: 'placeholder href "#"' };
  if (/^(mailto:|tel:|javascript:)/i.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.origin === BASE || u.hostname === 'reliastra.com') {
        return { path: u.pathname + u.search, hash: u.hash };
      }
    } catch {
      return { bad: `unparseable URL ${trimmed}` };
    }
    return null; // external, not our problem to crawl
  }
  if (trimmed.startsWith('#')) return { hashOnly: trimmed.slice(1) };
  try {
    const u = new URL(trimmed, `${BASE}${from}`);
    return { path: u.pathname + u.search, hash: u.hash };
  } catch {
    return { bad: `unparseable href ${trimmed}` };
  }
}

const decodeEntities = (v) =>
  v.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? m[1] : null;
};

async function fetchPage(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  const status = res.status;
  const ct = res.headers.get('content-type') ?? '';
  const html = ct.includes('text/html') ? await res.text() : '';
  return { status, html, location: res.headers.get('location') };
}

function auditHtml(path, html) {
  const isAuth =
    AUTH_ROUTES.some((r) => path === r || path.startsWith(`${r}?`)) ||
    INTENTIONALLY_NOINDEX.includes(path);

  // ── Chrome ─────────────────────────────────────────────────────────────
  if (!isAuth) {
    if (!/<header[\s>]/i.test(html))
      record('error', path, 'chrome', 'no <header> element rendered');
    if (!/<footer[\s>]/i.test(html))
      record('error', path, 'chrome', 'no <footer> element rendered');
    if (!/<main[\s>]/i.test(html))
      record('error', path, 'chrome', 'no <main> landmark');
  }

  // ── Headings ───────────────────────────────────────────────────────────
  const h1s = html.match(/<h1[\s>]/gi) ?? [];
  if (h1s.length === 0) record('error', path, 'headings', 'no <h1>');
  if (h1s.length > 1)
    record('error', path, 'headings', `${h1s.length} <h1> elements`);

  const levels = [...html.matchAll(/<h([1-6])[\s>]/gi)].map((m) => Number(m[1]));
  let prev = 0;
  for (const l of levels) {
    if (prev && l > prev + 1)
      record('warn', path, 'headings', `h${prev} followed by h${l}`);
    prev = l;
  }

  // ── Metadata ───────────────────────────────────────────────────────────
  const noindex = /<meta name="robots" content="[^"]*noindex/i.test(html);
  if (isAuth && !noindex)
    record('error', path, 'seo', 'auth route is not noindex');
  if (!isAuth && noindex && !INTENTIONALLY_NOINDEX.includes(path))
    record('warn', path, 'seo', 'public route is noindex');

  if (!/<title>[^<]{5,}<\/title>/i.test(html))
    record('error', path, 'seo', 'missing or trivial <title>');

  if (!isAuth) {
    if (!/<meta name="description" content="[^"]{40,}"/i.test(html))
      record('error', path, 'seo', 'missing or short meta description');
    if (!/<link rel="canonical"/i.test(html))
      record('warn', path, 'seo', 'no canonical link');
  }

  // ── Images ─────────────────────────────────────────────────────────────
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    if (!/\salt=/i.test(tag)) {
      record('error', path, 'a11y', `<img> without alt: ${tag.slice(0, 110)}`);
      continue;
    }
    const alt = attr(tag, 'alt');
    const hidden = /aria-hidden="true"/i.test(tag);
    if (alt === '' && !hidden)
      record(
        'warn',
        path,
        'a11y',
        `empty alt without aria-hidden: ${(attr(tag, 'src') ?? '').slice(0, 80)}`
      );
  }

  // ── Palette regressions ────────────────────────────────────────────────
  // Two families of regression are caught here:
  //  1. the "AI vibe-coded" palette the redesign brief bans outright, and
  //  2. light-theme Tailwind literals. The public surface is single-theme
  //     Obsidian; a `text-zinc-900` or `bg-white` reaching the rendered HTML
  //     means a section is painting dark text on a dark ground.
  for (const banned of [
    '#7C3AED',
    'text-gradient-brand',
    'from-purple',
    'to-cyan',
    'bg-gradient-to-r from-blue',
    'text-zinc-9',
    'text-zinc-8',
    'text-zinc-7',
    'text-zinc-6',
    'bg-zinc-5',
    'border-zinc-2',
    'bg-white ',
    'bg-white"',
    'text-emerald-6',
    'text-cyan-',
  ]) {
    if (html.includes(banned))
      record('warn', path, 'design', `banned token present: ${banned}`);
  }

  // ── Link extraction ────────────────────────────────────────────────────
  const links = [];
  const ids = new Set(
    [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
  );

  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = attr(tag, 'href');
    if (href === null) {
      if (!/role="button"/i.test(tag))
        record('warn', path, 'links', `<a> without href: ${tag.slice(0, 90)}`);
      continue;
    }
    const n = normalise(href, path);
    if (!n) continue;
    if (n.bad) {
      record('error', path, 'links', n.bad);
      continue;
    }
    if (n.hashOnly !== undefined) {
      if (n.hashOnly && !ids.has(n.hashOnly))
        record(
          'error',
          path,
          'links',
          `in-page anchor #${n.hashOnly} has no target`
        );
      continue;
    }
    if (n.hash) {
      const frag = n.hash.slice(1);
      if (n.path === path && frag && !ids.has(frag))
        record('error', path, 'links', `anchor #${frag} has no target`);
    }
    links.push(n.path);
  }

  // ── Local assets ───────────────────────────────────────────────────────
  const assets = new Set();
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = decodeEntities(attr(tag, 'src') ?? '');
    if (src.startsWith('/') && !src.startsWith('//')) assets.add(src);
  }
  for (const m of html.matchAll(/\/media\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp|avif|mp4)/g)) {
    assets.add(m[0]);
  }
  // `next/image` emits HTML-escaped query strings; decode before requesting.
  return { links, assets: [...assets].map(decodeEntities) };

}

async function main() {
  const assetChecks = new Set();

  while (queue.length) {
    const path = queue.shift();
    if (visited.has(path)) continue;
    if (SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))) {
      visited.set(path, 'skipped (authenticated)');
      continue;
    }

    let res;
    try {
      res = await fetchPage(path);
    } catch (err) {
      record('error', path, 'status', `request failed: ${err.message}`);
      visited.set(path, 'ERR');
      continue;
    }
    visited.set(path, res.status);

    if (res.status >= 400) {
      const from = [...(referrers.get(path) ?? [])].join(', ') || '(seed)';
      record('error', path, 'status', `HTTP ${res.status} - linked from ${from}`);
      continue;
    }
    if (res.status >= 300) {
      record('info', path, 'status', `HTTP ${res.status} → ${res.location}`);
      continue;
    }

    if (HEAD_ONLY.some((p) => path.startsWith(p))) continue;
    if (!res.html) continue;

    const { links, assets } = auditHtml(path, res.html);
    for (const a of assets) assetChecks.add(a);
    for (const l of links) {
      if (!referrers.has(l)) referrers.set(l, new Set());
      referrers.get(l).add(path);
      if (!visited.has(l) && !queue.includes(l)) queue.push(l);
    }
  }

  // 404 contract
  for (const path of EXPECT_404) {
    const res = await fetchPage(path);
    if (res.status !== 404)
      record('error', path, 'status', `expected 404, got ${res.status}`);
    else if (!/signal\s*lost/i.test(res.html))
      record('error', path, '404', 'not-found page missing "Signal lost"');
  }

  // Assets
  for (const a of assetChecks) {
    const res = await fetch(`${BASE}${a}`, { method: 'GET' });
    if (!res.ok) record('error', a, 'asset', `HTTP ${res.status}`);
  }

  // ── Report ─────────────────────────────────────────────────────────────
  const order = { error: 0, warn: 1, info: 2 };
  findings.sort(
    (a, b) => order[a.severity] - order[b.severity] || a.route.localeCompare(b.route)
  );

  const pages = [...visited.entries()].filter(([, s]) => s !== 'skipped (authenticated)');
  console.log(`\nRELIASTRA public-site audit - ${BASE}`);
  console.log(`${pages.length} routes crawled, ${assetChecks.size} assets checked\n`);

  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  if (!findings.length) console.log('No findings.');
  for (const f of findings) {
    console.log(
      `${f.severity.toUpperCase().padEnd(5)} ${f.route.padEnd(46)} ${f.rule.padEnd(9)} ${f.detail}`
    );
  }

  console.log('\n── Route status ──');
  for (const [p, s] of [...visited.entries()].sort()) {
    console.log(`${String(s).padEnd(24)} ${p}`);
  }

  console.log(
    `\n${counts.error} error(s), ${counts.warn} warning(s), ${counts.info} info.`
  );
  process.exit(counts.error > 0 ? 1 : 0);
}

main();
