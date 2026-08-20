'use client';

import { Search } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/ui/empty-state';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();
  return (
    <EmptyState
      icon={<Search size={32} />}
      title="Page not found"
      body="This screen does not exist or the resource was removed."
      actionLabel="Back to dashboard"
      onAction={() => router.push('/dashboard')}
      helpLabel="Contact support"
      onHelp={() => {
        window.location.href = 'mailto:support@reliastra.com';
      }}
    />
  );
}
