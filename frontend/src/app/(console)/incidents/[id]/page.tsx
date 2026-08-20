'use client';

import { useParams } from 'next/navigation';
import { IncidentDetailPage } from '@/components/dashboard/pages/incident-detail';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <IncidentDetailPage id={params.id} />;
}
