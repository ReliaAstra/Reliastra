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

  if (flags.token) {
    return { apiUrl, token: flags.token, source: 'flag', config: file };
  }
  if (env.RELIASTRA_TOKEN) {
    return { apiUrl, token: env.RELIASTRA_TOKEN, source: 'environment', config: file };
  }
  if (file.access_token) {
    return { apiUrl, token: file.access_token, source: 'config', config: file };
  }
  return { apiUrl, token: null, source: 'none', config: file };
}
