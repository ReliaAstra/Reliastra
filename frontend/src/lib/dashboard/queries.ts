'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import type { DependencyCreate } from './types';

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
  portfolio: ['agency', 'portfolio'] as const,
  inbox: ['notifications', 'inbox'] as const,
  supportTickets: ['support', 'tickets'] as const,
  supportThread: (id: string) => ['support', 'tickets', id] as const,
};

export function useSummary() {
  return useQuery({ queryKey: keys.summary, queryFn: api.summary });
}
export function useHealth() {
  return useQuery({ queryKey: keys.health, queryFn: api.health });
}
export function useVendors() {
  return useQuery({ queryKey: keys.vendors, queryFn: api.vendors });
}
export function useIncidents(status?: string, limit = 20) {
  return useQuery({
    queryKey: keys.incidents(status),
    queryFn: () => api.incidents({ status, limit }),
  });
}
export function useIncident(id: string) {
  return useQuery({
    queryKey: keys.incident(id),
    queryFn: () => api.incident(id),
    enabled: Boolean(id),
  });
}
export function useIncidentEvidence(id: string, enabled = false) {
  return useQuery({
    queryKey: keys.incidentEvidence(id),
    queryFn: () => api.incidentEvidence(id),
    enabled: Boolean(id) && enabled,
  });
}
export function useDependencies() {
  return useQuery({ queryKey: keys.dependencies, queryFn: api.dependencies });
}
export function useDependency(id: string) {
  return useQuery({
    queryKey: keys.dependency(id),
    queryFn: () => api.dependency(id),
    enabled: Boolean(id),
  });
}
export function useDependencyHistory(id: string) {
  return useQuery({
    queryKey: keys.history(id),
    queryFn: () => api.dependencyHistory(id),
    enabled: Boolean(id),
  });
}
export function useDependencyResults(id: string) {
  return useQuery({
    queryKey: keys.results(id),
    queryFn: () => api.dependencyResults(id),
    enabled: Boolean(id),
  });
}
export function useLatency(id?: string) {
  return useQuery({
    queryKey: keys.latency(id),
    queryFn: () => api.latency(24, id),
  });
}
export function useEvidence() {
  return useQuery({ queryKey: keys.evidence, queryFn: api.evidence });
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
  return useQuery({ queryKey: keys.alerts, queryFn: api.alertConfigs });
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
  return useQuery({
    queryKey: keys.portfolio,
    queryFn: api.portfolio,
    enabled,
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

