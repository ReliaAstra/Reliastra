import type { Metadata } from 'next';

/**
 * OAuth callback pages (and any future auth-flow page under `/auth/*`) are
 * working surfaces, not documents: they render "working…" and error states
 * keyed off single-use query parameters. Never index.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default function AuthFlowLayout({ children }: { children: React.ReactNode }) {
  return children;
}
