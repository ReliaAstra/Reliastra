import type { Metadata } from 'next';

/** Token-scoped evidence shares are private by design: never index. */
export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
