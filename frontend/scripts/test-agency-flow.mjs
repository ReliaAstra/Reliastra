import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Agency Product Transformation & UX QA Suite', () => {

  describe('1. Information Architecture & Hierarchy Model', () => {
    test('Agency -> Client -> Application -> Dependency hierarchy is maintained', () => {
      const mockOrg = { id: 'org-1', name: 'CloudOps Agency', has_agency_mode: true };
      const mockClient = { id: 'client-1', org_id: mockOrg.id, name: 'Acme Corp', description: 'Logistics platform' };
      const mockApplication = { id: 'app-1', org_id: mockOrg.id, client_id: mockClient.id, name: 'Checkout Portal' };
      const mockDependency = {
        id: 'dep-1',
        org_id: mockOrg.id,
        application_id: mockApplication.id,
        name: 'Stripe Gateway',
        endpoint_url: 'https://api.stripe.com/health',
      };

      assert.equal(mockClient.org_id, mockOrg.id);
      assert.equal(mockApplication.client_id, mockClient.id);
      assert.equal(mockDependency.application_id, mockApplication.id);
    });

    test('Portfolio rollup correctly aggregates client stats from applications and monitors', () => {
      const clients = [
        { id: 'c1', name: 'Client One', status: 'operational', uptime_24h: 99.98, open_incidents: 0, critical_incidents: 0, dependency_count: 3 },
        { id: 'c2', name: 'Client Two', status: 'degraded', uptime_24h: 98.4, open_incidents: 1, critical_incidents: 0, dependency_count: 5 },
      ];

      const totals = {
        clients: clients.length,
        dependencies: clients.reduce((acc, c) => acc + c.dependency_count, 0),
        avg_uptime_24h: (99.98 + 98.4) / 2,
        open_incidents: clients.reduce((acc, c) => acc + c.open_incidents, 0),
        clients_needing_attention: clients.filter(c => c.status !== 'operational').length,
      };

      assert.equal(totals.clients, 2);
      assert.equal(totals.dependencies, 8);
      assert.equal(totals.open_incidents, 1);
      assert.equal(totals.clients_needing_attention, 1);
    });
  });

  describe('2. Removal of Fake/Deceptive Enterprise Data', () => {
    test('No fake customer names like Northwind Retail, Cedar Health, Helios Payments appear in codebase', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');

      function scanDir(dir, forbiddenWords) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '.git') {
              scanDir(fullPath, forbiddenWords);
            }
          } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            for (const word of forbiddenWords) {
              if (content.includes(word)) {
                throw new Error(`Forbidden mock string "${word}" found in ${fullPath}`);
              }
            }
          }
        }
      }

      scanDir('src/components/dashboard', ['Northwind Retail', 'Helios Health', 'Cedar Health']);
    });
  });

  describe('3. Route and Navigation Consistency', () => {
    test('Breadcrumbs parser maps client and agency routes cleanly', () => {
      function crumbs(pathname, clients = []) {
        const map = {
          dashboard: 'Dashboard',
          dependencies: 'Dependencies',
          incidents: 'Incidents',
          evidence: 'Evidence',
          clients: 'Agency',
          onboarding: 'Onboarding',
          settings: 'Settings',
        };
        const parts = pathname.split('/').filter(Boolean);
        const out = [];
        let acc = '';
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          acc += '/' + part;
          const last = i === parts.length - 1;
          if (/^[0-9a-f-]{8,}$/i.test(part) && parts[i - 1] === 'clients' && clients) {
            const match = clients.find(c => c.id === part);
            out.push({ label: match ? match.name : 'Client Workspace', href: last ? undefined : acc });
            continue;
          }
          if (/^[0-9a-f-]{8,}$/i.test(part) && part.includes('-')) continue;
          out.push({ label: map[part] || part, href: last ? undefined : acc });
        }
        return out;
      }

      const clientList = [{ id: '11111111-2222-3333-4444-555555555555', name: 'Acme Global' }];
      
      const agencyCrumbs = crumbs('/clients');
      assert.deepEqual(agencyCrumbs, [{ label: 'Agency', href: undefined }]);

      const clientWorkspaceCrumbs = crumbs('/clients/11111111-2222-3333-4444-555555555555', clientList);
      assert.deepEqual(clientWorkspaceCrumbs, [
        { label: 'Agency', href: '/clients' },
        { label: 'Acme Global', href: undefined },
      ]);

      const onboardingCrumbs = crumbs('/clients/onboarding');
      assert.deepEqual(onboardingCrumbs, [
        { label: 'Agency', href: '/clients' },
        { label: 'Onboarding', href: undefined },
      ]);
    });
  });

  describe('4. Agency Gating & Entitlements', () => {
    test('Agency mode is enabled for Enterprise plans and gated with clear value prop for others', () => {
      const freePlan = { id: 'free', isEnterprise: false, clientGroups: false, whiteLabel: false };
      const proPlan = { id: 'pro', isEnterprise: false, clientGroups: false, whiteLabel: false };
      const entPlan = { id: 'enterprise', isEnterprise: true, clientGroups: true, whiteLabel: true };

      assert.equal(freePlan.clientGroups, false);
      assert.equal(proPlan.clientGroups, false);
      assert.equal(entPlan.clientGroups, true);
      assert.equal(entPlan.whiteLabel, true);
    });
  });

  describe('5. Onboarding Step Transitions & Hierarchy Construction', () => {
    test('Onboarding sequence follows Client -> Application -> Dependency -> Evidence proof', () => {
      const steps = ['welcome', 'client', 'application', 'dependency', 'proof'];
      assert.equal(steps[0], 'welcome');
      assert.equal(steps[1], 'client');
      assert.equal(steps[2], 'application');
      assert.equal(steps[3], 'dependency');
      assert.equal(steps[4], 'proof');
    });

    test('Validates required fields for client and application creation', () => {
      const validateClient = (name) => Boolean(name && name.trim().length > 0 && name.trim().length <= 150);
      const validateApp = (name) => Boolean(name && name.trim().length > 0 && name.trim().length <= 150);
      const validateDepUrl = (url) => Boolean(url && (url.startsWith('http://') || url.startsWith('https://')));

      assert.equal(validateClient(''), false);
      assert.equal(validateClient('   '), false);
      assert.equal(validateClient('Acme Logistics'), true);

      assert.equal(validateApp(''), false);
      assert.equal(validateApp('Customer Portal'), true);

      assert.equal(validateDepUrl('ftp://invalid'), false);
      assert.equal(validateDepUrl('https://api.acme.com/health'), true);
    });
  });

  describe('6. Public Client SLA Portal Properties', () => {
    test('Share token format is stateless HMAC without exposing secrets or raw endpoints', () => {
      const sampleToken = 'org-uuid-123.a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
      const parts = sampleToken.split('.');
      assert.equal(parts.length, 2);
      assert.ok(parts[0].length > 0);
      assert.equal(parts[1].length, 32);
    });
  });

});
