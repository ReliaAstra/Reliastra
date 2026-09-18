/**
 * Credential and endpoint resolution.
 *
 * Precedence, highest first:
 *
 *   1. explicit CLI flags            (--api-url, --token)
 *   2. environment                   (RELIASTRA_API_URL, RELIASTRA_TOKEN)
 *   3. the config file               (~/.config/reliastra/config.json)
 *   4. the documented default        (https://api.reliastra.com)
 *
 * The config file holds a refresh token, so it is written with mode 0600 and
 * the containing directory with 0700. On a platform where those modes are not
 * enforced, `reliastra login` says so rather than implying a protection that
 * does not exist.
 */

import { chmodSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_API_URL = 'https://api.reliastra.com';

/**
 * The web application's origin.
 *
 * Commands that identify a resource print the page where a person can read it,
 * because the CLI and the web console are two views of the same record rather
 * than two products. The default is the production site; a self-hosted
 * deployment or a local development server overrides it with
 * `--site-url`, `RELIASTRA_SITE_URL` or `site_url` in the config file.
 */
export const DEFAULT_SITE_URL = 'https://reliastra.com';

/** XDG-style config location, so a container can redirect it in one variable. */
export function configPath(env = process.env) {
  if (env.RELIASTRA_CONFIG) return env.RELIASTRA_CONFIG;
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'reliastra', 'config.json');
}

export function readConfig(env = process.env) {
  const path = configPath(env);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    // A corrupt config must not wedge every command. The caller falls back to
    // environment/defaults and `reliastra login` overwrites the file.
    return {};
  }
}

export function writeConfig(config, env = process.env) {
  const path = configPath(env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(dirname(path), 0o700);
    chmodSync(path, 0o600);
  } catch {
    // Windows and some mounted filesystems ignore these; the note on stderr is
    // handled by the login command, not here.
  }
  return path;
}

export function clearConfig(env = process.env) {
  const path = configPath(env);
  if (existsSync(path)) rmSync(path, { force: true });
  return path;
}

/**
 * The resolved session for this invocation. `source` is returned so commands
 * can tell the operator where a credential came from - "which token am I
 * using" is the first question in a support thread, and guessing at it wastes
 * everyone's time.
 */
export function resolveSession(flags = {}, env = process.env) {
  const file = readConfig(env);
  const apiUrl = (
    flags.apiUrl ||
    env.RELIASTRA_API_URL ||
    file.api_url ||
    DEFAULT_API_URL
  ).replace(/\/+$/, '');
  const siteUrl = (
    flags.siteUrl ||
    env.RELIASTRA_SITE_URL ||
    file.site_url ||
    DEFAULT_SITE_URL
  ).replace(/\/+$/, '');

  if (flags.token) {
    return { apiUrl, siteUrl, token: flags.token, source: 'flag', config: file };
  }
  if (env.RELIASTRA_TOKEN) {
    return {
      apiUrl,
      siteUrl,
      token: env.RELIASTRA_TOKEN,
      source: 'environment',
      config: file,
    };
  }
  if (file.api_key) {
    // A stored API key is its own field, not an `access_token`: the two are
    // refreshed differently, and a key written over a session (or the reverse)
    // would silently change which credential a later command sends.
    return {
      apiUrl,
      siteUrl,
      token: file.api_key,
      source: 'config (api key)',
      config: file,
    };
  }
  if (file.access_token) {
    return { apiUrl, siteUrl, token: file.access_token, source: 'config', config: file };
  }
  return { apiUrl, siteUrl, token: null, source: 'none', config: file };
}

/**
 * Web URLs for the resources the CLI can identify.
 *
 * One place, so `--web`, `reliastra open` and the hints printed after a command
 * cannot drift apart. Every path here is a route that exists in the web
 * application (see `frontend/src/lib/routes.ts`).
 */
export function webUrls(siteUrl) {
  const base = siteUrl.replace(/\/+$/, '');
  return {
    dashboard: `${base}/dashboard`,
    dependency: (id) => `${base}/dependencies/${encodeURIComponent(id)}`,
    incident: (id) => `${base}/incidents/${encodeURIComponent(id)}`,
    evidence: (id) => `${base}/evidence/${encodeURIComponent(id)}`,
    verification: (id) => `${base}/reports/${encodeURIComponent(id)}`,
    observatory: () => `${base}/observatory`,
    vendor: (name) => `${base}/observatory/${encodeURIComponent(name)}`,
    docs: (slug = '') => `${base}/docs${slug ? `/${slug}` : ''}`,
    quickstart: `${base}/docs/quickstart`,
    methodology: `${base}/docs/methodology`,
    product: `${base}/product`,
    evidenceProduct: `${base}/product/evidence`,
  };
}
