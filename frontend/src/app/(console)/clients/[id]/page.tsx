'use client';

import { use } from 'react';
import { ClientEnvironmentPage } from '@/components/agency/client-environment';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ClientEnvironmentPage clientId={id} />;
}
