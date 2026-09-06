import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { VisitBeacon } from "@/components/analytics/visit-beacon";
import { AttributionCapture } from "@/components/analytics/attribution-capture";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reliastra.com'
  ),
  title: {
    default: "RELIASTRA — External Dependency Intelligence",
    template: "%s | RELIASTRA",
  },
  description:
    "Know when your dependencies fail. Prove what happened. RELIASTRA monitors third-party APIs independently, attributes incidents to the responsible vendor, and generates timestamped SLA evidence.",
  keywords: [
    "external dependency intelligence",
    "third-party dependency monitoring",
    "vendor outage detection",
    "incident attribution",
    "SLA evidence",
    "SLA credits",
    "API dependency monitoring",
    "vendor reliability",
    "outage evidence",
    "infrastructure evidence",
  ],
  authors: [{ name: "Reliastra, Inc.", url: "https://reliastra.com" }],
  creator: "Reliastra, Inc.",
  publisher: "Reliastra, Inc.",
  alternates: {
    canonical: "https://reliastra.com",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "RELIASTRA — External Dependency Intelligence",
    description:
      "Monitor third-party APIs independently. When vendors fail, generate timestamped SLA evidence reports to claim credits and prove fault.",
    url: "https://reliastra.com",
    siteName: "RELIASTRA",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "RELIASTRA — External Dependency Intelligence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RELIASTRA — External Dependency Intelligence",
    description:
      "Monitor third-party APIs. Prove vendor failures. Claim SLA credits.",
    images: ["/opengraph-image"],
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
          <VisitBeacon />
          {children}
          <Toaster />
        </ThemeProvider>
        {/* Google Preferred Sources — publisher.js loaded once, async, non-blocking */}
        <Script
          src="https://news.google.com/swg/js/v1/publisher.js"
          strategy="afterInteractive"
          async
        />
      </body>
    </html>
  );
}