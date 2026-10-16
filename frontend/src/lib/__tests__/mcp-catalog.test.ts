import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MCP_PROMPTS, MCP_RESOURCES, MCP_TOOL_GROUPS, MCP_TOOL_NAMES } from '@/lib/mcp-catalog';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

/**
 * The site advertises MCP tool names in two places (the feature page and the
 * docs guide), both rendered from `lib/mcp-catalog.ts`. This test diffs that
 * catalog against the server registration in `backend/mcp_server/tools/ so a
 * renamed tool breaks the build instead of leaving the site advertising a
 * name the server does not answer to. It reads source rather than importing
 * Python for the same reason `docs-cli-surface.test.ts` reads the Go CLI.
 */
function registeredToolNames(): string[] {
  const dir = join(REPO_ROOT, 'backend', 'mcp_server', 'tools');
  const names: string[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.py') || file.startsWith('_')) continue;
    const source = readFileSync(join(dir, file), 'utf8');
    for (const match of source.matchAll(/name="(reliastra_[a-z_]+)"/g)) {
      names.push(match[1]);
    }
  }
  return [...new Set(names)].sort();
}

describe('mcp catalog matches the server', () => {
  it('lists exactly the tools the server registers', () => {
    // Both registration shapes only: `name="..."` kwargs and
    // `TOOL_NAME = "..."` constants. Bare quoted mentions (dict keys,
    // prose) are not registrations.
    const dir = join(REPO_ROOT, 'backend', 'mcp_server', 'tools');
    const names = new Set<string>();
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.py') || file.startsWith('_')) continue;
      const source = readFileSync(join(dir, file), 'utf8');
      for (const match of source.matchAll(/(?:name|TOOL_NAME)\s*=\s*"(reliastra_[a-z_]+)"/g)) {
        names.add(match[1]);
      }
    }
    expect([...MCP_TOOL_NAMES].sort()).toEqual([...names].sort());
  });

  it('marks exactly two tools as writes', () => {
    const writes = MCP_TOOL_GROUPS.flatMap((g) => g.tools)
      .filter((t) => t.writes)
      .map((t) => t.name)
      .sort();
    expect(writes).toEqual([
      'reliastra_register_dependency',
      'reliastra_trigger_check',
    ]);
  });

  it('requires a key for workspace tools and none for public ones', () => {
    const byName = new Map(
      MCP_TOOL_GROUPS.flatMap((g) => g.tools).map((t) => [t.name, t])
    );
    for (const name of [
      'reliastra_get_capabilities',
      'reliastra_search_observatory',
      'reliastra_verify_evidence',
      'reliastra_analyze_dependencies',
    ]) {
      expect(byName.get(name)?.needsKey, name).toBe(false);
    }
    for (const name of [
      'reliastra_list_dependencies',
      'reliastra_get_evidence_report',
      'reliastra_register_dependency',
    ]) {
      expect(byName.get(name)?.needsKey, name).toBe(true);
    }
  });

  it('names resources and prompts the server implements', () => {
    const resourcesSource = readFileSync(
      join(REPO_ROOT, 'backend', 'mcp_server', 'resources.py'),
      'utf8'
    );
    const registeredUris = [
      ...new Set(
        [...resourcesSource.matchAll(/"(reliastra:\/\/[a-z{}/-]+)"/g)].map((m) => m[1])
      ),
    ].sort();
    expect(MCP_RESOURCES.map((r) => r.uri).sort()).toEqual(registeredUris);

    const promptsSource = readFileSync(
      join(REPO_ROOT, 'backend', 'mcp_server', 'prompts.py'),
      'utf8'
    );
    const registeredPrompts = [
      ...new Set(
        [...promptsSource.matchAll(/"(reliastra_workflow_[a-z_]+)"/g)].map((m) => m[1])
      ),
    ].sort();
    expect(MCP_PROMPTS.map((p) => p.name).sort()).toEqual(registeredPrompts);
  });
});
