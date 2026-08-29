'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import { useAppStore } from '@/stores/app-store';
import type { DependencyCreate } from './types';

/**
 * Every console query is gated on an authenticated session: firing them
 * pre-auth produces 401s that the api client interprets as session expiry.
 */
export function useSessionReady() {
  return useAppStore((s) => s.sessionState === 'authenticated');
}

export const keys = {
  summary: ['dashboard', 'summary'] as const,
  health: ['dashboard', 'health'] as const,
  vendors: ['dashboard', 'vendors'] as const,
  incidents: (status?: string) => ['incidents', status ?? 'all'] as const,
  incident: (id: string) => ['incidents', id] as const,
  incidentEvidence: (id: string) => ['incidents', id, 'evidence'] as const,
  dependencies: ['dependencies'] as const,
  dependency: (id: string) => ['dependencies', id] as const,
  history: (id: string) => ['dependencies', id, 'history'] as const,
  results: (id: string) => ['dependencies', id, 'results'] as const,
  latency: (id?: string) => ['latency', id ?? 'org'] as const,
  evidence: ['evidence'] as const,
  evidenceItem: (id: string) => ['evidence', id] as const,
  me: ['me'] as const,
  org: ['org'] as const,
  plan: ['plan'] as const,
  pricing: ['pricing'] as const,
  alerts: ['alerts'] as const,
  clients: ['agency', 'clients'] as const,
  clientApplications: (clientId: string) => ['agency', 'clients', clientId, 'applications'] as const,
  portfolio: ['agency', 'portfolio'] as const,
  inbox: ['notifications', 'inbox'] as const,
  supportTickets: ['support', 'tickets'] as const,
  supportThread: (id: string) => ['support', 'tickets', id] as const,
};

export function useSummary() {
  const ready = useSessionReady();
  return useQuery({ queryKey: keys.summary, queryFn: api.summary, enabled: ready });
}
export function useHealth() {
  const ready = useSessionReady();
  return useQuery({ queryKey: keys.health, queryFn: api.health, enabled: ready });
}
export function useVendors() {
  const ready = useSessionReady();
  return useQuery({ queryKey: keys.vendors, queryFn: api.vendors, enabled: ready });
}
export function useIncidents(status?: string, limit = 20) {
  const ready = useSessionReady();
  return useQuery({
    queryKey: keys.incidents(status),
    queryFn: () => api.incidents({ status, limit }),
    enabled: ready,
  });
}
export function useIncident(id: string) {
  const ready = useSessionReady();
  return useQuery({
    queryKey: keys.incident(id),
    queryFn: () => api.incident(id),
    enabled: Boolean(id) && ready,
  });
}
export function useIncidentEvidence(id: string, enabled = false) {
  const ready = useSessionReady();
  return useQuery({
    queryKey: keys.incidentEvidence(id),
    queryFn: () => api.incidentEvidence(id),
    enabled: Boolean(id) && enabled && ready,
  });
}
export function useDependencies() {
  const ready = useSessionReady();
  return useQuery({ queryKey: keys.dependencies, queryFn: api.dependencies, enabled: ready });
}
export function useDependency(id: string) {
  const ready = useSessionReady();
  return useQuery({
    queryKey: keys.dependency(id),
    queryFn: () => api.dependency(id),
    enabled: Boolean(id) && ready,
  });
}
export function useDependencyHistory(id: string) {
  const ready = useSessionReady();
  return useQuery({
    queryKey: keys.history(id),
    queryFn: () => api.dependencyHistory(id),
    enabled: Boolean(id) && ready,
  });
}
export function useDependencyResults(id: string) {
  const ready = useSessionReady();
  return useQuery({
    queryKey: keys.results(id),
    queryFn: () => api.dependencyResults(id),
    enabled: Boolean(id) && ready,
  });
}
export function useLatency(id?: string) {
  const ready = useSessionReady();
  return useQuery({
    queryKey: keys.latency(id),
    queryFn: () => api.latency(24, id),
    enabled: ready,
  });
}
export function useEvidence() {
  const ready = useSessionReady();
  return useQuery({ queryKey: keys.evidence, queryFn: api.evidence, enabled: ready });
}
export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: api.me });
}
export function useOrg() {
  return useQuery({ queryKey: keys.org, queryFn: api.org });
}
export function usePlan() {
  return useQuery({ queryKey: keys.plan, queryFn: api.plan });
}
export function usePricing() {
  return useQuery({ queryKey: keys.pricing, queryFn: api.pricing });
}
export function useAlertConfigs() {
  const ready = useSessionReady();
  return useQuery({ queryKey: keys.alerts, queryFn: api.alertConfigs, enabled: ready });
}

export function useClients(enabled = true) {
  const ready = useSessionReady();
  return useQuery({ queryKey: keys.clients, queryFn: api.clients, enabled: enabled && ready });
}

export function useApplications(clientId: string | null | undefined, enabled = true) {
  const ready = useSessionReady();
  return useQuery({
    queryKey: keys.clientApplications(clientId ?? ''),
    queryFn: () => api.applications(clientId as string),
    enabled: Boolean(clientId) && enabled && ready,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string }) => api.createClient(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.clients });
      qc.invalidateQueries({ queryKey: keys.portfolio });
    },
  });
}

export function useCreateApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, body }: { clientId: string; body: { name: string; description?: string } }) =>
      api.createApplication(clientId, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: keys.clientApplications(variables.clientId) });
      qc.invalidateQueries({ queryKey: keys.portfolio });
    },
  });
}

export function useCreateDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DependencyCreate) => api.createDependency(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.dependencies });
      qc.invalidateQueries({ queryKey: keys.health });
      qc.invalidateQueries({ queryKey: keys.summary });
      toast.success('Dependency added', {
        description: 'Checks will begin on the next interval.',
      });
    },
    onError: (err: Error) => {
      toast.error('Failed to add dependency', {
        description: err.message || 'Please try again or contact support if this persists.',
        action: { label: 'Contact support', onClick: () => window.open('mailto:support@reliastra.com') },
      });
    },
  });
}

export function useUpdateDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<DependencyCreate> }) =>
      api.updateDependency(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.dependencies });
      toast.success('Dependency updated');
    },
    onError: () => {
      toast.error('Failed to update dependency', {
        description: 'Please try again or contact support if this persists.',
      });
    },
  });
}

export function useDeleteDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteDependency(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.dependencies });
      qc.invalidateQueries({ queryKey: keys.health });
      qc.invalidateQueries({ queryKey: keys.summary });
      toast.success('Dependency removed');
    },
    onError: () => {
      toast.error('Failed to delete dependency', {
        description: 'Please try again or contact support if this persists.',
      });
    },
  });
}

export function usePortfolio(enabled = true) {
  const ready = useSessionReady();
  return useQuery({
    queryKey: keys.portfolio,
    queryFn: api.portfolio,
    enabled: enabled && ready,
  });
}

 // ── In-dashboard notification inbox ────────────────────────────────────────
 //
 // The bell polls for a real unread count rather than trusting a hardcoded
 // number, so a dependency alert raised by the backend surfaces without a
 // reload. The interval is short enough to feel live and long enough to keep
 // the request volume sane.

export const INBOX_POLL_MS = 30_000;
export const SUPPORT_THREAD_POLL_MS = 5_000;
export const SUPPORT_LIST_POLL_MS = 20_000;

export function useInbox(enabled = true) {
  return useQuery({
    queryKey: keys.inbox,
    queryFn: () => api.inbox({ page_size: 20 }),
    enabled,
    refetchInterval: INBOX_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

export function useMarkInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationIds?: string[]) => api.markInboxRead(notificationIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.inbox });
    },
  });
}

export function useDismissInboxItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => api.dismissInboxItem(notificationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.inbox });
    },
  });
}

// ── Support desk ───────────────────────────────────────────────────────────

export function useSupportTickets() {
  return useQuery({
    queryKey: keys.supportTickets,
    queryFn: () => api.supportTickets({ page_size: 50 }),
    refetchInterval: SUPPORT_LIST_POLL_MS,
  });
}

export function useSupportThread(ticketId: string | null) {
  return useQuery({
    queryKey: keys.supportThread(ticketId ?? ''),
    queryFn: () => api.supportThread(ticketId as string),
    enabled: Boolean(ticketId),
    // Live-chat feel: an admin reply appears without the customer reloading.
    refetchInterval: SUPPORT_THREAD_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

export function useCreateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { subject: string; message: string }) =>
      api.createSupportTicket(body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: keys.supportTickets });
      toast.success(`Conversation ${data.ticket.ticket_number} opened`);
    },
    onError: () => {
      toast.error('Could not open the conversation', {
        description: 'Please try again or email support@reliastra.com.',
      });
    },
  });
}

export function useAddSupportMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: string; body: string }) =>
      api.addSupportMessage(ticketId, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: keys.supportThread(variables.ticketId) });
      qc.invalidateQueries({ queryKey: keys.supportTickets });
    },
    onError: () => {
      toast.error('Message not sent', { description: 'Please try again.' });
    },
  });
}

