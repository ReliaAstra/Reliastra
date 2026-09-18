#!/usr/bin/env node
/**
 * reliaastra - command-line access to RELIASTRA.
 *
 * Design rules, in order of importance:
 *
 *  1. Every command that prints data supports `--json`, and the JSON is the
 *     API's own shape. Scripts and humans get the same truth.
 *  2. Exit codes are meaningful, because the interesting use of this tool is
 *     inside a pipeline:
 *
 *       0  success
 *       1  usage error
 *       2  the API returned an error
 *       3  authentication is required or has expired
 *       4  a verification claim did not hold
 *
 *     `reliastra verify <id> --expect-hash <sha256>` therefore works as a CI
 *     gate without a wrapper script.
 *  3. Nothing is buffered silently and nothing is invented: a field the API did
 *     not return prints as `—`, never as `0` or `unknown`.
 *  4. No dependencies. A monitoring client that cannot install on a build
 *     runner is not a monitoring client.
 */

import { Client, ApiError, AuthError, NetworkError } from '../src/client.mjs';
import { resolveSession, writeConfig, clearConfig, configPath, DEFAULT_API_URL } from '../src/config.mjs';
import { write, writeError, jsonOut } from '../src/output.mjs';
import * as account from '../src/commands/account.mjs';
import * as monitoring from '../src/commands/monitoring.mjs';
import * as evidence from '../src/commands/evidence.mjs';

export const EXIT = { ok: 0, usage: 1, api: 2, auth: 3, unverified: 4 };

const COMMANDS = {
  login: account.login,
  logout: account.logout,
  whoami: account.whoami,
  deps: monitoring.deps,
  checks: monitoring.checks,
  incidents: monitoring.incidents,
  evidence: evidence.evidence,
  verify: evidence.verify,
  keys: evidence.keys,
  obs: evidence.obs,
};

/* ── Argument parsing ───────────────────────────────────────────────────── */

/** Flags that never take a value. */
const BOOLEAN_FLAGS = new Set(['json', 'help', 'version', 'quiet', 'no-persist', 'follow']);

/**
 * Split argv into a command path, positional arguments and flags.
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

/* ── Help ───────────────────────────────────────────────────────────────── */

const USAGE = `reliastra — observe external dependencies and verify what they did

Usage
  reliaastra <command> [subcommand] [args] [flags]

Commands
  login                     Store a session in ${configPath().replace(process.env.HOME ?? '', '~')}
  logout                    Remove the stored session
  whoami                    Show the account and organization this session resolves to

  deps list                 Dependencies being probed, with their last observation
  deps add <name> <url>     Start probing an endpoint
  deps rm <id>              Stop probing an endpoint

  checks recent             The most recent observations, newest first

  incidents list            Incidents, newest first
  incidents show <id>       One incident: window, observations, attribution
  incidents correlate <id>  Align a dependency's degradation with this incident

  evidence list             Evidence records issued for this account
  evidence get <report-id>  Write the artifact to a file (--out <path>)
  evidence show <report-id> The record's metadata and checksum
  verify <verification-id>  Check an artifact against the public verification record

  keys list                 API keys
  keys create <name>        Issue an API key for CI or another service

  obs list                  Public observatory: every vendor in the public index
  obs show <vendor>         One vendor's public record

Flags
  --json                    Machine-readable output (the API's own shape)
  --api-url <url>           Override the API base (default ${DEFAULT_API_URL})
  --token <token>           Override the bearer token for this invocation
  --help                    This text
  --version                 Version

Environment
  RELIASTRA_TOKEN           Bearer token, same effect as --token
  RELIASTRA_API_URL         API base URL
  RELIASTRA_CONFIG          Path to the config file

Exit codes
  0 success   1 usage   2 API error   3 authentication required
  4 verification did not hold

Examples
  reliaastra login
  reliaastra deps add "Stripe API" https://api.stripe.com/v1/charges --interval 60
  reliaastra checks recent --limit 20
  reliaastra incidents show 9f1c… --json | jq .attribution
  reliaastra evidence get 4b2e… --out incident-2026-09-04.pdf
  reliaastra verify 8Kd2… --expect-hash 3f9a…   # exits 4 on mismatch
`;

/* ── Entry point ────────────────────────────────────────────────────────── */

export async function main(argv = process.argv.slice(2)) {
  const { positionals, flags } = parseArgs(argv);

  if (flags.version) {
    const { version } = await import('../package.json', { with: { type: 'json' } }).catch(() => ({ version: '0.0.0' }));
    write(version);
    return EXIT.ok;
  }

  const [name, ...rest] = positionals;
  if (flags.help || !name || name === 'help') {
    write(USAGE);
    return name ? EXIT.ok : flags.help ? EXIT.ok : EXIT.usage;
  }

  const command = COMMANDS[name];
  if (!command) {
    writeError(`unknown command: ${name}\n\nRun \`reliastra --help\` for the command list.`);
    return EXIT.usage;
  }

  const session = resolveSession(flags);
  const client = new Client({
    apiUrl: session.apiUrl,
    token: session.token,
    persist: !flags.noPersist,
  });
  if (session.config?.refresh_token) client.refreshToken = session.config.refresh_token;

  const context = {
    flags,
    args: rest,
    client,
    session,
    write,
    writeError,
    jsonOut,
    writeConfig,
    clearConfig,
    configPath,
  };

  try {
    const result = await command(context);
    return typeof result === 'number' ? result : EXIT.ok;
  } catch (error) {
    if (error instanceof AuthError) {
      writeError(`authentication required: ${error.message}`);
      writeError('run `reliastra login`, or set RELIASTRA_TOKEN for this invocation.');
      return EXIT.auth;
    }
    if (error instanceof NetworkError) {
      writeError(error.message);
      return EXIT.api;
    }
    if (error instanceof ApiError) {
      const suffix = error.requestId ? ` (request id ${error.requestId})` : '';
      writeError(`request failed: ${error.message}${suffix}`);
      return EXIT.api;
    }
    writeError(error?.message ?? String(error));
    return EXIT.api;
  }
}

// Only run when executed directly, so tests can import `main`.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
