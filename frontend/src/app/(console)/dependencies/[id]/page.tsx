'use client';

import { useParams } from 'next/navigation';
import { DependencyRecordPage } from '@/components/console/pages/dependency-record';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <DependencyRecordPage id={params.id} />;
}
