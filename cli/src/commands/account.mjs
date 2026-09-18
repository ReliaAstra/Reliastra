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
import { Client, isApiKey } from '../client.mjs';
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
  // `login --token <key>` stores a programmatic key instead of opening a
  // session. The key is checked before it is written - storing a credential
  // that does not work is how somebody ends up debugging their config at 2am
  // when the answer is that the key was revoked.
  if (flags.token) {
    if (flags.email) {
      writeError('--token and --email are different credentials; pass one.');
      return EXIT.usage;
    }
    const probe = new Client({ apiUrl: client.apiUrl, token: flags.token });
    try {
      await probe.get('/v1/dependencies', { query: { limit: 1 }, retryOnAuth: false });
    } catch (error) {
      if (error?.status === 403) {
        writeError(`that key is valid but cannot read dependencies: ${error.message}`);
        writeError(
          'issue one that can: `reliastra keys create <name> --scopes read:dependencies,read:checks,read:incidents,read:evidence`'
        );
        return EXIT.denied;
      }
      if (error?.status === 401) {
        writeError('that key was rejected by the API. Check it has not been revoked.');
        return EXIT.auth;
      }
      throw error;
    }
    const path = writeConfig({ api_url: client.apiUrl, api_key: flags.token });
    write(`stored an API key in ${path} (mode 0600)`);
    write(
      'the key is sent as a bearer credential and is never refreshed: revoke it with `reliastra keys rm <id>`.'
    );
    return EXIT.ok;
  }

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

  // `--print-token` writes the access token alone on stdout, for piping into
  // another tool on this machine (`gh auth token`-style). It is explicit
  // because a token on stdout can end up in a log; the warning goes to stderr
  // so a pipeline that captures stdout gets only the token.
  if (flags.printToken) {
    write(data.access_token);
    writeError(
      'the access token is on stdout; the session is also stored on this machine. Treat it as a credential.'
    );
    return EXIT.ok;
  }

  if (flags.json) {
    jsonOut({ stored: path, api_url: client.apiUrl, email, expires_in: data.expires_in });
    return EXIT.ok;
  }
  write(`signed in as ${email}`);
  write(`session stored in ${path} (mode 0600)`);
  write(`token expires in ${data.expires_in}s; it is refreshed automatically on use`);
  write('');
  write('next: `reliastra deps list`, or `reliastra doctor` if anything looks wrong.');
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
  // Two kinds of credential can be in play, and they are authorised
  // differently. A session token resolves to a user and an account. An API key
  // deliberately cannot: identity and account surfaces are unmapped for keys
  // ("deny by default"), so asking for them answers 403 - which is the API
  // being correct, not a broken credential. Reporting that as "authentication
  // required" would send someone to re-login for a problem re-login cannot fix.
  const keyCredential = isApiKey(session.token);

  let user = null;
  let denied = false;
  if (!keyCredential) {
    try {
      ({ data: user } = await client.get('/v1/users/me'));
    } catch (error) {
      if (error?.status !== 403) throw error;
      denied = true;
    }
  }

  if (keyCredential || denied) {
    const prefix = session.token ? `${session.token.slice(0, 8)}…` : '—';
    if (flags.json) {
      jsonOut({
        credential: 'api_key',
        key_prefix: prefix,
        account: null,
        note: 'API keys cannot read account or identity surfaces; sign in for those.',
        api_url: client.apiUrl,
        credential_source: session.source,
      });
      return EXIT.ok;
    }
    kv([
      ['credential', `API key ${prefix}`],
      ['account', '— not readable with an API key (identity surfaces are session-only by design)'],
      ['scopes', '— the API does not expose a key’s own scopes to that key'],
      ['api', client.apiUrl],
      ['source', `from ${session.source}`],
    ]);
    write('\n`reliastra login` stores a session when you need account context.');
    return EXIT.ok;
  }

  const { data: orgs } = await client.get('/v1/orgs').catch(() => ({ data: [] }));
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
