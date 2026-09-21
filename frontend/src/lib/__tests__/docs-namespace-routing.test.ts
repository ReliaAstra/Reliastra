/**
 * The `/docs` namespace must be served by Next.js, never by FastAPI.
 *
 * This test exists because of a production outage that nothing else caught.
 * reliastra.com answered all thirteen documentation URLs - `/docs` and every
 * guide in the corpus - with the API's generic error envelope:
 *
 *     404 {"error":{"code":"RESOURCE_NOT_FOUND","message":"Not Found", …}}
 *
 * The cause was not in the app. FastAPI is configured with
 * `docs_url="/api-docs"` (backend/app/bootstrap/app_factory.py) precisely so
 * that the apex `/docs` namespace stays free for the public documentation, so
 * the backend serves no `/docs` route at all and answers with its 404 handler
 * (backend/app/platform/web/errors.py). The edge proxy was sending `/docs*` to
 * the backend port instead of Next.js, and because the proxy split is decided
 * in `deploy/production/Caddyfile` - a file no other test reads, validated by
 * a smoke test that only ever requested `/` - the whole namespace could vanish
 * while the landing page, the console and the API all stayed green.
 *
 * The site's own tests could not see it either: they assert route *tables*, so
 * a corpus entry with a correct `/docs/<slug>` path passes whether or not
 * anything serves it. The defect lives in the gap between "this route is
 * declared" and "this route is reachable", and that gap is what is asserted
 * here - by reading the deployed proxy config and the backend's own console
 * prefixes, not by restating the route table.
 *
 * Nothing in this file needs a network or a running Caddy: the config is text,
 * and the claim it must make is checkable from the text.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DOCS } from '@/lib/docs/corpus';
import { PUBLIC_PAGES } from '@/lib/seo';
import { DOCS_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const CADDYFILE = readFileSync(
  join(REPO_ROOT, 'deploy', 'production', 'Caddyfile'),
  'utf8'
);
const APP_FACTORY = readFileSync(
  join(REPO_ROOT, 'backend', 'app', 'bootstrap', 'app_factory.py'),
  'utf8'
);
const SMOKE_TEST = readFileSync(
  join(REPO_ROOT, 'deploy', 'production', 'scripts', 'smoke-test.sh'),
  'utf8'
);

/* ── The proxy's own routing table, read out of the Caddyfile ─────────────── */

/**
 * The two upstreams the all-in-one container publishes: Next.js on 3000 and
 * FastAPI on 8000 (see deploy/production/compose.yml).
 */
const WEB_UPSTREAM = 'reliastra-api:3000';
const API_UPSTREAM = 'reliastra-api:8000';

interface HandleBlock {
  /** The matcher as written, e.g. `/docs*`, or `''` for the bare catch-all. */
  matcher: string;
  /** Every `reverse_proxy` target inside the block. */
  upstreams: string[];
}

/**
 * Parse the mutually-exclusive `handle` blocks out of a Caddyfile.
 *
 * Only what this test needs is understood: the matcher on the `handle` line,
 * and the upstream each contained `reverse_proxy` names. Comments and the
 * `{$VAR:default}` environment placeholders are dropped first, because neither
 * can carry routing meaning and both would otherwise be mistaken for it.
 */
function parseHandleBlocks(source: string): HandleBlock[] {
  const cleaned = source
    .split('\n')
    .map((line) => {
      // A `#` only starts a comment outside a quoted string; this file quotes
      // header values only, so a line-leading `#` is the case that matters.
      const trimmed = line.trimStart();
      return trimmed.startsWith('#') ? '' : line.replace(/\s+#.*$/, '');
    })
    .join('\n')
    .replace(/\{\$[A-Za-z_][A-Za-z0-9_]*(:[^}]*)?\}/g, '');

  const blocks: HandleBlock[] = [];
  let current: HandleBlock | null = null;
  let depth = 0;

  for (const rawLine of cleaned.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (current === null) {
      const handle = /^handle\s*([^\s{]*)\s*\{$/.exec(line);
      if (handle) {
        current = { matcher: handle[1], upstreams: [] };
        depth = 1;
        continue;
      }
      // Any other top-level block (site address, `header`, `log`, …) is
      // skipped without becoming a routing claim.
      continue;
    }

    for (const ch of line) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }

    const proxy = /^reverse_proxy\s+(\S+)/.exec(line);
    if (proxy) current.upstreams.push(proxy[1]);

    if (depth <= 0) {
      blocks.push(current);
      current = null;
      depth = 0;
    }
  }

  return blocks;
}

/**
 * Normalize a Caddy path matcher to the prefix it claims.
 *
 * `/docs*` claims `/docs`; `/v1/*` claims `/v1/`. An empty matcher is the
 * catch-all and claims everything, which callers must handle explicitly.
 */
function claimedPrefix(matcher: string): string {
  return matcher.replace(/\*+$/, '');
}

/** True when `prefix` matches `path` the way a Caddy prefix matcher would. */
function prefixMatches(prefix: string, path: string): boolean {
  if (prefix === '') return true;
  return path === prefix || path.startsWith(prefix);
}

const HANDLES = parseHandleBlocks(CADDYFILE);

/**
 * Which upstream a path reaches, using Caddy's rule that a matcher'd `handle`
 * wins over the bare catch-all. Verified against production: `/openapi.json`
 * reaches FastAPI even though the bare `handle` is written first in the file.
 */
function upstreamFor(path: string): string | null {
  const specific = HANDLES.find(
    (h) => h.matcher !== '' && prefixMatches(claimedPrefix(h.matcher), path)
  );
  const chosen = specific ?? HANDLES.find((h) => h.matcher === '');
  return chosen?.upstreams[0] ?? null;
}

/** Every path the site publishes, from the two tables that generate them. */
const PUBLISHED_PATHS: string[] = [
  ...Object.values(DOCS_ROUTES),
  ...Object.values(PUBLIC_ROUTES),
  ...PUBLIC_PAGES.map((p) => p.path),
];

/* ── The documentation namespace ─────────────────────────────────────────── */

describe('the /docs namespace at the edge', () => {
  it('finds a bare catch-all and the two known upstreams', () => {
    // Guards the parser itself: if the Caddyfile is restructured such that
    // nothing is parsed, every assertion below would pass vacuously.
    expect(HANDLES.length).toBeGreaterThan(3);
    expect(HANDLES.some((h) => h.matcher === '')).toBe(true);
    const upstreams = new Set(HANDLES.flatMap((h) => h.upstreams));
    expect(upstreams).toEqual(new Set([WEB_UPSTREAM, API_UPSTREAM]));
  });

  it('routes the docs index to Next.js', () => {
    expect(upstreamFor('/docs')).toBe(WEB_UPSTREAM);
  });

  it('routes every published documentation guide to Next.js', () => {
    const misrouted = Object.values(DOCS_ROUTES).filter(
      (path) => path !== DOCS_ROUTES.index && upstreamFor(path) !== WEB_UPSTREAM
    );
    expect(misrouted).toEqual([]);
  });

  it('never hands a documentation path to the API upstream', () => {
    const stolen = HANDLES.filter(
      (h) =>
        h.matcher !== '' &&
        h.upstreams.includes(API_UPSTREAM) &&
        DOCS.some((doc) =>
          prefixMatches(claimedPrefix(h.matcher), `/docs/${doc.slug}`)
        )
    ).map((h) => h.matcher);
    expect(stolen).toEqual([]);
  });

  it('claims /docs positively rather than by falling through', () => {
    // The outage came from a config that was correct only by omission: no rule
    // mentioned `/docs`, so any stale rule that did claim it won silently.
    // Require an explicit claim on the web upstream.
    const claim = HANDLES.find(
      (h) => h.matcher !== '' && prefixMatches(claimedPrefix(h.matcher), '/docs')
    );
    expect(claim, 'expected an explicit handle block claiming /docs').toBeDefined();
    expect(claim?.upstreams).toEqual([WEB_UPSTREAM]);
  });
});

/* ── The general case: the backend may not shadow a published route ──────── */

describe('the proxy split', () => {
  it('sends no published site route to the API upstream', () => {
    // This is the class of bug, not just the one instance. A backend prefix
    // that covers a page the sitemap publishes is a dead page, whatever the
    // prefix was chosen for.
    const shadowed = PUBLISHED_PATHS.filter(
      (path) => upstreamFor(path) === API_UPSTREAM
    );
    expect(shadowed).toEqual([]);
  });

  it('keeps the backend console prefixes off the documentation namespace', () => {
    // Read the prefixes FastAPI actually mounts, from FastAPI's own config.
    const consolePrefixes = ['docs_url', 'redoc_url', 'openapi_url']
      .map((key) => new RegExp(`${key}\\s*=\\s*"([^"]+)"`).exec(APP_FACTORY)?.[1])
      .filter((v): v is string => Boolean(v));

    expect(consolePrefixes).toHaveLength(3);

    for (const prefix of consolePrefixes) {
      expect(
        DOCS.some((doc) => prefixMatches(prefix, `/docs/${doc.slug}`)),
        `FastAPI console prefix ${prefix} collides with the documentation namespace`
      ).toBe(false);
      // And the prefix must be reachable on the API upstream, or the console
      // is unreachable for the opposite reason.
      expect(upstreamFor(prefix)).toBe(API_UPSTREAM);
    }
  });

  it('still reaches the API for the paths the site expects it to serve', () => {
    // The other half of the split, so a fix that simply routed everything to
    // Next.js cannot pass.
    for (const path of ['/v1/vendors', '/health/ready', '/openapi.json', '/api-docs']) {
      expect(upstreamFor(path), `${path} should reach the API`).toBe(API_UPSTREAM);
    }
  });
});

/* ── The deploy-time guard must exist ────────────────────────────────────── */

describe('the production smoke test', () => {
  it('probes the documentation namespace through the proxy', () => {
    // The smoke test is what runs on the host after a deploy. If it only ever
    // requests `/`, a vanished `/docs` ships green - which is exactly what
    // happened. Assert the coverage survives.
    expect(SMOKE_TEST).toMatch(/\/docs/);
    expect(SMOKE_TEST).toMatch(/RESOURCE_NOT_FOUND/);
  });
});
