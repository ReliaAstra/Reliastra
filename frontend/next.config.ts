import type { NextConfig } from "next";

/**
 * Whether this deployment may be indexed.
 *
 * This MUST stay in step with `isIndexableSite()` in `src/lib/site-url.ts`:
 * the config file is evaluated outside the app bundle and cannot import it, so
 * the rule is written out here a second time. `src/lib/__tests__/indexability.test.ts`
 * is the drift guard - it asserts this file still names the same production
 * hosts and the same override variable.
 *
 * The gate matters because every page publishes a canonical URL pointing at
 * the production origin: a preview or staging host that serves `index, follow`
 * asks search engines to index a duplicate of the real dependency records.
 */
const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://reliastra.com"
).replace(/\/$/, "");

const INDEXABILITY_OVERRIDE = process.env.NEXT_PUBLIC_SITE_INDEXABLE;

const CONFIGURED_HOST = (() => {
  try {
    return new URL(SITE_ORIGIN).hostname.toLowerCase();
  } catch {
    // An unparsable site URL is not a licence to index.
    return null;
  }
})();

const INDEXABLE_DEPLOYMENT: boolean =
  INDEXABILITY_OVERRIDE === "true"
    ? true
    : INDEXABILITY_OVERRIDE === "false"
      ? false
      : CONFIGURED_HOST === "reliastra.com" || CONFIGURED_HOST === "www.reliastra.com";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Dev-only Next indicator; it never ships, and it pollutes visual QA captures.
  devIndicators: false,
  // Cinematic photography is the public site's heaviest asset class. AVIF/WebP
  // negotiation plus an explicit quality allow-list keeps the hero under
  // control on mobile without hand-exporting derivatives.
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [70, 75, 82],
    deviceSizes: [360, 420, 640, 828, 1080, 1280, 1600, 1920, 2560],
  },
  // Allow Arena live preview host (e2b) to fetch dev resources - fixes "stuck at loading UI"
  // Next.js 15+ blocks cross-origin dev asset requests by default.
  allowedDevOrigins: [
    // Local tooling (a headless browser, curl, a second container) commonly
    // reaches the dev server by IP; without this, /_next/* is blocked and the
    // page never hydrates.
    "127.0.0.1",
    "*.e2b.app",
    "*.e2b.dev",
    "3000-*.e2b.app",
    "*.e2b-preview.com",
  ],
  // The console lives at top-level routes (`/settings/billing`, `/incidents`, …)
  // under the `(console)` route group, which contributes no URL segment. Links
  // shared or bookmarked as `/dashboard/<section>` therefore 404. Redirect the
  // `/dashboard/*` shape onto the canonical routes instead of dead-ending.
  //
  // NOTE: the B2B console surfaces (/partner*, /portal, console /agency +
  // /clients) were removed in the developer-first refurbishment. Their URLs
  // resolve to the closest surviving destination below; the destinations
  // own the explanation. The `/agencies` marketing page has since been
  // restored and is served directly.
  async redirects() {
    const consoleSections = [
      "settings",
      "dependencies",
      "incidents",
      "evidence",
    ];
    return [
      // Preserve previously shared URLs after moving to a static social image.
      {
        source: "/opengraph-image",
        destination: "/opengraph-image.png",
        permanent: true,
      },
      // ── Developer-first consolidation (this refurbishment) ───────────
      // Four capability pages made three different claims about the same two
      // subjects, each with its own metadata and its own description of the
      // detection rule. One product page owns that explanation now, and
      // `/product/evidence` owns the artifact. `/track` became `/observatory`
      // because the surface is a public measurement instrument, not a vendor
      // directory. Permanent (308) so the equity moves with the content.
      {
        source: "/external-dependency-intelligence",
        destination: "/product",
        permanent: true,
      },
      {
        source: "/dependency-monitoring",
        destination: "/product",
        permanent: true,
      },
      {
        source: "/incident-evidence",
        destination: "/product/evidence",
        permanent: true,
      },
      {
        source: "/sla-evidence",
        destination: "/product/evidence",
        permanent: true,
      },
      // Public observatory. Records keep their path under the new root, so a
      // URL someone cited in an incident review still resolves.
      {
        source: "/track",
        destination: "/observatory",
        permanent: true,
      },
      {
        source: "/track/:path*",
        destination: "/observatory/:path*",
        permanent: true,
      },
      {
        source: "/vendor-tracking",
        destination: "/observatory",
        permanent: true,
      },
      {
        source: "/vendor-tracking/:path*",
        destination: "/observatory/:path*",
        permanent: true,
      },
      // ── Removed B2B surfaces ──────────────────────────────────────────
      // The partner portal is gone; the lightweight creator program lives
      // at /creators. Old partner URLs land there.
      {
        source: "/partners",
        destination: "/creators",
        permanent: true,
      },
      {
        source: "/partner",
        destination: "/creators",
        permanent: true,
      },
      {
        source: "/partner/:path*",
        destination: "/creators",
        permanent: true,
      },
      // The agency/client console surfaces are gone; console bookmarks land
      // on the dashboard. The `/agencies` marketing page itself has been
      // restored as a first-class route, so it no longer redirects.
      {
        source: "/organization",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/agency",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/clients",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/clients/:path*",
        destination: "/dashboard",
        permanent: false,
      },
      ...consoleSections.flatMap((section) => [
        {
          source: `/dashboard/${section}`,
          destination: `/${section}`,
          permanent: false,
        },
        {
          source: `/dashboard/${section}/:path*`,
          destination: `/${section}/:path*`,
          permanent: false,
        },
      ]),
    ];
  },
  // `/docs/<slug>.md` serves the plain-Markdown form of a guide - the
  // "append .md" convention an agent already knows, and the way to read one
  // guide without fetching `/llms-full.txt` in its entirety.
  //
  // The handler cannot live at `app/docs/[slug]/route.ts`: the App Router
  // refuses a `route.ts` and a `page.tsx` in the same dynamic segment, and
  // `app/docs/[file]/route.ts` would collide with `app/docs/[slug]/page.tsx`
  // as a differently-named match on the same path. So the handler sits at
  // `/docs-md/<slug>` and is rewritten here. Rewrites run before the
  // filesystem, so `/docs/monitoring.md` never reaches the page router and
  // never 404s against `docFor("monitoring.md")`.
  async rewrites() {
    return [
      {
        source: "/docs/:slug.md",
        destination: "/docs-md/:slug",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, PATCH, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type, X-Organization-ID, Reliastra-Organization, X-Request-ID, Idempotency-Key, X-Requested-With" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
          // APIs are data, not documents: never index.
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      // Token-scoped shares and per-customer checkout must never be indexed
      // even if a URL leaks: defense in depth behind the metadata noindex.
      {
        source: "/reports/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
      {
        source: "/checkout/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
      // Partner referral links are personal, uncacheable, and must never be
      // indexed. The resolver itself also sets these on the 302.
      {
        source: "/r",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
      {
        source: "/r/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
      {
        source: "/referral-unavailable",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
      // NOTE: the /llms.txt family used to set Content-Type here as well as in
      // its route handlers, which put two Content-Type headers on one response.
      // The route handlers own it (they know the charset they emitted); this
      // list no longer repeats it.
      {
        source: "/:path*",
        headers: [
          // Preferred Sources publisher.js - narrowest allow for Google's script
          {
            key: "Content-Security-Policy",
            value: "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://news.google.com; connect-src 'self' https://news.google.com; frame-src https://news.google.com;",
          },
          // NOTE: `X-Frame-Options: ALLOWALL` was removed. ALLOWALL is not a
          // valid token (the spec allows DENY, SAMEORIGIN and the obsolete
          // ALLOW-FROM), so browsers ignored it, and in production it collided
          // with the `X-Frame-Options: SAMEORIGIN` that Caddy sets on every
          // response - two headers, most restrictive wins. Framing policy is
          // owned by the edge; nothing here needs to contradict it.
          //
          // A deployment that must not be indexed says so at the transport
          // layer too, so a route that sets its own metadata cannot opt back
          // in. Mirrors `isIndexableSite()` in src/lib/site-url.ts.
          ...(INDEXABLE_DEPLOYMENT
            ? []
            : [
                {
                  key: "X-Robots-Tag",
                  value: "noindex, nofollow, noarchive",
                },
              ]),
        ],
      },
    ];
  },
};

export default nextConfig;
