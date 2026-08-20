'use client';

import { useParams } from 'next/navigation';
import { EvidenceReportPage } from '@/components/dashboard/pages/evidence-report';

export default function Page() {
  const params = useParams<{ token: string }>();
  return <EvidenceReportPage token={params.token} />;
}
