import type { Metadata } from 'next';
import { AdminWorkspace } from '@/components/admin/admin-provider';

// Never prerender or statically cache the admin shell: every request must go
// through the live access gate, whose first act is a backend-authorized
// overview call (require_system_admin). Static HTML here would render the
// chrome of an admin surface to anyone who knows the URL, even though no
// data is included — dynamic rendering keeps that surface server-gated too.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  description: 'RELIASTRA operating system for system administrators.',
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
