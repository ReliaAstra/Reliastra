import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { VisitBeacon } from "@/components/analytics/visit-beacon";
import { AttributionCapture } from "@/components/analytics/attribution-capture";
import { ReferralCapture } from "@/components/analytics/referral-capture";
import { SITE_INDEXABLE } from "@/lib/indexability";
import { SITE_URL } from "@/lib/site-url";
import { DISCOVERY_ALTERNATES } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RELIASTRA — Independent Evidence for External Dependencies",
    template: "%s | RELIASTRA",
  },
  description:
    "RELIASTRA independently observes the APIs and external services your software depends on, confirms persistent failures, correlates incidents, and produces verifiable evidence records.",
  keywords: [
    "external dependency",
    "third-party dependency monitoring",
    "dependency observation",
    "incident correlation",
    "evidence record",
    "API dependency monitoring",
    "vendor reliability",
    "independent observation",
  ],
  authors: [{ name: "Reliastra, Inc.", url: "https://reliastra.com" }],
  creator: "Reliastra, Inc.",
  publisher: "Reliastra, Inc.",
  alternates: {
    canonical: "https://reliastra.com",
    ...DISCOVERY_ALTERNATES,
  },
  /**
   * Deployment gate. On any host that is not the canonical production site -
   * a preview, a staging build, a self-hosted instance without an explicit
   * opt-in - the whole site is noindex. Every page here publishes a canonical
   * URL pointing at reliastra.com, so indexing a second origin publishes
   * duplicates of the same dependency records and splits the signal the real
   * records need. `next.config.ts` sends the matching `X-Robots-Tag` header so
   * the gate holds even on a route that sets its own metadata.
   */
  robots: SITE_INDEXABLE
    ? {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
        },
      }
    : {
        index: false,
        follow: false,
        noarchive: true,
        googleBot: { index: false, follow: false },
      },
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "RELIASTRA — Independent Evidence for External Dependencies",
    description:
      "Independent observation of the third-party APIs your software depends on. Deterministic fault confirmation. Verifiable evidence records.",
    url: "https://reliastra.com",
    siteName: "RELIASTRA",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1584,
        height: 396,
        alt: "RELIASTRA — independent evidence for the external dependencies your software depends on",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RELIASTRA — Independent Evidence for External Dependencies",
    description:
      "Observe third-party APIs. Confirm faults. Produce verifiable evidence records.",
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AttributionCapture />
          <ReferralCapture />
          <VisitBeacon />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}