'use client';

import { useParams } from 'next/navigation';
import { EvidenceRecordPage } from '@/components/console/pages/evidence-record';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <EvidenceRecordPage id={params.id} />;
}
