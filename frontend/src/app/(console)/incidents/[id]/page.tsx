'use client';

import { useParams } from 'next/navigation';
import { IncidentRecordPage } from '@/components/console/pages/incident-record';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <IncidentRecordPage id={params.id} />;
}
