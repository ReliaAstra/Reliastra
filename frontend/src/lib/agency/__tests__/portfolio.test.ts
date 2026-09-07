import { describe, expect, it } from 'vitest';
import {
  agencyPosture,
  applicationIndex,
  attributeEvidence,
  attributeIncidents,
  byAttention,
  clientAvailability,
  clientLatency,
  clientIdOfDependency,
  dependenciesOfClient,
  isMeasured,
  unassignedDependencies,
} from '@/lib/agency/portfolio';
import type {
  AgencyApplication,
  AgencyPortfolio,
  Dependency,
  EvidenceReport,
  Incident,
  PortfolioClient,
} from '@/lib/dashboard/types';

/**
 * The agency rollup has one property that matters more than any other: it must
 * never present an unmonitored client as a healthy one. `get_portfolio`
 * averages over an empty list and therefore returns `uptime_24h = 100.0` and
 * `avg_latency_ms = 0.0` for a client with no dependencies, so every one of
 * those values has to be gated on the dependency count before it is printed.
 */

const client = (over: Partial<PortfolioClient> = {}): PortfolioClient => ({
  id: 'cli_1',
  name: 'Client',
  description: null,
  application_count: 1,
  dependency_count: 3,
  uptime_24h: 99.9,
  avg_latency_ms: 210,
  open_incidents: 0,
  critical_incidents: 0,
  last_incident_at: null,
  status: 'operational',
  ...over,
});

describe('client availability', () => {
  it('never reports 100% for a client with no monitors', () => {
    expect(clientAvailability(100, 0)).toBe('insufficient data');
    expect(clientLatency(0, 0)).toBe('insufficient data');
  });

  it('reports a measured value when monitors exist', () => {
    expect(clientAvailability(99.4671, 3)).toBe('99.47%');
    expect(clientLatency(471.3, 3)).toBe('471');
  });

  it('treats a zero latency with monitors present as absent data', () => {
    expect(clientLatency(0, 3)).toBe('no data');
    expect(clientAvailability(null, 3)).toBe('no data');
  });

  it('knows which clients are measured at all', () => {
    expect(isMeasured(client({ dependency_count: 0 }))).toBe(false);
    expect(isMeasured(client({ dependency_count: 1 }))).toBe(true);
  });
});

describe('agency posture', () => {
  const portfolio: AgencyPortfolio = {
    org_name: 'Agency',
    generated_at: '2026-09-07T20:00:00Z',
    share_token: 'tok',
    clients: [
      client({ id: 'a', status: 'operational' }),
      client({ id: 'b', status: 'degraded', open_incidents: 1 }),
      client({ id: 'c', status: 'critical', critical_incidents: 1, open_incidents: 1 }),
      // The service calls this one operational; it has never been observed.
      client({ id: 'd', status: 'operational', dependency_count: 0, uptime_24h: 100 }),
    ],
    totals: {
      clients: 4,
      dependencies: 9,
      avg_uptime_24h: 98.2,
      open_incidents: 2,
      clients_needing_attention: 2,
    },
    unassigned_monitors: 1,
  };

  it('separates unmeasured environments from operational ones', () => {
    const posture = agencyPosture(portfolio);
    expect(posture.total).toBe(4);
    expect(posture.operational).toBe(1);
    expect(posture.degraded).toBe(1);
    expect(posture.critical).toBe(1);
    expect(posture.unmeasured).toBe(1);
    expect(posture.openIncidents).toBe(2);
  });
});

describe('attention ordering', () => {
  it('puts critical first, unmonitored last', () => {
    const rows = [
      client({ id: 'ok', name: 'Atlas', status: 'operational' }),
      client({ id: 'none', name: 'Verdant', dependency_count: 0 }),
      client({ id: 'crit', name: 'Kestrel', status: 'critical', open_incidents: 1 }),
      client({ id: 'deg', name: 'Meridian', status: 'degraded', open_incidents: 1 }),
    ];
    expect([...rows].sort(byAttention).map((c) => c.name)).toEqual([
      'Kestrel',
      'Meridian',
      'Atlas',
      'Verdant',
    ]);
  });
});

describe('the client hierarchy', () => {
  const applications = [
    { id: 'app_1', client_id: 'cli_1' },
    { id: 'app_2', client_id: 'cli_2' },
    // An application with no client cannot attribute anything.
    { id: 'app_orphan', client_id: null },
  ] as AgencyApplication[];

  const dependencies = [
    { id: 'dep_1', application_id: 'app_1', name: 'A' },
    { id: 'dep_2', application_id: 'app_2', name: 'B' },
    { id: 'dep_3', application_id: null, name: 'C' },
    { id: 'dep_4', application_id: 'app_orphan', name: 'D' },
  ] as Dependency[];

  const index = applicationIndex(applications);

  it('resolves a monitor to its client through its application', () => {
    expect(clientIdOfDependency(dependencies[0], index)).toBe('cli_1');
    expect(clientIdOfDependency(dependencies[2], index)).toBeNull();
    expect(clientIdOfDependency(dependencies[3], index)).toBeNull();
  });

  it('scopes a client to its own monitors only', () => {
    expect(dependenciesOfClient(dependencies, index, 'cli_1').map((d) => d.id)).toEqual(['dep_1']);
  });

  it('counts monitors that belong to no client', () => {
    expect(unassignedDependencies(dependencies, index).map((d) => d.id)).toEqual([
      'dep_3',
      'dep_4',
    ]);
  });
});

describe('attribution', () => {
  const applications = [{ id: 'app_1', client_id: 'cli_1' }] as AgencyApplication[];
  const index = applicationIndex(applications);
  const dependencies = [
    { id: 'dep_1', application_id: 'app_1', name: 'Auth0' },
    { id: 'dep_2', application_id: null, name: 'Loose monitor' },
  ] as Dependency[];
  const clients = [{ id: 'cli_1', name: 'Meridian Health' }];

  const incidents = [
    { id: 'inc_1', dependency_id: 'dep_1', started_at: '2026-09-07T10:00:00Z' },
    { id: 'inc_2', dependency_id: 'dep_2', started_at: '2026-09-07T11:00:00Z' },
  ] as Incident[];

  it('attributes an incident through the hierarchy and leaves the rest unattributed', () => {
    const rows = attributeIncidents(incidents, dependencies, index, clients);
    expect(rows[0].clientName).toBe('Meridian Health');
    expect(rows[1].clientId).toBeNull();
    expect(rows[1].clientName).toBeNull();
  });

  it('attributes evidence through its incident, never by guesswork', () => {
    const reports = [
      { id: 'ev_1', incident_id: 'inc_1' },
      { id: 'ev_2', incident_id: 'inc_missing' },
    ] as EvidenceReport[];
    const rows = attributeEvidence(reports, incidents, dependencies, index, clients);
    expect(rows[0].clientName).toBe('Meridian Health');
    expect(rows[0].dependency?.name).toBe('Auth0');
    expect(rows[1].incident).toBeNull();
    expect(rows[1].clientName).toBeNull();
  });
});
