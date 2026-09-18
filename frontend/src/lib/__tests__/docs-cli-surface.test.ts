/**
 * Documentation may not describe a CLI that does not exist.
 *
 * Every public surface that shows a command - the quickstart, the CLI guide,
 * the landing page, the research corpus - is prose, and prose drifts: a flag is
 * renamed, a subcommand is added, and the example keeps working in a reader's
 * head while failing in their terminal. The failure is silent and expensive,
 * because the reader concludes the product is broken rather than the snippet.
 *
 * So this test reads the CLI's own source of truth (`cli/bin/reliastra.mjs` for
 * the command table and flag table, `cli/src/help.mjs` for the flags each
 * command documents) and checks every command, subcommand and long flag that
 * appears in a guide against it. It is the same arrangement as
 * `methodology.test.tsx`: one transcription, checked against the thing it
 * describes.
 *
 * The reverse direction is deliberately not asserted. A command the docs do not
 * mention yet is a documentation gap, not a falsehood, and failing a build on
 * one would push people to delete commands from the CLI instead of documenting
 * them.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DOCS } from '@/lib/docs/corpus';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const BIN = readFileSync(join(REPO_ROOT, 'cli', 'bin', 'reliastra.mjs'), 'utf8');
const HELP = readFileSync(join(REPO_ROOT, 'cli', 'src', 'help.mjs'), 'utf8');
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
const CLI_PACKAGE = JSON.parse(
  readFileSync(join(REPO_ROOT, 'cli', 'package.json'), 'utf8')
) as { name: string; bin: Record<string, string> };

/* ── The CLI's own surface, read from the CLI ───────────────────────────── */

/** `const COMMANDS = { login: …, deps: … }`. */
function commandNames(source: string): string[] {
  const block = source.slice(source.indexOf('const COMMANDS = {'));
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('\n};'));
  return [...body.matchAll(/^\s{2}([a-z]+):/gm)].map((m) => m[1]);
}

/** Keys of the `HELP` map: `'login'`, `'deps list'`, … */
function helpKeys(source: string): string[] {
  const block = source.slice(source.indexOf('export const HELP = {'));
  const body = block.slice(0, block.indexOf('\n};'));
  return [...body.matchAll(/^\s{2}'([a-z]+(?: [a-z-]+)?)':/gm)].map((m) => m[1]);
}

const COMMANDS = commandNames(BIN);
const HELP_ENTRIES = helpKeys(HELP);
const SUBCOMMANDS = new Map<string, Set<string>>();
for (const entry of HELP_ENTRIES) {
  const [command, sub] = entry.split(' ');
  if (!sub) continue;
  if (!SUBCOMMANDS.has(command)) SUBCOMMANDS.set(command, new Set());
  SUBCOMMANDS.get(command)!.add(sub);
}

/** Long flags: the global table plus every `--flag` documented per command. */
function flagNames(): Set<string> {
  const flags = new Set<string>();
  const globalBlock = BIN.slice(BIN.indexOf('const BOOLEAN_FLAGS = new Set(['));
  for (const match of globalBlock.slice(0, globalBlock.indexOf(']')).matchAll(/'([a-z-]+)'/g)) {
    flags.add(`--${match[1]}`);
  }
  // `['--json', …]` and `--check-interval <seconds>` forms in the help entries.
  for (const match of HELP.matchAll(/\['(--[a-z-]+)/g)) flags.add(match[1]);
  for (const match of HELP.matchAll(/`?--([a-z][a-z-]+)/g)) flags.add(`--${match[1]}`);
  // Derived names for camelCase keys documented as `--site-url`, `--api-url`.
  flags.add('--api-url');
  flags.add('--site-url');
  flags.add('--token');
  flags.add('--version');
  flags.add('--print-token');
  flags.add('--no-persist');
  return flags;
}

const FLAGS = flagNames();

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
    // `reliaastra` shipped in the CLI's own help text and several guide lines:
    // one `a` too many in the command name. The GitHub organisation really is
    // `ReliAstra`, so the clone URL is removed by plain string surgery before
    // the check - it is the one place that letter pattern is correct.
    for (const { where, text } of FRAGMENTS) {
      const withoutRepoUrl = text
        .split('https://github.com/ReliaAstra/Reliastra')
        .join('<repo>');
      expect(withoutRepoUrl, where).not.toMatch(/reliaastra/i);
    }
  });

  it('installs the package it actually ships', () => {
    // The command the documentation types has to be the one the package
    // installs, otherwise every example in the docs fails at step one.
    expect(Object.keys(CLI_PACKAGE.bin)).toContain('reliastra');
    expect(CLI_PACKAGE.name).toBe('@reliastra/cli');
  });

  it('never tells a reader to fetch an unpublished package', () => {
    // `@reliastra/cli` is not on the public registry, so `npm install -g
    // @reliastra/cli` and `npx @reliastra/cli` have nothing to resolve. The
    // docs advertised both for a while, which is a promise the reader only
    // discovers is false when the command fails. Flip this constant on the day
    // the package is actually published - not before.
    const publishedToRegistry = false;
    if (publishedToRegistry) return;

    const offenders: string[] = [];
    for (const { where, text } of FRAGMENTS) {
      for (const match of text.matchAll(/\bnpm i(?:nstall)?\s+(?:-g|--global)\s+(\S+)/g)) {
        const target = match[1];
        if (!target.startsWith('./') && !target.startsWith('/')) {
          offenders.push(`${where}: npm install -g ${target}`);
        }
      }
      for (const match of text.matchAll(/\bnpx\s+(?!-)([@\w][\w@/.-]*)/g)) {
        offenders.push(`${where}: npx ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not invent an API key format', () => {
    // Keys are issued as `rel_` plus 40 hex characters; the docs once showed
    // an `rs_live_…` value that no endpoint has ever produced.
    for (const { where, text } of FRAGMENTS) {
      expect(text, where).not.toMatch(/rs_live_/);
    }
  });
});
