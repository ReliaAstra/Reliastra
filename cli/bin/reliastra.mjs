#!/usr/bin/env node
/**
 * reliastra - command-line access to RELIASTRA.
 *
 * Design rules, in order of importance:
 *
 *  1. Every command that prints data supports `--json`, and the JSON is the
 *     API's own shape. Scripts and humans get the same truth.
 *  2. Exit codes are meaningful, because the interesting use of this tool is
 *     inside a pipeline:
 *
 *       0  success
 *       1  usage error, or invalid configuration
 *       2  the API returned an error (validation, not found, upstream failure)
 *       3  authentication is required, rejected, or expired
 *       4  a verification claim did not hold
 *       5  authenticated, but not permitted to do this
 *       6  the API could not be reached at all
 *
 *     `reliastra verify <id> --expect-hash <sha256>` therefore works as a CI
 *     gate without a wrapper script, and a pipeline can tell "the record does
 *     not match" (4) from "the network is down" (6) without parsing prose.
 *  3. Nothing is buffered silently and nothing is invented: a field the API did
 *     not return prints as `—`, never as `0` or `unknown`.
 *  4. No dependencies. A monitoring client that cannot install on a build
 *     runner is not a monitoring client.
 *  5. `--help` works everywhere, including mid-command
 *     (`reliastra evidence get --help`), and the text explains what the command
 *     prints, not only its flags.
 */

import { Client, ApiError, AuthError, NetworkError } from '../src/client.mjs';
import {
  resolveSession,
  writeConfig,
  clearConfig,
  configPath,
  readConfig,
  DEFAULT_API_URL,
  DEFAULT_SITE_URL,
  webUrls,
} from '../src/config.mjs';
import { write, writeError, jsonOut } from '../src/output.mjs';
import { EXIT_CODES, ENVIRONMENT, GLOBAL_FLAGS, HELP, formatBody, formatTable, helpFor } from '../src/help.mjs';
import * as account from '../src/commands/account.mjs';
import * as monitoring from '../src/commands/monitoring.mjs';
import * as evidence from '../src/commands/evidence.mjs';
import * as tools from '../src/commands/tools.mjs';

export const EXIT = {
  ok: 0,
  usage: 1,
  api: 2,
  auth: 3,
  unverified: 4,
  denied: 5,
  network: 6,
};

const COMMANDS = {
  login: account.login,
  logout: account.logout,
  whoami: account.whoami,
  doctor: tools.doctor,
  deps: monitoring.deps,
  checks: monitoring.checks,
  incidents: monitoring.incidents,
  evidence: evidence.evidence,
  verify: evidence.verify,
  keys: evidence.keys,
  obs: evidence.obs,
  open: tools.open,
};

/* ── Argument parsing ───────────────────────────────────────────────────── */

/** Flags that never take a value. */
const BOOLEAN_FLAGS = new Set([
  'json',
  'help',
  'version',
  'quiet',
  'no-persist',
  'follow',
  'web',
  'browser',
  'yes',
  'print',
  'evidence',
  'payload',
  'print-token',
]);

/**
 * Split argv into positional arguments and flags.
 *
 * Deliberately minimal: `--flag value`, `--flag=value`, `-h`. Unknown flags
 * become errors rather than being ignored, because a typo'd flag that silently
 * does nothing is how a script ends up asserting the wrong thing.
 */
export function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const [rawKey, inline] = arg.slice(2).split(/=(.*)/s);
      const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (inline !== undefined) {
        flags[key] = inline;
      } else if (BOOLEAN_FLAGS.has(rawKey)) {
        flags[key] = true;
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          flags[key] = true;
        } else {
          flags[key] = next;
          i += 1;
        }
      }
    } else if (arg === '-h') {
      flags.help = true;
    } else if (arg === '-v') {
      flags.version = true;
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

/**
 * Flags the parser understands, per command. Anything else is a usage error.
 *
 * A closed set is what makes "you typed `--interva`" a message instead of a
 * silently ignored argument; the cost is that this table has to be updated
 * alongside the commands, which the test suite enforces by checking every flag
 * documented in `help.mjs` against it.
 */
export const KNOWN_FLAGS = {
  _global: ['json', 'help', 'version', 'quiet', 'apiUrl', 'siteUrl', 'token', 'noPersist'],
  login: ['email', 'token', 'printToken'],
  logout: [],
  whoami: [],
  doctor: [],
  deps: ['limit', 'observations', 'interval', 'expect', 'method', 'timeout', 'region', 'web', 'yes'],
  checks: ['limit', 'dependency'],
  incidents: ['limit', 'status', 'web', 'evidence', 'dependency'],
  evidence: ['limit', 'out', 'web', 'payload'],
  verify: ['id', 'file', 'expectHash'],
  keys: ['name', 'scopes', 'yes'],
  obs: ['limit', 'vendor', 'web'],
  open: ['browser', 'print'],
};

function knownFlagsFor(command, subcommand) {
  const base = new Set(KNOWN_FLAGS._global);
  for (const key of KNOWN_FLAGS[command] ?? []) base.add(key);
  if (KNOWN_FLAGS[`${command} ${subcommand}`]) {
    for (const key of KNOWN_FLAGS[`${command} ${subcommand}`]) base.add(key);
  }
  return base;
}

/** Levenshtein distance, small and local: only used for suggestions. */
function distance(a, b) {
  const rows = [];
  for (let i = 0; i <= a.length; i += 1) rows.push([i]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return rows[a.length][b.length];
}

/** The closest known name, when it is close enough to be a typo rather than a guess. */
export function suggest(input, candidates) {
  let best = null;
  for (const candidate of candidates) {
    const d = distance(input, candidate);
    if (best === null || d < best.d) best = { candidate, d };
  }
  if (!best) return null;
  const limit = input.length <= 5 ? 1 : 2;
  return best.d <= limit ? best.candidate : null;
}

/* ── Help ───────────────────────────────────────────────────────────────── */

const USAGE = `reliastra — observe external dependencies, and verify what they did

Usage
  reliastra <command> [subcommand] [args] [flags]
  reliastra <command> --help          help for one command

Commands
  login                     Store a session on this machine
  logout                    Revoke the session and remove it locally
  whoami                    Show the account this invocation resolves to
  doctor                    Check config, credential and API, and name the failure

  deps list                 Dependencies being probed
  deps show <id>            One dependency, its observations and its incidents
  deps add <name> <url>     Start probing an endpoint
  deps rm <id>              Stop probing an endpoint

  checks recent             Observations, newest first

  incidents list            Incidents, newest first
  incidents show <id>       One incident: window, severity, correlations
  incidents correlate <id>  Score a dependency's degradation against this window

  evidence list             Evidence records issued for this account
  evidence show <id>        One record: window, checksum, verification URL
  evidence get <id>         Write the artifact to a file
  verify <verification-id>  Check a document against the public record
  keys list | create | rm   API keys for CI and other services

  obs list | show <vendor>  The public observatory

  open <kind> [id]          Print the web page for a resource

Try
  reliastra deps --help
  reliastra evidence show --help
  reliastra verify --help

Flags
${formatTable(GLOBAL_FLAGS).join('\n')}

Environment
${formatTable(ENVIRONMENT).join('\n')}

Exit codes
${formatTable(EXIT_CODES).join('\n')}

Examples
  reliastra login
  reliastra deps add "Payments API" https://api.example.com/health --interval 60
  reliastra checks recent --limit 20
  reliastra incidents list --status open --web
  reliastra evidence show 7c1d0a5f            # prints the public verification URL
  reliastra verify 8Kd2xQ7mB4pL --file incident.pdf   # exits 4 on mismatch
  reliastra evidence list --json | jq -r '.[].checksum'
`;

function fullUsage() {
  return USAGE;
}

/** `--help` for a command, or a usage error that names what was not understood. */
function helpOrError(command, subcommand, flags) {
  const entry = helpFor(command, subcommand);
  if (entry) {
    write(formatBody(entry));
    return EXIT.ok;
  }
  // A command exists but the subcommand does not: `reliastra evidence frobnicate`.
  const parent = helpFor(command);
  if (parent && subcommand) {
    const candidates = Object.keys(HELP)
      .filter((key) => key.startsWith(`${command} `))
      .map((key) => key.slice(command.length + 1));
    const guess = suggest(subcommand, candidates);
    writeError(`unknown subcommand: ${command} ${subcommand}`);
    if (guess) writeError(`did you mean \`${command} ${guess}\`?`);
    writeError(`\nRun \`reliastra ${command} --help\` for the subcommands.`);
    return EXIT.usage;
  }
  return flags.help ? EXIT.ok : EXIT.usage;
}

/* ── Entry point ────────────────────────────────────────────────────────── */

async function version() {
  // Read rather than `import … with { type: 'json' }`: import attributes vary
  // by Node version, and a version command that depends on one is a version
  // command that fails on somebody's build runner.
  try {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { positionals, flags } = parseArgs(argv);

  if (flags.version) {
    write(await version());
    return EXIT.ok;
  }

  const [name, ...rest] = positionals;
  if (!name && !flags.help) {
    write(fullUsage());
    return EXIT.usage;
  }
  if (!name || name === 'help') {
    write(fullUsage());
    return EXIT.ok;
  }

  const command = COMMANDS[name];
  if (!command) {
    const guess = suggest(name, Object.keys(COMMANDS));
    writeError(`unknown command: ${name}`);
    if (guess) writeError(`did you mean \`reliastra ${guess}\`?`);
    writeError(`\nRun \`reliastra --help\` for the command list.`);
    return EXIT.usage;
  }

  // Reject unknown flags before doing anything with them. Global flags are
  // always accepted; the rest come from the command's own table.
  const subcommand = rest[0];
  const allowed = knownFlagsFor(name, subcommand);
  const unknown = Object.keys(flags).filter((key) => !allowed.has(key));
  if (unknown.length) {
    const rendered = unknown.map((key) => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
    writeError(`unknown flag${rendered.length > 1 ? 's' : ''} for \`${name}\`: ${rendered.join(', ')}`);
    const known = [...allowed].map((key) => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
    // `unknown` holds camel-cased keys with the dashes already stripped by the
    // parser, so it is compared as-is against the same projection of the
    // known flags.
    const guess = suggest(unknown[0], known.map((k) => k.slice(2)));
    if (guess) writeError(`did you mean \`--${guess}\`?`);
    writeError(`\nRun \`reliastra ${name} --help\` for the flags this command takes.`);
    return EXIT.usage;
  }

  if (flags.help) {
    return helpOrError(name, subcommand, flags);
  }

  const session = resolveSession(flags, env);
  const client = new Client({
    apiUrl: session.apiUrl,
    token: session.token,
    env,
    persist: !flags.noPersist,
  });
  if (session.config?.refresh_token) client.refreshToken = session.config.refresh_token;

  const context = {
    flags,
    args: rest,
    client,
    session,
    env,
    write,
    writeError,
    jsonOut,
    writeConfig,
    clearConfig,
    configPath,
    readConfig,
    webUrls,
    version: await version(),
  };

  try {
    const result = await command(context);
    return typeof result === 'number' ? result : EXIT.ok;
  } catch (error) {
    return reportError(error);
  }
}

/**
 * Turn a thrown error into one actionable message and the right exit code.
 *
 * The taxonomy is the point: authentication, permission, a missing resource, a
 * validation failure, the network and an unexpected API fault are six different
 * situations, and an operator (or a pipeline) needs to be able to tell them
 * apart without reading the prose. No stack traces are printed - a stack from
 * this tool describes our code, not the caller's problem.
 */
export function reportError(error) {
  const status = error?.status;

  // 403 before 401: a permission failure is not an authentication failure. The
  // API answers both with an `AuthError` as far as transport is concerned, but
  // conflating them sends an operator to `reliastra login` when their key
  // simply lacks a scope - a fix that cannot work.
  if (status === 403) {
    writeError(`not permitted: ${error.message}`);
    writeError(
      'this credential is valid but not permitted to make this call. If it is an API key, reissue it with the scope in the message: `reliastra keys create <name> --scopes <list>`; `reliastra keys list` shows what it carries now.'
    );
    return EXIT.denied;
  }

  if (error instanceof AuthError || status === 401) {
    writeError(`authentication required: ${error.message}`);
    writeError(
      'the credential was rejected or has expired. Run `reliastra login`, or set RELIASTRA_TOKEN for this invocation.'
    );
    return EXIT.auth;
  }

  if (error instanceof NetworkError) {
    writeError(error.message);
    writeError(
      'the API could not be reached. Check the connection, then `reliastra doctor`; a self-hosted API needs --api-url or RELIASTRA_API_URL.'
    );
    return EXIT.network;
  }

  if (status === 404) {
    writeError(`not found: ${error.message}`);
    writeError(
      'nothing exists under that id for this account. Ids are scoped to the account that owns them, so a valid id from elsewhere reads the same way.'
    );
    return EXIT.api;
  }

  if (status === 422 || status === 400) {
    writeError(`invalid request: ${error.message}`);
    writeError(`run \`reliastra --help\` for the accepted form, or \`reliastra doctor\` to check the configuration.`);
    return EXIT.api;
  }

  if (error instanceof ApiError) {
    const suffix = error.requestId ? ` (request id ${error.requestId})` : '';
    writeError(`request failed: ${error.message}${suffix}`);
    if (error.status === 429) {
      writeError('the API is rate limiting this credential; retry after the window in the Retry-After header.');
    } else if (error.status >= 500) {
      writeError(`the API returned ${error.status}; this is not a problem with your invocation. Check the status page.`);
    }
    return EXIT.api;
  }

  writeError(error?.message ?? String(error));
  return EXIT.api;
}

// Only run when executed directly, so tests can import `main`.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
