/**
 * Documentation may not describe a CLI that does not exist.
 *
 * Every public surface that shows a command - the quickstart, the CLI guide,
 * the landing page, the research corpus - is prose, and prose drifts: a flag is
 * renamed, a subcommand is added, and the example keeps working in a reader's
 * head while failing in their terminal. The failure is silent and expensive,
 * because the reader concludes the product is broken rather than the snippet.
 *
 * So this test reads the CLI's own source of truth (`cli/cmd/reliastra/main.go`
 * for the command table and flag tables, `cli/cmd/reliastra/help.go` for the
 * help entries) and checks every command, subcommand and long flag that appears
 * in a guide against it. It is the same arrangement as `methodology.test.tsx`:
 * one transcription, checked against the thing it describes.
 *
 * The reverse direction is deliberately not asserted. A command the docs do not
 * mention yet is a documentation gap, not a falsehood, and failing a build on
 * one would push people to delete commands from the CLI instead of documenting
 * them.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DOCS } from '@/lib/docs/corpus';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const MAIN = readFileSync(join(REPO_ROOT, 'cli', 'cmd', 'reliastra', 'main.go'), 'utf8');
const HELP = readFileSync(join(REPO_ROOT, 'cli', 'cmd', 'reliastra', 'help.go'), 'utf8');
const GO_MOD = readFileSync(join(REPO_ROOT, 'cli', 'go.mod'), 'utf8');
const LANDING = readFileSync(
  join(REPO_ROOT, 'frontend', 'src', 'components', 'site', 'home', 'sections.tsx'),
  'utf8'
);
const DEVELOPER_PAGE = readFileSync(
  join(
    REPO_ROOT,
    'frontend',
    'src',
    'components',
    'console',
    'pages',
    'developer.tsx'
  ),
  'utf8'
);
/** The agent-facing files quote commands verbatim, so they are policed too. */
const LLMS_TXT = readFileSync(
  join(REPO_ROOT, 'frontend', 'src', 'app', 'llms.txt', 'route.ts'),
  'utf8'
);
const LLMS_FULL = readFileSync(
  join(REPO_ROOT, 'frontend', 'src', 'app', 'llms-full.txt', 'route.ts'),
  'utf8'
);

/* ── The CLI's own surface, read from the CLI ───────────────────────────── */

/** Slice a Go `var name = …{ … }` block out of a source file. */
function goBlock(source: string, anchor: string): string {
  const block = source.slice(source.indexOf(anchor));
  return block.slice(0, block.indexOf('\n}'));
}

/** `var commandTable = map[string]commandFunc{ "login": …, … }`. */
function commandNames(source: string): string[] {
  const body = goBlock(source, 'var commandTable = map[string]commandFunc{');
  return [...body.matchAll(/^\t"([a-z]+)":/gm)].map((m) => m[1]);
}

/** Keys of the `helpEntries` map: `"login"`, `"deps list"`, … */
function helpKeys(source: string): string[] {
  const body = goBlock(source, 'var helpEntries = map[string]helpEntry{');
  return [...body.matchAll(/^\t"([a-z]+(?: [a-z-]+)?)":\s*\{/gm)].map((m) => m[1]);
}

const COMMANDS = commandNames(MAIN);
const HELP_ENTRIES = helpKeys(HELP);
const SUBCOMMANDS = new Map<string, Set<string>>();
for (const entry of HELP_ENTRIES) {
  const [command, sub] = entry.split(' ');
  if (!sub) continue;
  if (!SUBCOMMANDS.has(command)) SUBCOMMANDS.set(command, new Set());
  SUBCOMMANDS.get(command)!.add(sub);
}

const dashed = (camel: string) => camel.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Long flags: the boolean set, the flag tables, and every `--flag` in help. */
function flagNames(): Set<string> {
  const flags = new Set<string>();
  const booleans = goBlock(MAIN, 'var booleanFlags = map[string]bool{');
  for (const match of booleans.matchAll(/"([a-z-]+)":\s*true,/g)) {
    flags.add(`--${match[1]}`);
  }
  // `var commandFlags = …{ "deps": {"limit", …}, … }`: camelCase keys that the
  // parser accepts dashed.
  const tables = goBlock(MAIN, 'var commandFlags = map[string][]string{');
  for (const line of tables.matchAll(/^\t"[a-z ]+":\s*\{([^}]*)\}/gm)) {
    for (const key of line[1].matchAll(/"([a-zA-Z]+)"/g)) {
      flags.add(`--${dashed(key[1])}`);
    }
  }
  const globals = MAIN.match(/^var globalFlags = \[\]string\{([^}]*)\}/m);
  for (const key of (globals?.[1] ?? '').matchAll(/"([a-zA-Z]+)"/g)) {
    flags.add(`--${dashed(key[1])}`);
  }
  // `{…"--out <path>", …}` rows and `--check-interval <seconds>` prose forms.
  for (const match of HELP.matchAll(/\{"(--[a-z-]+)/g)) flags.add(match[1]);
  for (const match of HELP.matchAll(/`?--([a-z][a-z-]+)/g)) flags.add(`--${match[1]}`);
  return flags;
}

const FLAGS = flagNames();

const MODULE = GO_MOD.match(/^module\s+(\S+)/m)?.[1] ?? '';

/* ── Every command-looking string in the documentation ─────────────────── */

type Fragment = { where: string; text: string };

function fragmentsFromDocs(): Fragment[] {
  const out: Fragment[] = [];
  for (const doc of DOCS) {
    for (const section of doc.sections) {
      for (const block of section.blocks) {
        const where = `docs/${doc.slug}#${section.id}`;
        switch (block.kind) {
          case 'p':
          case 'note':
            out.push({ where, text: block.text });
            break;
          case 'code':
            out.push({ where, text: block.code });
            break;
          case 'list':
            out.push({ where, text: block.items.join('\n') });
            break;
          case 'table':
            out.push({ where, text: block.rows.flat().join('\n') });
            break;
          case 'definitions':
            out.push({
              where,
              text: block.items.map((i) => `${i.term} ${i.def}`).join('\n'),
            });
            break;
          case 'steps':
            out.push({
              where,
              text: block.items
                .map((i) => `${i.title} ${i.text} ${i.code?.code ?? ''}`)
                .join('\n'),
            });
            break;
          case 'fields':
            out.push({
              where,
              text: block.items.map((i) => `${i.field} ${i.def}`).join('\n'),
            });
            break;
        }
      }
    }
  }
  out.push({ where: 'home/sections.tsx', text: LANDING });
  // The console's developer surface prints the same commands to a different
  // audience, and it drifts the same way. It is scanned as documentation.
  out.push({ where: 'console/pages/developer.tsx', text: DEVELOPER_PAGE });
  // `reliastra <command>` is how a retrieval model is told to reach the API.
  // The same drift applies, and the reader here cannot ask a human what it
  // meant - it will simply retry the failing invocation.
  out.push({ where: 'app/llms.txt', text: LLMS_TXT });
  out.push({ where: 'app/llms-full.txt', text: LLMS_FULL });
  return out;
}

const FRAGMENTS = fragmentsFromDocs();

/** `reliastra <command> [subcommand]` pairs, with placeholders removed. */
function invocations(text: string): { command: string; sub: string | null }[] {
  const found: { command: string; sub: string | null }[] = [];
  for (const match of text.matchAll(/\breliastra\s+([a-z][a-z-]*)(\s+[a-z][a-z-]*)?/g)) {
    const command = match[1];
    let sub: string | null = match[2]?.trim() ?? null;
    // `open <incident-id>` and `verify "$ID"` carry an argument, not a
    // subcommand; placeholders never look like a bare lowercase word pair.
    if (sub && !SUBCOMMANDS.get(command)?.has(sub)) sub = null;
    found.push({ command, sub });
  }
  return found;
}

describe('documentation against the CLI surface', () => {
  it('reads a non-empty command table from the CLI', () => {
    // Guards the guard: a regex that stops matching would silently pass.
    expect(COMMANDS.length).toBeGreaterThanOrEqual(12);
    expect(COMMANDS).toContain('verify');
    expect(COMMANDS).toContain('doctor');
    expect(COMMANDS).toContain('open');
    expect(SUBCOMMANDS.get('evidence')).toContain('get');
    expect(FLAGS.has('--json')).toBe(true);
    expect(FLAGS.has('--api-url')).toBe(true);
    expect(MODULE).toBe('github.com/ReliaAstra/Reliastra/cli');
  });

  it('only ever shows commands the CLI implements', () => {
    const unknown: string[] = [];
    for (const { where, text } of FRAGMENTS) {
      for (const { command } of invocations(text)) {
        if (!COMMANDS.includes(command)) unknown.push(`${where}: reliastra ${command}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('only ever shows subcommands that exist', () => {
    const unknown: string[] = [];
    for (const { where, text } of FRAGMENTS) {
      for (const { command, sub } of invocations(text)) {
        if (!sub) continue;
        if (!SUBCOMMANDS.get(command)?.has(sub)) {
          unknown.push(`${where}: reliastra ${command} ${sub}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('only ever shows flags the CLI accepts', () => {
    // Flags are read per line, and only while the line belongs to a `reliastra`
    // invocation - including continuation lines. Without that, every flag of
    // every other tool shown in the same code block (`git clone --depth 1`)
    // reads as a flag this CLI invented. Design tokens (`var(--ob-text-4)`)
    // stay excluded by prefix.
    const isDesignToken = (name: string) => /^(ob|obc|rs)-/.test(name);
    const unknown: string[] = [];
    for (const { where, text } of FRAGMENTS) {
      let inCommand = false;
      for (const line of text.split('\n')) {
        inCommand = /\breliastra\b/.test(line) || (inCommand && /^\s/.test(line));
        if (!inCommand) continue;
        for (const match of line.matchAll(/--([a-z][a-z-]+)/g)) {
          const name = match[1];
          if (isDesignToken(name)) continue;
          const flag = `--${name}`;
          if (!FLAGS.has(flag)) unknown.push(`${where}: ${flag}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('spells the command correctly', () => {
    // `reliaastra` - one `a` too many - shipped in the CLI's own help text and
    // several guide lines. The GitHub organisation really does contain that
    // sequence (`ReliaAstra`, two `a`s: the correct `github.com/ReliAstra`
    // returns 404), so the organisation name is removed by plain string
    // surgery first. Everything else is checked, URL or prose.
    for (const { where, text } of FRAGMENTS) {
      const withoutOrgName = text.split('ReliaAstra').join('<org>');
      expect(withoutOrgName, where).not.toMatch(/reliaastra/i);
    }
  });

  it('installs the binary it actually ships', () => {
    // The install the documentation types has to produce the `reliastra`
    // binary every example invokes. `go install <module>/cmd/reliastra@…`
    // names the binary after the package directory, so the documented target
    // must be that package at the module path go.mod declares - otherwise
    // every example fails at step one.
    const installs: string[] = [];
    for (const { where, text } of FRAGMENTS) {
      for (const match of text.matchAll(/\bgo install\s+(\S+)/g)) {
        installs.push(`${where}: ${match[1]}`);
        expect(match[1].startsWith(`${MODULE}/cmd/reliastra@`), where).toBe(true);
      }
    }
    expect(installs.length).toBeGreaterThan(0);
  });

  it('runs checkout snippets against a package that exists', () => {
    // `go run ./…` snippets are typed from the repository root, so the target
    // must resolve to a directory with a main package.
    const runs: string[] = [];
    for (const { where, text } of FRAGMENTS) {
      for (const match of text.matchAll(/\bgo run\s+(\S+)/g)) {
        const target = match[1];
        runs.push(`${where}: ${target}`);
        if (!target.startsWith('./') && !target.startsWith('/')) continue;
        expect(existsSync(join(REPO_ROOT, target, 'main.go')), where).toBe(true);
      }
    }
    expect(runs.length).toBeGreaterThan(0);
  });

  it('never references the retired npm package', () => {
    // The CLI was a Node program before 0.2.0. The package was never on the
    // public registry, and the files are gone; any surviving reference is a
    // command that fails at step one.
    for (const { where, text } of FRAGMENTS) {
      expect(text, where).not.toMatch(/@reliastra\/cli/);
      expect(text, where).not.toMatch(/reliastra\.mjs/);
      expect(text, where).not.toMatch(/npm install/);
      expect(text, where).not.toMatch(/\bnpx\b/);
    }
  });

  it('does not invent an API key format', () => {
    // Keys are issued as `rel_` plus 40 hex characters; the docs once showed
    // an `rs_live_…` value that no endpoint has ever produced.
    for (const { where, text } of FRAGMENTS) {
      expect(text, where).not.toMatch(/rs_live_/);
    }
  });
});
