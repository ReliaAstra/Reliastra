import { CustomerDetailPage } from '@/components/admin/admin-customers';

export default async function CustomerWorkspacePage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <CustomerDetailPage customerId={customerId} />;
}
