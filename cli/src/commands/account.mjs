/**
 * Session commands: login, logout, whoami.
 *
 * `login` takes the password from an interactive prompt or from
 * `RELIASTRA_PASSWORD` so it can run in a container, and never from a flag:
 * a password on a command line lands in shell history and in every process
 * listing on the machine.
 */

import { createInterface } from 'node:readline';
import { EXIT } from '../../bin/reliastra.mjs';
import { jsonOut, kv, write, writeError } from '../output.mjs';

/** Read a line without echoing it, when the terminal supports that. */
function promptSecret(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }
    process.stderr.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let value = '';
    const onData = (chunk) => {
      const char = chunk.toString('utf8');
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stderr.write('\n');
        resolve(value);
      } else if (char === '\u0003') {
        process.stderr.write('\n');
        process.exit(EXIT.usage);
      } else if (char === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    process.stdin.on('data', onData);
  });
}

export async function login({ args, flags, client, writeConfig, configPath }) {
  const email = flags.email ?? args[0] ?? process.env.RELIASTRA_EMAIL;
  if (!email) {
    writeError('email required: `reliastra login --email you@example.com`');
    return EXIT.usage;
  }
  const password = process.env.RELIASTRA_PASSWORD ?? (await promptSecret('password: '));
  if (!password) {
    writeError('password required (or set RELIASTRA_PASSWORD)');
    return EXIT.usage;
  }

  const { data } = await client.post('/v1/auth/login', { email, password });
  const path = writeConfig({
    api_url: client.apiUrl,
    email,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });

  if (flags.json) {
    jsonOut({ stored: path, api_url: client.apiUrl, email, expires_in: data.expires_in });
    return EXIT.ok;
  }
  write(`signed in as ${email}`);
  write(`session stored in ${path} (mode 0600)`);
  write(`token expires in ${data.expires_in}s; it is refreshed automatically on use`);
  return EXIT.ok;
}

export async function logout({ client, clearConfig, configPath }) {
  // Best effort: the server-side revoke is worth attempting, but a failed
  // network call must not leave a token sitting on disk because the CLI
  // refused to finish the job.
  try {
    await client.post('/v1/auth/logout', {});
  } catch {
    /* the local credential is removed regardless */
  }
  const path = clearConfig();
  write(`signed out; removed ${path}`);
  return EXIT.ok;
}

export async function whoami({ flags, client, session }) {
  const [{ data: user }, { data: orgs }] = await Promise.all([
    client.get('/v1/users/me'),
    client.get('/v1/orgs').catch(() => ({ data: [] })),
  ]);
  const org = Array.isArray(orgs) && orgs.length ? orgs[0] : null;

  if (flags.json) {
    jsonOut({ user, organization: org, api_url: client.apiUrl, credential_source: session.source });
    return EXIT.ok;
  }
  kv([
    ['account', user.email],
    ['name', user.full_name],
    ['verified', user.is_active ? 'yes' : 'no'],
    ['organization', org?.name ?? '—'],
    ['api', client.apiUrl],
    ['credential', session.source === 'none' ? '—' : `from ${session.source}`],
  ]);
  return EXIT.ok;
}
