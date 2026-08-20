'use client';

import { useParams } from 'next/navigation';
import { DependencyDetailPage } from '@/components/dashboard/pages/dependency-detail';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <DependencyDetailPage id={params.id} />;
}
