'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCheckState } from '@/lib/dashboard/queries';
import { api } from '@/lib/dashboard/api';
import { formatUtc } from '@/lib/dashboard/format';
import { Row, Section } from './primitives';

const LABELS: Record<string, string> = {
  never_checked: 'Waiting for first check', awaiting_scheduled_execution: 'Awaiting scheduled check',
  queued: 'Queued', executing: 'Checking', successful: 'Operational', target_failed: 'Check failed',
  blocked_by_security_policy: 'Blocked by security policy', dispatch_failed: 'Unable to queue check', scheduler_unavailable: 'Monitoring unavailable',
};
export function CheckExecution({ id }: { id: string }) {
  const query = useCheckState(id);
  const client = useQueryClient();
  const run = useMutation({ mutationFn: () => api.runCheck(id), onSuccess: () => client.invalidateQueries({ queryKey: ['check-state', id] }) });
  const d = query.data;
  return <Section title="Latest check">
    <div className="border border-[var(--obc-line)] bg-[var(--obc-base)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] font-medium" role="status">{query.isError ? 'Check state unavailable' : !d ? 'Loading check state…' : !d.is_active ? 'Paused' : d.is_stale ? 'No recent data' : LABELS[d.state] ?? 'Unknown'}</p>
        <button className="obc-btn obc-btn-sm" disabled={!d?.is_active || run.isPending || d.state === 'queued' || d.state === 'executing'} onClick={() => run.mutate()}>{run.isPending ? 'Queuing…' : 'Run check'}</button>
      </div>
      {d && <dl className="mt-4 grid gap-x-8 md:grid-cols-2">
        <Row label="Observed at">{d.last_result ? formatUtc(d.last_result.executed_at, 'dd MMM HH:mm:ss') : 'No observations'}</Row>
        <Row label="Latency">{d.last_result ? `${Math.round(d.last_result.latency_ms)} ms` : '—'}</Row>
        <Row label="HTTP status">{d.last_result?.status_code ?? '—'}</Row>
        <Row label="Next scheduled">{d.is_active && d.next_check_at ? formatUtc(d.next_check_at, 'dd MMM HH:mm:ss') : '—'}</Row>
        <Row label="Last successful">{d.last_success_at ? formatUtc(d.last_success_at, 'dd MMM HH:mm:ss') : '—'}</Row>
        <Row label="Last failed">{d.last_failure_at ? formatUtc(d.last_failure_at, 'dd MMM HH:mm:ss') : '—'}</Row>
      </dl>}
      {d?.is_active && (d.is_infrastructure_problem || d.is_target_problem) && <p className="mt-3 text-[12px] text-[var(--obc-text-3)]">{d.detail}</p>}
      {run.error && <p role="alert" className="mt-3 text-[12px] text-[var(--obc-crit)]">{run.error.message}</p>}
      {query.isError && <button className="obc-btn mt-3" onClick={() => void query.refetch()}>Retry</button>}
    </div>
  </Section>;
}
