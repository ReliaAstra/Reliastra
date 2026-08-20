import { PartnerDetailPage } from '@/components/admin/admin-partners';

export default async function PartnerWorkspaceRoute({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const { partnerId } = await params;
  return <PartnerDetailPage partnerId={partnerId} />;
}
