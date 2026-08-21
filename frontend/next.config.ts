import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow the sandbox/preview proxy host to load dev resources (JS/CSS/HMR)
  // cross-origin. Without this, Next.js dev blocks every chunk request from
  // the preview origin and the app renders a blank page.
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
