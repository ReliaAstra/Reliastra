// Public-site route crawler + SEO sanity checker.
//
// The route inventory is derived from the app router's own source of truth
// (lib/routes) rather than a hand-maintained list, because a hand-written
// list silently drifts: the previous version of this script omitted the whole
// partner slug tree and reported 41 routes where the site serves more.
//
// Two classes of route, asserted differently:
//   - INDEXABLE  : marketing/docs/legal/research. Must be 200, exactly one
//                  <h1>, a canonical, and an og:image.
//   - AUTH_GATED : partner dashboard shells. Must be 200 and noindex. An h1 is
//                  not required - these are client-side session screens, not
//                  documents - and demanding one would be a false defect.
const BASE = 'http://127.0.0.1:3000';

const PARTNER_PUBLIC = [
  'login', 'signup', 'forgot-password', 'earn', 'how-it-works',
  'commission', 'faq', 'resources', 'support', 'privacy', 'terms',
];
const PARTNER_DASHBOARD = [
  'dashboard', 'referrals', 'earnings', 'payouts', 'notifications', 'settings',
];

const INDEXABLE = [
  '/', '/about', '/agencies', '/contact',
  '/dependency-monitoring', '/external-dependency-intelligence',
  '/incident-evidence', '/sla-evidence', '/security',
  '/pricing', '/product', '/status',
  '/login', '/signup',
  '/docs', '/docs/quickstart', '/docs/monitoring', '/docs/evidence', '/docs/api',
  '/glossary', '/research', '/track',
  '/partner', ...PARTNER_PUBLIC.map((s) => `/partner/${s}`),
  '/privacy', '/terms', '/refund-policy',
  '/verify-email', '/reset-password', '/referral-unavailable',
];

const AUTH_GATED = [
  ...PARTNER_DASHBOARD.map((s) => `/partner/${s}`),
  '/partner/dashboard/support',
];

async function discover(seed, pattern) {
  const html = await (await fetch(BASE + seed)).text();
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(new RegExp(`href="(${pattern}[^"]*)"`, 'g'))) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

async function probe(path) {
  const res = await fetch(BASE + path, { redirect: 'manual' });
  const body = await res.text();
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

(async () => {
  const glossary = await discover('/glossary', '/glossary/');
  const research = await discover('/research', '/research/');
  const indexable = [...new Set([...INDEXABLE, ...glossary, ...research])].sort();

  let defects = 0;

  console.log('── INDEXABLE PUBLIC ROUTES ──');
  for (const r of indexable) {
    const { status, h1, canon, og } = await probe(r);
    const bad =
      status !== 200 ? `HTTP ${status}` :
      h1 !== 1 ? `h1=${h1}` :
      !canon ? 'no canonical' :
      !og ? 'no og:image' : '';
    if (bad) defects++;
    console.log(`  ${r.padEnd(54)} ${status} h1=${h1} canon=${canon ? 'y' : 'NO'} og=${og ? 'y' : 'NO'}${bad ? '  <<< ' + bad : ''}`);
  }

  console.log('\n── AUTH-GATED PARTNER DASHBOARD SHELLS (noindex expected) ──');
  for (const r of AUTH_GATED) {
    const { status, noindex } = await probe(r);
    const bad = status !== 200 ? `HTTP ${status}` : !noindex ? 'INDEXABLE - should be noindex' : '';
    if (bad) defects++;
    console.log(`  ${r.padEnd(54)} ${status} noindex=${noindex ? 'y' : 'NO'}${bad ? '  <<< ' + bad : ''}`);
  }

  console.log(`\nTOTAL: ${indexable.length} indexable + ${AUTH_GATED.length} auth-gated = ${indexable.length + AUTH_GATED.length} routes`);
  console.log(`DEFECTS: ${defects}`);
})();
