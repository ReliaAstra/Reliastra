import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
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
  // NOTE: `/partner` and `/partner/*` are REAL file routes (the Partner
  // Network home and public pages) - they must never be redirected. Legacy
  // `/?page=<slug>` query URLs are permanently redirected to them by the
  // proxy (src/proxy.ts), which is the only layer that can match on query.
  async redirects() {
    const consoleSections = [
      "settings",
      "dependencies",
      "incidents",
      "evidence",
      "clients",
    ];
    return [
      // "Vendor Tracking" is the public label for the Track experience, but
      // the canonical route is `/track` - redirect instead of duplicating.
      {
        source: "/vendor-tracking",
        destination: "/track",
        permanent: true,
      },
      {
        source: "/vendor-tracking/:path*",
        destination: "/track/:path*",
        permanent: true,
      },
      // Plural guess for the Partner Network home.
      {
        source: "/partners",
        destination: "/partner",
        permanent: true,
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
        source: "/portal/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
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
      // llms.txt family: machine-readable, cacheable, plain text.
      {
        source: "/llms.txt",
        headers: [{ key: "Content-Type", value: "text/plain; charset=utf-8" }],
      },
      {
        source: "/llms-full.txt",
        headers: [{ key: "Content-Type", value: "text/plain; charset=utf-8" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          // Preferred Sources publisher.js - narrowest allow for Google's script
          {
            key: "Content-Security-Policy",
            value: "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://news.google.com; connect-src 'self' https://news.google.com; frame-src https://news.google.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
