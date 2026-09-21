#!/usr/bin/env node
/**
 * Public-route and machine-readable-surface verifier.
 *
 * The indexable route inventory is read from `/sitemap.xml` rather than
 * maintained here. A hand-written list is how this script came to assert that
 * `/track`, `/partner/*` and four other retired URLs were indexable 200s - they
 * are 308s - while never mentioning `/observatory`, `robots.txt`, `llms.txt` or
 * the sitemap itself, which are the surfaces a crawler actually reads first.
 * Deriving the list from the sitemap means the two cannot disagree, and a page
 * the site publishes but forgets to list is caught by the crawl in
 * `audit-public-site.mjs`.
 *
 * Classes asserted:
 *   1. SITEMAP        every `<loc>` is canonical, unique, and serves 200 with
 *                     exactly one <h1>, a canonical, an og:image, and no noindex.
 *   2. CROSS-CHECK    every record the observatory index links to is in the
 *                     sitemap (the silent-withdrawal signature).
 *   3. ROBOTS         no blanket `Allow: /`, private surfaces disallowed.
 *   4. LLM DISCOVERY  both files are plain text, absolute, and honest about
 *                     what they could not read.
 *   5. RETIRED        the consolidated URLs still 308 to where they went.
 *   6. NOINDEX        console, auth, checkout and token-scoped surfaces are
 *                     never indexable.
 *
 * Usage:  node scripts/verify-public-routes.mjs [baseUrl]
 * Env:    CANONICAL_ORIGIN (default https://reliastra.com)
 * Exit code is 1 if any defect is recorded.
 */

const BASE = (process.argv[2] ?? process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const CANONICAL_ORIGIN = (process.env.CANONICAL_ORIGIN ?? 'https://reliastra.com').replace(/\/$/, '');

/**
 * Retired URLs and the route that absorbed them (308, per next.config.ts).
 *
 * `/track/:path*` keeps its path, so the retired record and incident URLs still
 * reach the page they named. `/partner/:path*` does not: it flattens to
 * `/creators`, which is the point - the B2B network is gone, so a bookmarked
 * `/partner/commission` has nothing more specific to land on.
 */
const RETIRED = [
  ['/track', '/observatory'],
  ['/track/openai', '/observatory/openai'],
  ['/vendor-tracking', '/observatory'],
  ['/external-dependency-intelligence', '/product'],
  ['/dependency-monitoring', '/product'],
  ['/incident-evidence', '/product/evidence'],
  ['/sla-evidence', '/product/evidence'],
  ['/partner', '/creators'],
  ['/partners', '/creators'],
  ['/partner/commission', '/creators'],
];

/** Surfaces that must never be indexable, whatever their status code. */
const NOINDEX = ['/dashboard', '/incidents', '/evidence', '/settings', '/onboarding', '/checkout'];

let defects = 0;
let warnings = 0;
const defect = (where, what) => {
  defects += 1;
  console.log(`  DEFECT ${where}: ${what}`);
};
const warn = (where, what) => {
  warnings += 1;
  console.log(`  warn   ${where}: ${what}`);
};

async function get(path, init) {
  const res = await fetch(BASE + path, init);
  return { res, body: await res.text() };
}

/** A canonical https://reliastra.com/... URL as a path on BASE. */
function toLocal(url) {
  return url.startsWith(CANONICAL_ORIGIN) ? url.slice(CANONICAL_ORIGIN.length) || '/' : url;
}

async function probe(path) {
  const { res, body } = await get(path, { redirect: 'manual' });
  const doc = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return {
    status: res.status,
    h1: (doc.match(/<h1[\s>]/g) || []).length,
    canon: /<link[^>]+rel="canonical"/.test(body),
    og: /property="og:image"/.test(body),
    noindex: /name="robots"[^>]*noindex/.test(body),
  };
}

/* ── 1 + 2. the sitemap, and the routes it claims ───────────────────────── */

async function verifySitemap() {
  console.log('── SITEMAP ──');
  const { res, body } = await get('/sitemap.xml');

  if (res.status >= 500) {
    // Correct behaviour when the measurement API is down and no last-good
    // catalog remains: a 5xx leaves the crawler holding the previous sitemap,
    // where a 200 without the records tells it those records are gone.
    warn('/sitemap.xml', `HTTP ${res.status} - the catalog could not be read; record URLs not verified`);
    return [];
  }
  if (res.status !== 200) defect('/sitemap.xml', `HTTP ${res.status}`);

  const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (!urls.length) defect('/sitemap.xml', 'contains no <loc> entries');

  const duplicates = urls.filter((u, i) => urls.indexOf(u) !== i);
  if (duplicates.length) {
    defect('/sitemap.xml', `${duplicates.length} duplicate <loc> entries: ${[...new Set(duplicates)].slice(0, 3).join(', ')}`);
  }

  const offOrigin = urls.filter((u) => !u.startsWith(`${CANONICAL_ORIGIN}/`) && u !== `${CANONICAL_ORIGIN}/`);
  if (offOrigin.length) {
    defect('/sitemap.xml', `${offOrigin.length} URLs are not on the canonical origin: ${offOrigin.slice(0, 3).join(', ')}`);
  }

  const lastmods = [...body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1].trim());
  const now = Date.now();
  const fabricated = lastmods.filter((d) => {
    const t = Date.parse(d);
    // Every static page claiming "modified now" is what makes a crawler stop
    // believing the field on the records where the date is real.
    return Number.isNaN(t) || Math.abs(t - now) < 60_000;
  });
  if (fabricated.length > 3) {
    defect('/sitemap.xml', `${fabricated.length} <lastmod> values equal the request time`);
  }

  console.log(`  ${urls.length} URLs, ${lastmods.length} with a lastmod, ${duplicates.length} duplicates`);
  return urls;
}

async function verifySitemapRoutes(urls) {
  console.log('\n── SITEMAP ROUTES (200, one h1, canonical, og:image, indexable) ──');
  let checked = 0;
  for (const url of urls) {
    const path = toLocal(url);
    const { status, h1, canon, og, noindex } = await probe(path);
    checked += 1;
    const bad =
      status !== 200 ? `HTTP ${status}` :
      h1 !== 1 ? `h1=${h1}` :
      !canon ? 'no canonical' :
      !og ? 'no og:image' :
      noindex ? 'noindex on a sitemap URL' : '';
    if (bad) defect(path, bad);
    if (bad || checked % 25 === 0) {
      console.log(`  ${path.padEnd(58)} ${status} h1=${h1}${bad ? '  <<< ' + bad : ''}`);
    }
  }
  console.log(`  checked ${checked} routes`);
}

async function crossCheckRecords(sitemapUrls) {
  console.log('\n── RECORD CROSS-CHECK (index links vs sitemap) ──');
  const { res, body } = await get('/observatory');
  if (res.status !== 200) {
    warn('/observatory', `HTTP ${res.status}; cannot cross-check record URLs`);
    return;
  }
  const linked = [...new Set(
    [...body.matchAll(/href="(\/observatory\/[^"?#]+)"/g)].map((m) => m[1])
  )];
  if (!linked.length) {
    warn('/observatory', 'lists no dependency records; nothing to cross-check');
    return;
  }
  const listed = new Set(sitemapUrls.map(toLocal));
  const missing = linked.filter((p) => !listed.has(p));
  if (missing.length) {
    // The exact signature of the old failure: the catalog read failed, so the
    // sitemap quietly dropped every record URL while the index still linked them.
    defect('/sitemap.xml', `${missing.length} records linked from /observatory are not in the sitemap: ${missing.slice(0, 3).join(', ')}`);
  }
  console.log(`  ${linked.length} records linked from the index, ${missing.length} missing from the sitemap`);
}

/* ── 3 + 4. the machine-readable surfaces ───────────────────────────────── */

async function verifyRobots() {
  console.log('\n── ROBOTS.TXT ──');
  const { res, body } = await get('/robots.txt');
  if (res.status !== 200) return defect('/robots.txt', `HTTP ${res.status}`);
  if (!/text\/plain/.test(res.headers.get('content-type') ?? '')) {
    defect('/robots.txt', `content-type is ${res.headers.get('content-type')}`);
  }

  const lines = body.split('\n').map((l) => l.trim());
  const allowAll = lines.findIndex((l) => /^Allow:\s*\/\s*$/i.test(l));
  const firstDisallow = lines.findIndex((l) => /^Disallow:/i.test(l));

  /**
   * Next.js writes Allow lines before Disallow lines. Longest-match readers
   * resolve that correctly; first-match readers - Python's urllib.robotparser
   * up to 3.12 and the ports of it many agent crawlers use - stop at the first
   * match, so a blanket `Allow: /` voids every disallow below it.
   */
  if (allowAll !== -1) {
    defect('/robots.txt', `emits a blanket "Allow: /" at line ${allowAll + 1}${
      firstDisallow > allowAll ? `, before ${lines.length - firstDisallow} disallow rules` : ''
    }`);
  }
  if (!lines.some((l) => /^Sitemap:/i.test(l))) defect('/robots.txt', 'no Sitemap: line');
  for (const path of ['/dashboard', '/admin', '/api/', '/login', '/reports/']) {
    if (!lines.some((l) => l.toLowerCase() === `disallow: ${path.toLowerCase()}`)) {
      defect('/robots.txt', `does not disallow ${path}`);
    }
  }
  console.log(`  ${lines.filter((l) => /^Disallow:/i.test(l)).length} disallow rules, no blanket allow`);
}

async function verifyLlmFiles() {
  console.log('\n── LLM DISCOVERY FILES ──');
  for (const path of ['/llms.txt', '/llms-full.txt']) {
    const { res, body } = await get(path);
    if (res.status !== 200) {
      defect(path, `HTTP ${res.status}`);
      continue;
    }
    if (!/text\/plain/.test(res.headers.get('content-type') ?? '')) {
      defect(path, `content-type is ${res.headers.get('content-type')}`);
    }
    // A duplicated header arrives from fetch() joined with a comma, and
    // `text/plain; charset=utf-8` never contains one.
    if (String(res.headers.get('content-type') ?? '').includes(',')) {
      defect(path, 'more than one Content-Type header on the response');
    }

    const urls = [...body.matchAll(/https?:\/\/[^\s)>,]+/g)].map((m) => m[0]);
    const ours = urls.filter((u) => u.includes('reliastra.com'));
    const offOrigin = ours.filter((u) => !u.startsWith(`${CANONICAL_ORIGIN}/`) && !u.startsWith('https://api.reliastra.com/'));
    if (offOrigin.length) {
      defect(path, `${offOrigin.length} RELIASTRA URLs are not on a canonical origin: ${offOrigin.slice(0, 3).join(', ')}`);
    }
    // The topology limit a model must not drop.
    if (!body.toLowerCase().includes('observation point')) {
      defect(path, 'does not state how many observation points are deployed');
    }
    console.log(`  ${path}: ${body.length} bytes, ${ours.length} RELIASTRA URLs`);
  }

  // llms.txt enumerates the records, or says plainly that it could not.
  const { body } = await get('/llms.txt');
  const records = [...body.matchAll(/https:\/\/reliastra\.com\/observatory\/[^)\s]+/g)].map((m) => m[0]);
  if (!records.length && !/could not be read|No dependency records are published yet/i.test(body)) {
    defect('/llms.txt', 'lists no dependency records and does not say why');
  }
  if (/refresh cadence \(60s\)|90-day window/.test(body)) {
    defect('/llms.txt', 'states a cadence or retention window the deployment does not implement');
  }
  console.log(`  /llms.txt enumerates ${records.length} dependency record URLs`);

  // The CLI section must match the CLI that ships.
  const { body: full } = await get('/llms-full.txt');
  if (/npm install -g \.\/Reliastra\/cli|bin\/reliastra\.mjs/.test(full)) {
    defect('/llms-full.txt', 'documents the retired Node CLI install path');
  }
}

/* ── 5 + 6. redirects and non-indexable surfaces ────────────────────────── */

async function verifyRetired() {
  console.log('\n── RETIRED URLs (308 to the page that absorbed them) ──');
  for (const [from, to] of RETIRED) {
    const { res } = await get(from, { redirect: 'manual' });
    const location = res.headers.get('location') ?? '';
    if (![301, 308].includes(res.status)) {
      defect(from, `HTTP ${res.status}, expected a 308`);
    } else if (!location.includes(to)) {
      defect(from, `redirects to ${location || 'nothing'}, expected ${to}`);
    } else {
      console.log(`  ${from.padEnd(42)} ${res.status} -> ${location}`);
    }
  }
}

async function verifyNoindex() {
  console.log('\n── NON-INDEXABLE SURFACES ──');
  for (const path of NOINDEX) {
    const { status, noindex } = await probe(path);
    // A redirect out of the surface is as good as a noindex on it.
    if (status < 300 && !noindex) {
      defect(path, `HTTP ${status} and indexable`);
    } else {
      console.log(`  ${path.padEnd(42)} ${status} noindex=${noindex ? 'y' : 'redirected'}`);
    }
  }
}

(async () => {
  console.log(`Verifying ${BASE} against canonical origin ${CANONICAL_ORIGIN}\n`);
  try {
    const urls = await verifySitemap();
    if (urls.length) await verifySitemapRoutes(urls);
    await crossCheckRecords(urls);
    await verifyRobots();
    await verifyLlmFiles();
    await verifyRetired();
    await verifyNoindex();
  } catch (err) {
    defect('run', `could not reach ${BASE}: ${err.message}`);
  }

  console.log(`\nDEFECTS: ${defects}   WARNINGS: ${warnings}`);
  process.exit(defects ? 1 : 0);
})();
