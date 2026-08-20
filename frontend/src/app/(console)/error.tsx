'use client';

import { AlertTriangle } from 'lucide-react';
import { RsButton } from '@/components/dashboard/ui/button';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
      <AlertTriangle size={48} className="text-rs-degraded" />
      <h1 className="mt-4 text-xl font-semibold text-rs-text">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-rs-text-secondary">
        Our team has been notified. If this persists, contact support.
      </p>
      <RsButton className="mt-6" onClick={() => reset()}>
        Reload page
      </RsButton>
      <a href="mailto:support@reliastra.com" className="mt-3 text-sm text-rs-text-accent">
        Contact support
      </a>
    </div>
  );
}
