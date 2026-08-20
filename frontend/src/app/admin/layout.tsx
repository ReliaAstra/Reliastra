import type { Metadata } from 'next';
import { AdminWorkspace } from '@/components/admin/admin-provider';

export const metadata: Metadata = {
  title: 'Admin',
  description: 'RELIASTRA operating system for system administrators.',
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
