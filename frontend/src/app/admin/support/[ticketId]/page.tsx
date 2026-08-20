import { SupportTicketPage } from '@/components/admin/admin-support';

export default async function SupportTicketRoute({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  return <SupportTicketPage ticketId={ticketId} />;
}
