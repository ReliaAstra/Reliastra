import type { TrackIncident, TrackPublicIncident } from '@/lib/track-api';

/**
 * One row per incident, merged from the two public endpoints that describe
 * them.
 */
export interface MergedIncident {
  incident_id: string;
  title: string;
  started_at: string;
  resolved_at: string | null;
  severity: string;
  status: string;
  durationSeconds: number | null;
  hasEvidence: boolean;
  maxLatencyMs: number | null;
  downtimePercentage: number | null;
}

/**
 * The two incident endpoints describe the same incidents from different sides:
 * `/incidents` is every incident RELIASTRA opened against the vendor's
 * endpoints, `/incidents/public` is the subset whose evidence report has been
 * published (and is the only one that carries a human title).
 *
 * `dependency_name` is deliberately dropped: it is the name a *customer* gave
 * the dependency inside their own account, and it has no business appearing on
 * a public page.
 */
export function mergeIncidents(
  all: TrackIncident[] | null,
  published: TrackPublicIncident[] | null
): MergedIncident[] {
  const byId = new Map<string, MergedIncident>();

  for (const i of all ?? []) {
    byId.set(i.incident_id, {
      incident_id: i.incident_id,
      title: 'Observed failure window',
      started_at: i.started_at,
      resolved_at: i.resolved_at,
      severity: i.severity,
      status: i.status,
      durationSeconds: i.duration_seconds,
      hasEvidence: false,
      maxLatencyMs: null,
      downtimePercentage: null,
    });
  }

  for (const p of published ?? []) {
    const existing = byId.get(p.incident_id);
    byId.set(p.incident_id, {
      incident_id: p.incident_id,
      title: p.title || existing?.title || 'Published incident record',
      started_at: p.started_at ?? existing?.started_at ?? '',
      resolved_at: p.resolved_at ?? existing?.resolved_at ?? null,
      severity: p.severity ?? existing?.severity ?? 'unknown',
      status: p.status ?? existing?.status ?? 'unknown',
      durationSeconds:
        p.duration_minutes != null ? p.duration_minutes * 60 : (existing?.durationSeconds ?? null),
      hasEvidence: p.has_evidence_report,
      maxLatencyMs: p.max_latency_ms,
      downtimePercentage: p.downtime_percentage,
    });
  }

  return [...byId.values()].sort((a, b) => b.started_at.localeCompare(a.started_at));
}

