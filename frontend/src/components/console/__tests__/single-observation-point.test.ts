import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  OBSERVATION_POINT_COUNT,
  OBSERVATION_POINT_LABEL,
  PRIMARY_OBSERVATION_REGION,
} from '@/lib/product-contract';

/**
 * RELIASTRA probes from ONE location.
 *
 * `backend/app/modules/checks/tasks.py` says so outright: "The single-host
 * deployment runs one worker that must execute every region's probes; region
 * stays a result label." A `region` value on a check result is therefore a
 * scheduling label, not a second opinion - and any console surface that
 * counts regions, groups observations by region, or tells the operator that
 * "regions must agree" is describing a fleet that does not exist.
 *
 * This is the guard that keeps those surfaces from coming back. It reads the
 * sources rather than rendering them, because the defect it replaces was copy
 * and columns, not behaviour: a "Regions" column, an "Observation regions"
 * tile, a per-region panel, and a region picker that offered `us-west` - a
 * value the backend rejects with a 422.
 */

const SRC = resolve(__dirname, '../../..');
const BACKEND = resolve(__dirname, '../../../../../backend/app');

/** Every surface the operator configures or reads monitoring on. */
const CONSOLE_SURFACES = [
  'components/console',
  'components/dashboard/shell',
  'components/dashboard/pages',
  'components/sequence',
];

function sources(dir: string): string[] {
  const root = resolve(SRC, dir);
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = resolve(root, entry);
    if (statSync(full).isDirectory()) out.push(...sources(full.replace(`${SRC}/`, '')));
    else if (/\.tsx?$/.test(entry) && !/__tests__/.test(full)) out.push(full);
  }
  return out;
}

const files = CONSOLE_SURFACES.flatMap(sources);

/** Strip line and block comments so the guard tests claims, not explanations. */
function claims(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(\/\/|\/\*|\*).*$/gm, '');
}

describe('single observation point', () => {
  it('states the topology it is guarding', () => {
    expect(OBSERVATION_POINT_COUNT).toBe(1);
    expect(OBSERVATION_POINT_LABEL).toMatch(/observation point/i);
  });

  it('scans the console surfaces it claims to cover', () => {
    // A guard that silently matches nothing is worse than no guard.
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith('console/pages/overview.tsx'))).toBe(true);
    expect(files.some((f) => f.endsWith('shell/add-dependency.tsx'))).toBe(true);
  });

  it('never claims more than one place probes from', () => {
    const forbidden: Array<[RegExp, string]> = [
      [/multi[- ]region/i, 'multi-region'],
      [/\bregional\b/i, 'regional'],
      [/\bper-region\b/i, 'per-region'],
      [/\btwo (or more )?regions\b/i, 'two regions'],
      [/\bmultiple (independent )?regions\b/i, 'multiple regions'],
      [/\bindependent regions\b/i, 'independent regions'],
      [/\bregions that\b/i, 'regions that …'],
      [/\ball regions\b/i, 'all regions'],
      [/observation regions/i, 'Observation regions'],
      // "node" alone is a DOM type in this codebase (`e.target as Node`), so
      // the guard targets the claim, not the word.
      [
        /(\d+\s+nodes?|multiple nodes|several nodes|independent nodes|monitoring nodes?|probe nodes?|observation nodes?)/i,
        'monitoring nodes',
      ],
    ];
    for (const file of files) {
      const text = claims(file);
      for (const [pattern, label] of forbidden) {
        expect(text, `${file.replace(`${SRC}/`, '')} claims "${label}"`).not.toMatch(pattern);
      }
    }
  });

  it('renders no region column, tile or label helper', () => {
    for (const file of files) {
      const text = claims(file);
      expect(text, `${file} renders a Region column`).not.toMatch(/header:\s*'Region'/);
      expect(text, `${file} renders a Regions column`).not.toMatch(/header:\s*'Regions'/);
      expect(text, `${file} formats region labels`).not.toContain('regionLabel');
      expect(text, `${file} counts regions`).not.toMatch(/label="Observation regions"/);
      expect(text, `${file} groups observations by region`).not.toMatch(/byRegion/);
    }
  });
});

describe('the region the console sends', () => {
  const backendSchemas = readFileSync(
    resolve(BACKEND, 'modules/dependencies/schemas.py'),
    'utf8'
  );
  const allowed = (
    backendSchemas.match(/ALLOWED_REGIONS = \{([^}]+)\}/)?.[1] ?? ''
  )
    .split(',')
    .map((s) => s.trim().replace(/"/g, ''))
    .filter(Boolean);

  it('is a value the API accepts', () => {
    // Regression guard for the picker that offered `us-west`, which is not in
    // ALLOWED_REGIONS and made every create from the console a 422.
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed).toContain(PRIMARY_OBSERVATION_REGION);
  });

  it('is the only region any console form can send', () => {
    for (const file of files) {
      const text = claims(file);
      for (const literal of text.matchAll(/'(us-east|us-west|eu-west|ap-south|sa-east)'/g)) {
        expect(
          literal[1],
          `${file.replace(`${SRC}/`, '')} hard-codes the region '${literal[1]}'`
        ).toBe(PRIMARY_OBSERVATION_REGION);
      }
    }
  });

  it('is sent as a single entry, never a choice', () => {
    const addDependency = readFileSync(
      resolve(SRC, 'components/dashboard/shell/add-dependency.tsx'),
      'utf8'
    );
    expect(addDependency).toContain('regions: [PRIMARY_OBSERVATION_REGION]');
    // No picker: the form has no region checkboxes left to toggle.
    expect(claims(resolve(SRC, 'components/dashboard/shell/add-dependency.tsx')))
      .not.toMatch(/toggleRegion/);

    const draft = readFileSync(resolve(SRC, 'stores/onboarding-store.ts'), 'utf8');
    expect(draft).toContain('regions: [PRIMARY_OBSERVATION_REGION]');
  });
});
