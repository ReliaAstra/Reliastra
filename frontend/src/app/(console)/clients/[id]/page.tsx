'use client';

import { use } from 'react';
import { ClientWorkspacePage } from '@/components/dashboard/pages/client-workspace';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ClientWorkspacePage clientId={id} />;
}
