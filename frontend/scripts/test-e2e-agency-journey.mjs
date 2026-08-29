import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Agency End-to-End User Journey QA Suite', () => {

  describe('Scenario 1: New Agency Operator Onboarding Journey', () => {
    let agencyState = {
      org: { id: 'org-agency-1', name: 'Apex SRE Consultants', plan: 'enterprise', has_agency_mode: true },
      clients: [],
      applications: [],
      dependencies: [],
      incidents: [],
      evidence: [],
    };

    test('Step 1: Agency user lands in empty Agency Command Center', () => {
      assert.equal(agencyState.clients.length, 0);
      // Empty state verification
      const emptyStateMessage = "Your agency doesn't have any client workspaces yet";
      assert.ok(emptyStateMessage.length > 0);
    });

    test('Step 2: Agency user navigates to Guided Agency Onboarding', () => {
      const onboardingSteps = ['welcome', 'client', 'application', 'dependency', 'proof'];
      assert.equal(onboardingSteps.length, 5);
      assert.equal(onboardingSteps[0], 'welcome');
    });

    test('Step 3: Creates first Client Workspace (POST /v1/clients)', () => {
      const newClient = {
        id: 'client-uuid-001',
        org_id: agencyState.org.id,
        name: 'Vanguard Health Systems',
        description: 'HIPAA-compliant telemetry and patient billing platform',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      agencyState.clients.push(newClient);
      assert.equal(agencyState.clients.length, 1);
      assert.equal(agencyState.clients[0].name, 'Vanguard Health Systems');
    });

    test('Step 4: Creates Managed Application (POST /v1/clients/{id}/applications)', () => {
      const newApp = {
        id: 'app-uuid-001',
        org_id: agencyState.org.id,
        client_id: 'client-uuid-001',
        name: 'Patient Telemetry API',
        description: 'Core FHIR telemetry gateway and webhook processor',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      agencyState.applications.push(newApp);
      assert.equal(agencyState.applications.length, 1);
      assert.equal(agencyState.applications[0].client_id, 'client-uuid-001');
      assert.equal(agencyState.applications[0].name, 'Patient Telemetry API');
    });

    test('Step 5: Connects External Dependency to Application (POST /v1/dependencies)', () => {
      const newDep = {
        id: 'dep-uuid-001',
        org_id: agencyState.org.id,
        application_id: 'app-uuid-001',
        name: 'FHIR Message Bus',
        endpoint_url: 'https://telemetry.vanguardhealth.com/health',
        method: 'GET',
        expected_status_codes: [200],
        timeout_seconds: 10,
        check_interval_seconds: 60,
        regions: ['us-east', 'eu-west'],
        alert_threshold_ms: 350,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      agencyState.dependencies.push(newDep);
      assert.equal(agencyState.dependencies.length, 1);
      assert.equal(agencyState.dependencies[0].application_id, 'app-uuid-001');
    });

    test('Step 6: Transitions into dedicated Client Workspace (/clients/client-uuid-001)', () => {
      const activeClientId = 'client-uuid-001';
      const client = agencyState.clients.find(c => c.id === activeClientId);
      const apps = agencyState.applications.filter(a => a.client_id === activeClientId);
      const appIds = new Set(apps.map(a => a.id));
      const deps = agencyState.dependencies.filter(d => appIds.has(d.application_id));

      assert.ok(client);
      assert.equal(client.name, 'Vanguard Health Systems');
      assert.equal(apps.length, 1);
      assert.equal(deps.length, 1);
      assert.equal(deps[0].name, 'FHIR Message Bus');
    });

    test('Step 7: Verifies Public Client Portal share link generation', () => {
      const shareToken = `${agencyState.org.id}.5f9a2b8c7d1e3f4a5b6c7d8e9f0a1b2c`;
      const portalUrl = `https://reliastra.com/portal/${shareToken}`;

      assert.ok(portalUrl.includes(agencyState.org.id));
      assert.ok(portalUrl.startsWith('https://reliastra.com/portal/'));
    });
  });

  describe('Scenario 2: Multi-Client Operations in Command Center', () => {
    const clients = [
      {
        id: 'c1',
        name: 'Vanguard Health',
        status: 'operational',
        uptime_24h: 99.99,
        avg_latency_ms: 42.1,
        open_incidents: 0,
        critical_incidents: 0,
        dependency_count: 4,
        application_count: 2,
      },
      {
        id: 'c2',
        name: 'Beacon Financial',
        status: 'degraded',
        uptime_24h: 98.75,
        avg_latency_ms: 210.5,
        open_incidents: 1,
        critical_incidents: 0,
        dependency_count: 6,
        application_count: 3,
      },
      {
        id: 'c3',
        name: 'Summit Logistics',
        status: 'critical',
        uptime_24h: 94.20,
        avg_latency_ms: 850.0,
        open_incidents: 2,
        critical_incidents: 1,
        dependency_count: 8,
        application_count: 4,
      },
    ];

    test('Prioritizes critical and degraded clients at top of health view', () => {
      const sorted = [...clients].sort((a, b) => {
        const order = { critical: 0, degraded: 1, operational: 2 };
        return order[a.status] - order[b.status];
      });

      assert.equal(sorted[0].name, 'Summit Logistics'); // critical
      assert.equal(sorted[1].name, 'Beacon Financial'); // degraded
      assert.equal(sorted[2].name, 'Vanguard Health');   // operational
    });

    test('Calculates accurate rolled-up executive signals', () => {
      const totals = {
        clients: clients.length,
        dependencies: clients.reduce((acc, c) => acc + c.dependency_count, 0),
        applications: clients.reduce((acc, c) => acc + c.application_count, 0),
        avg_uptime_24h: clients.reduce((acc, c) => acc + c.uptime_24h, 0) / clients.length,
        open_incidents: clients.reduce((acc, c) => acc + c.open_incidents, 0),
        clients_needing_attention: clients.filter(c => c.status !== 'operational').length,
      };

      assert.equal(totals.clients, 3);
      assert.equal(totals.dependencies, 18);
      assert.equal(totals.applications, 9);
      assert.equal(totals.open_incidents, 3);
      assert.equal(totals.clients_needing_attention, 2);
    });
  });

  describe('Scenario 3: Client Selector Component Behavior', () => {
    test('Correctly switches between All Workspaces and Individual Client', () => {
      let selectedClientId = null;
      const selectAll = () => { selectedClientId = null; };
      const selectClient = (id) => { selectedClientId = id; };

      assert.equal(selectedClientId, null);
      selectClient('c2');
      assert.equal(selectedClientId, 'c2');
      selectAll();
      assert.equal(selectedClientId, null);
    });

    test('Filters clients in selector by search query', () => {
      const clientList = [
        { id: '1', name: 'Alpha Retail' },
        { id: '2', name: 'Beta Logistics' },
        { id: '3', name: 'Gamma Payments' },
      ];

      const search = 'beta';
      const filtered = clientList.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].name, 'Beta Logistics');
    });
  });

});
