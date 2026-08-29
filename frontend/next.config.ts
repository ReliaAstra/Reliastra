import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Allow Arena live preview host (e2b) to fetch dev resources — fixes "stuck at loading UI"
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
  async redirects() {
    const consoleSections = [
      "settings",
      "dependencies",
      "incidents",
      "evidence",
      "clients",
    ];
    return consoleSections.flatMap((section) => [
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
    ]);
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
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
    ];
  },
};

export default nextConfig;
