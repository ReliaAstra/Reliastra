import type {
  AgencyApplication,
  AgencyPortfolio,
  Dependency,
  EvidenceReport,
  Incident,
  PortfolioClient,
} from '@/lib/dashboard/types';

/**
 * Agency portfolio derivations.
 *
 * The backend gives the console four flat lists - clients (rolled up),
 * applications, dependencies and incidents - and the hierarchy that connects
 * them is `client → application → dependency → incident → evidence`. Every
 * join in this file walks that chain and nothing else; no relationship is
 * inferred from a name, a prefix or a timestamp.
 *
 * The one measurement rule that matters here is the same one the observatory
 * enforces: `AgencyService.get_portfolio` returns `uptime_24h = 100.0` and
 * `avg_latency_ms = 0.0` for a client with no monitored dependencies, because
 * an average over an empty list has no other value to take. Printing that as
 * "100.00% availability" would tell an agency operator their brand-new client
 * environment is perfectly healthy when nothing has ever been observed.
 */

export const INSUFFICIENT = 'no monitors';
export const NO_DATA = 'no data';

/* ── Availability and latency, gated on there being something to measure ── */

/**
 * Availability for a client. `dependencyCount` is required because it is the
 * only signal that distinguishes "100% of observations succeeded" from
 * "there were no observations".
 */
export function clientAvailability(
  uptime: number | null | undefined,
  dependencyCount: number
): string {
  if (!dependencyCount) return INSUFFICIENT;
  if (uptime == null || !Number.isFinite(uptime)) return NO_DATA;
  return `${uptime.toFixed(2)}%`;
}

export function clientLatency(ms: number | null | undefined, dependencyCount: number): string {
  if (!dependencyCount) return INSUFFICIENT;
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return NO_DATA;
  return Math.round(ms).toLocaleString('en-US');
}

export function isMeasured(client: Pick<PortfolioClient, 'dependency_count'>): boolean {
  return client.dependency_count > 0;
}

/* ── Posture ─────────────────────────────────────────────────────────────── */

export interface AgencyPosture {
  total: number;
  operational: number;
  degraded: number;
  critical: number;
  /** Clients with no monitored dependency at all - not healthy, unmeasured. */
  unmeasured: number;
  openIncidents: number;
  dependencies: number;
}

/**
 * The headline. Counts are taken from the rolled-up status the service
 * computed, except `unmeasured`, which the service cannot express: it reports
 * an unmonitored client as `operational`, and an operator needs to know the
 * difference between "nothing is wrong" and "nothing is watched".
 */
export function agencyPosture(portfolio: AgencyPortfolio): AgencyPosture {
  const clients = portfolio.clients ?? [];
  const measured = clients.filter(isMeasured);
  return {
    total: clients.length,
    operational: measured.filter((c) => c.status === 'operational').length,
    degraded: measured.filter((c) => c.status === 'degraded').length,
    critical: measured.filter((c) => c.status === 'critical').length,
    unmeasured: clients.length - measured.length,
    openIncidents: portfolio.totals?.open_incidents ?? 0,
    dependencies: portfolio.totals?.dependencies ?? 0,
  };
}

/* ── The hierarchy ───────────────────────────────────────────────────────── */

/** application id → client id. */
export function applicationIndex(applications: AgencyApplication[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const app of applications) {
    if (app.client_id) index.set(app.id, app.client_id);
  }
  return index;
}

/** The client a monitor belongs to, or null when it is unassigned. */
export function clientIdOfDependency(
  dependency: Pick<Dependency, 'application_id'>,
  index: Map<string, string>
): string | null {
  if (!dependency.application_id) return null;
  return index.get(dependency.application_id) ?? null;
}

export function dependenciesOfClient(
  dependencies: Dependency[],
  index: Map<string, string>,
  clientId: string
): Dependency[] {
  return dependencies.filter((d) => clientIdOfDependency(d, index) === clientId);
}

export function unassignedDependencies(
  dependencies: Dependency[],
  index: Map<string, string>
): Dependency[] {
  return dependencies.filter((d) => !d.application_id || !index.has(d.application_id));
}

/* ── Incidents and evidence, attributed to a client ──────────────────────── */

export interface ClientIncident {
  incident: Incident;
  dependency: Dependency | null;
  clientId: string | null;
  clientName: string | null;
}

/**
 * Attach a client to each incident by walking incident → dependency →
 * application → client. An incident whose dependency is unassigned keeps a
 * null client and is shown under "unassigned monitors" rather than being
 * silently dropped or arbitrarily attributed.
 */
export function attributeIncidents(
  incidents: Incident[],
  dependencies: Dependency[],
  index: Map<string, string>,
  clients: Array<{ id: string; name: string }>
): ClientIncident[] {
  const depById = new Map(dependencies.map((d) => [d.id, d]));
  const nameById = new Map(clients.map((c) => [c.id, c.name]));
  return incidents.map((incident) => {
    const dependency = depById.get(incident.dependency_id) ?? null;
    const clientId = dependency ? clientIdOfDependency(dependency, index) : null;
    return {
      incident,
      dependency,
      clientId,
      clientName: clientId ? (nameById.get(clientId) ?? null) : null,
    };
  });
}

export interface ClientEvidence {
  report: EvidenceReport;
  incident: Incident | null;
  dependency: Dependency | null;
  clientId: string | null;
  clientName: string | null;
}

export function attributeEvidence(
  reports: EvidenceReport[],
  incidents: Incident[],
  dependencies: Dependency[],
  index: Map<string, string>,
  clients: Array<{ id: string; name: string }>
): ClientEvidence[] {
  const incidentById = new Map(incidents.map((i) => [i.id, i]));
  const depById = new Map(dependencies.map((d) => [d.id, d]));
  const nameById = new Map(clients.map((c) => [c.id, c.name]));
  return reports.map((report) => {
    const incident = incidentById.get(report.incident_id) ?? null;
    const dependency = incident ? (depById.get(incident.dependency_id) ?? null) : null;
    const clientId = dependency ? clientIdOfDependency(dependency, index) : null;
    return {
      report,
      incident,
      dependency,
      clientId,
      clientName: clientId ? (nameById.get(clientId) ?? null) : null,
    };
  });
}

/* ── Sorting ─────────────────────────────────────────────────────────────── */

const STATUS_WEIGHT: Record<string, number> = { critical: 0, degraded: 1, operational: 2 };

/**
 * Operations order: whatever needs attention first, unmonitored environments
 * last. An agency operator opening this page during an incident should not
 * have to sort it themselves.
 */
export function byAttention(a: PortfolioClient, b: PortfolioClient): number {
  const am = isMeasured(a);
  const bm = isMeasured(b);
  if (am !== bm) return am ? -1 : 1;
  const aw = STATUS_WEIGHT[a.status] ?? 3;
  const bw = STATUS_WEIGHT[b.status] ?? 3;
  if (aw !== bw) return aw - bw;
  if (a.open_incidents !== b.open_incidents) return b.open_incidents - a.open_incidents;
  return a.name.localeCompare(b.name);
}
