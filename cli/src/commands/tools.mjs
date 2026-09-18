/**
 * `doctor` and `open`: the two commands that exist because the CLI and the web
 * application are views of one record.
 *
 * `doctor` answers the question that otherwise costs a support round-trip -
 * *is this my configuration, my credential, or my network?* It never needs a
 * valid credential to say something useful, because "the API is unreachable"
 * and "your token is rejected" are different problems with different owners.
 *
 * `open` turns any identifier the CLI prints into the page where a person can
 * read it. It prints by default: a build runner has no browser, and a URL on
 * stdout is composable (`open "$(reliastra open evidence …)"`).
 */

import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { EXIT } from '../../bin/reliastra.mjs';
import { configPath, webUrls } from '../config.mjs';
import { isApiKey } from '../client.mjs';
import { jsonOut, write, writeError } from '../output.mjs';

const SYMBOL = { ok: 'ok  ', warn: 'warn', fail: 'fail' };

/* ── doctor ─────────────────────────────────────────────────────────────── */

/**
 * Run one check and record the result.
 *
 * `essential` decides the exit code: a missing site URL degrades links but does
 * not break anything, so it warns; an unreachable API is the whole product.
 */
function reporter() {
  const checks = [];
  const add = (name, status, detail, { fix = null, essential = false } = {}) => {
    checks.push({ name, status, detail, fix, essential });
    return status;
  };
  return { checks, add };
}

function configFileCheck(env) {
  const path = configPath(env);
  try {
    const stat = statSync(path);
    return { path, exists: true, mode: stat.mode & 0o777 };
  } catch {
    return { path, exists: false, mode: null };
  }
}

export async function doctor({ flags, client, session, env = process.env }) {
  const site = webUrls(session.siteUrl);
  const { checks, add } = reporter();

  // ── Local configuration ────────────────────────────────────────────────
  const file = configFileCheck(env);
  if (!file.exists) {
    add(
      'config file',
      'warn',
      `not present at ${file.path} (this is normal before the first login)`,
      { fix: 'reliastra login --email you@example.com', essential: false }
    );
  } else if (file.mode !== null && (file.mode & 0o077) !== 0) {
    // A credential any other user on the machine can read is the one local
    // failure worth shouting about, and it is invisible without a stat.
    add(
      'config file',
      'fail',
      `${file.path} is mode ${file.mode.toString(8).padStart(3, '0')}; a credential should be 0600`,
      { fix: `chmod 600 ${file.path}`, essential: true }
    );
  } else {
    add(
      'config file',
      'ok',
      `${file.path}${file.mode !== null ? ` (mode ${file.mode.toString(8).padStart(3, '0')})` : ''}`
    );
  }

  // ── Credential resolution ──────────────────────────────────────────────
  if (session.source === 'none') {
    add('credential', 'warn', 'none found: no flag, no RELIASTRA_TOKEN, no stored session', {
      fix: 'reliastra login --email you@example.com',
      essential: false,
    });
  } else {
    // The value is never printed - only where it came from. A token in a
    // terminal scrollback or a CI log is a credential leak with a long tail.
    add('credential', 'ok', `from ${session.source}`, { essential: false });
  }

  add('api url', 'ok', client.apiUrl, { essential: false });
  add('web url', 'ok', session.siteUrl, { essential: false });

  // ── Reachability, then identity ────────────────────────────────────────
  // Deliberately unauthenticated first: an authenticated call against an
  // unreachable host says "network error", and the operator learns less than
  // they would from a separate reachability check.
  let reachable = false;
  try {
    await client.get('/health', { retryOnAuth: false });
    reachable = true;
    add('api reachable', 'ok', `${client.apiUrl}/health answered`);
  } catch (error) {
    if (error?.name === 'AuthError') {
      // Some deployments protect /health; an auth challenge still proves the
      // host answered, which is the question being asked here.
      reachable = true;
      add('api reachable', 'ok', `${client.apiUrl} answered (health is gated)`);
    } else {
      add('api reachable', 'fail', error?.message ?? String(error), {
        fix: 'check the network, then `--api-url` / RELIASTRA_API_URL',
        essential: true,
      });
    }
  }

  if (reachable && session.source !== 'none') {
    // Which endpoint proves the credential depends on what the credential can
    // reach. A session token can read its own identity; an API key cannot,
    // by design, so it proves itself against a read it is meant to make.
    const keyCredential = isApiKey(session.token);
    const probe = keyCredential
      ? { path: '/v1/dependencies?limit=1', what: 'a dependency read' }
      : { path: '/v1/users/me', what: 'identity' };
    try {
      const { data } = await client.get(probe.path, { retryOnAuth: false });
      const as = keyCredential
        ? `API key ${session.token.slice(0, 8)}… authenticates`
        : `as ${data?.email ?? 'this account'}`;
      add('authenticated', 'ok', as);
    } catch (error) {
      const isAuth = error?.status === 401 || error?.status === 403;
      const kind =
        error?.status === 403 ? 'denied' : isAuth ? 'auth' : 'other';
      add(
        'authenticated',
        'fail',
        error?.status === 403
          ? `the credential authenticates but was refused ${probe.what}: ${error.message}`
          : isAuth
            ? 'the credential was rejected'
            : (error?.message ?? String(error)),
        {
          fix:
            error?.status === 403
              ? 'the API key is missing a scope this read needs. Issue one that carries it: `reliastra keys create <name> --scopes read:dependencies,read:incidents,read:evidence,read:checks`'
              : isAuth
                ? 'reliastra login --email you@example.com  (or refresh RELIASTRA_TOKEN)'
                : 'retry; if it persists, check the status page',
          essential: true,
        }
      );
      checks.push({ name: 'auth_kind', status: kind, detail: null });
    }
  }

  // ── Links the CLI will print ───────────────────────────────────────────
  if (!site.quickstart.startsWith('http')) {
    add('web origin', 'fail', `${session.siteUrl} is not an absolute URL`, {
      fix: 'set --site-url or RELIASTRA_SITE_URL',
      essential: true,
    });
  }

  const failed = checks.filter((c) => c.status === 'fail');
  const authKind = checks.find((c) => c.name === 'auth_kind')?.status;
  const unreachable = failed.some((c) => c.name === 'api reachable');
  const exit = unreachable
    ? EXIT.network
    : authKind === 'denied'
      ? EXIT.denied
      : authKind === 'auth'
        ? EXIT.auth
        : failed.length
          ? EXIT.api
          : EXIT.ok;

  if (flags.json) {
    jsonOut({
      ok: failed.length === 0,
      api_url: client.apiUrl,
      site_url: session.siteUrl,
      credential_source: session.source,
      checks: checks.filter((c) => c.name !== 'auth_kind'),
      exit_code: exit,
    });
    return exit;
  }

  write('reliastra doctor');
  write('');
  const named = checks.filter((c) => c.name !== 'auth_kind');
  const width = Math.min(Math.max(...named.map((c) => c.name.length)), 20);
  for (const check of named) {
    write(`  ${SYMBOL[check.status]}  ${check.name.padEnd(width)}  ${check.detail}`);
  }

  if (failed.length) {
    write('');
    for (const check of failed) {
      writeError(`  ${check.name}: ${check.detail}`);
      if (check.fix) writeError(`    → ${check.fix}`);
    }
  } else {
    write('\n  everything essential passed.');
  }
  return exit;
}

/* ── open ───────────────────────────────────────────────────────────────── */

/** Resource kinds `open` understands, and how each builds its URL. */
export const OPEN_TARGETS = ['incident', 'evidence', 'verify', 'dependency', 'observatory', 'docs'];

export function openUrl({ kind, id, siteUrl }) {
  const site = webUrls(siteUrl);
  switch (kind) {
    case 'incident':
      return id ? site.incident(id) : site.dashboard;
    case 'evidence':
      return id ? site.evidence(id) : site.evidenceProduct;
    case 'verify':
      return id ? site.verification(id) : site.evidenceProduct;
    case 'dependency':
      return id ? site.dependency(id) : site.dashboard;
    case 'observatory':
      return id ? site.vendor(id) : site.observatory();
    case 'docs':
      return site.docs(id ?? '');
    default:
      return null;
  }
}

/** Hand a URL to the platform opener. Detached, and its failure is not ours. */
function launch(url) {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {
    // No opener on this machine. The URL has already been printed, so the
    // operator loses nothing; a non-zero exit here would be a lie about the
    // command having failed.
  });
  child.unref();
}

export async function open({ args, flags, session }) {
  const [kind, id] = args;
  if (!kind) {
    write(
      'usage: reliastra open <incident|evidence|verify|dependency|observatory|docs> [id] [--browser]'
    );
    return EXIT.usage;
  }
  if (!OPEN_TARGETS.includes(kind)) {
    writeError(`unknown target: ${kind}`);
    write(`known targets: ${OPEN_TARGETS.join(', ')}`);
    return EXIT.usage;
  }
  if (['incident', 'evidence', 'verify', 'dependency'].includes(kind) && !id) {
    writeError(`${kind} needs an id: reliastra open ${kind} <id>`);
    return EXIT.usage;
  }

  const url = openUrl({ kind, id, siteUrl: session.siteUrl });
  if (!url) {
    writeError(`no web page is known for ${kind}`);
    return EXIT.usage;
  }

  if (flags.json) {
    jsonOut({ url, kind, id: id ?? null, opened: Boolean(flags.browser) });
  } else {
    write(url);
  }
  if (flags.browser) launch(url);
  return EXIT.ok;
}
