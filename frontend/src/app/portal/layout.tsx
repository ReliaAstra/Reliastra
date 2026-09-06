import type { Metadata } from 'next';

/** Token-scoped client portals are private by design: never index. */
export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
