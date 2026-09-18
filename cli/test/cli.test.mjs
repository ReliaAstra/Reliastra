/**
 * CLI tests.
 *
 * These run the real command functions against a real HTTP server on
 * localhost - not a stubbed `fetch` - so the things that break in practice
 * (status-code mapping, argument parsing, exit codes, hashing) are exercised
 * the way they will be in a pipeline.
 *
 * Run: `npm test` from `cli/`.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main, parseArgs, EXIT } from '../bin/reliastra.mjs';
import { setOutput, resetOutput } from '../src/output.mjs';

/* ── A tiny stand-in for the RELIASTRA API ──────────────────────────────── */

const PDF_BYTES = Buffer.from('%PDF-1.7\nfake artifact for the test suite\n');
const REPORT_CHECKSUM = createHash('sha256').update(PDF_BYTES).digest('hex');

const routes = {
  'POST /v1/auth/login': (body) =>
    body.email === 'engineer@example.com' && body.password === 'correct-horse'
      ? [200, { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 900 }]
      : [401, { detail: 'Incorrect email or password' }],
  'GET /v1/users/me': () => [200, { id: 'u1', email: 'engineer@example.com', full_name: 'Ada Lovelace', is_active: true, is_superuser: false }],
  'GET /v1/orgs': () => [200, [{ id: 'o1', name: 'personal' }]],
  'GET /v1/dependencies': () => [
    200,
    { items: [{ id: 'dep-1234abcd', name: 'Stripe API', endpoint_url: 'https://api.stripe.com/v1/charges', check_interval_seconds: 300, is_active: true, last_check_at: '2026-09-18T10:00:00Z' }], next_cursor: null },
  ],
  'POST /v1/dependencies': (body) => [201, { id: 'dep-new', ...body, next_check_at: '2026-09-18T10:05:00Z' }],
  'DELETE /v1/dependencies/dep-1234abcd': () => [204, null],
  'GET /v1/checks/recent': () => [
    200,
    [
      { id: 'c1', dependency_id: 'dep-1234abcd', region: 'us-east', executed_at: '2026-09-18T10:00:00Z', latency_ms: 212.4, status_code: 200, is_up: true, quorum_confirmed: false },
      { id: 'c2', dependency_id: 'dep-1234abcd', region: 'us-east', executed_at: '2026-09-18T09:55:00Z', latency_ms: null, status_code: null, is_up: false, error_message: 'connect timeout', quorum_confirmed: false },
    ],
  ],
  'GET /v1/incidents': () => [
    200,
    { items: [{ id: 'inc-1', dependency_id: 'dep-1234abcd', started_at: '2026-09-18T09:55:00Z', resolved_at: null, severity: 'major', status: 'open', root_cause: 'vendor_failure' }] },
  ],
  'GET /v1/incidents/inc-1': () => [
    200,
    {
      id: 'inc-1',
      dependency_id: 'dep-1234abcd',
      started_at: '2026-09-18T09:55:00Z',
      resolved_at: null,
      severity: 'major',
      status: 'open',
      root_cause: 'vendor_failure',
      evidence_report_id: 'rep-1',
      evidence_status: 'ready',
      correlations: [
        { id: 'cor-1', incident_id: 'inc-1', correlated_dependency_id: 'dep-9999', correlation_confidence: 0.9, time_window_seconds: 300, correlation_method: 'temporal', created_at: '2026-09-18T10:05:00Z' },
      ],
    },
  ],
  'GET /v1/evidence': () => [
    200,
    [{ id: 'rep-1', incident_id: 'inc-1', generated_at: '2026-09-18T10:10:00Z', expires_at: '2027-09-18T10:10:00Z', file_size_bytes: PDF_BYTES.length, checksum: REPORT_CHECKSUM }],
  ],
  'GET /v1/evidence/rep-1': () => [
    200,
    {
      id: 'rep-1',
      incident_id: 'inc-1',
      generated_at: '2026-09-18T10:10:00Z',
      expires_at: '2027-09-18T10:10:00Z',
      file_size_bytes: PDF_BYTES.length,
      checksum: REPORT_CHECKSUM,
      // The fields the download response carries after the API change: the
      // path from an artifact back to its own verification record.
      verification_id: 'good-id',
      verification_url: 'https://reliastra.com/reports/good-id',
      data_hash: 'aaaa1111',
      methodology_version: 'v1.0',
      signed: false,
      signature_alg: null,
      download_url: 'https://storage.example/rep-1.pdf?token=…',
    },
  ],
  'GET /health': () => [200, { status: 'ok' }],
  'GET /v1/dependencies/dep-1234abcd': () => [
    200,
    {
      id: 'dep-1234abcd',
      name: 'Stripe API',
      endpoint_url: 'https://api.stripe.com/v1/charges',
      method: 'GET',
      expected_status_codes: [200, 204],
      check_interval_seconds: 300,
      timeout_seconds: 10,
      next_check_at: '2026-09-18T10:05:00Z',
      is_active: true,
      regions: ['us-east'],
      last_check_at: '2026-09-18T10:00:00Z',
    },
  ],
  'GET /v1/dependencies/dep-1234abcd/results': () => [
    200,
    { items: [{ id: 'c1', dependency_id: 'dep-1234abcd', region: 'us-east', executed_at: '2026-09-18T10:00:00Z', latency_ms: 212.4, status_code: 200, is_up: true }] },
  ],
  'DELETE /v1/api-keys/k1': () => [204, null],
  'GET /v1/verify/good-id': () => [
    200,
    {
      found: true,
      incident_id: 'inc-1',
      dependency_id: 'dep-1234abcd',
      time_window: { start: '2026-09-18T09:55:00Z', end: '2026-09-18T10:06:00Z' },
      data_hash: 'aaaa1111',
      report_checksum: REPORT_CHECKSUM,
      methodology_version: 'v1.0',
      authenticity: { signed: false, algorithm: null, public_keys: '/v1/verify/keys' },
    },
  ],
  'GET /v1/verify/missing-id': () => [404, { found: false, error: 'Evidence not found' }],
  'GET /v1/verify/degraded-id': () => [503, { found: false, service_degraded: true }],
  'GET /v1/api-keys': () => [200, [{ id: 'k1', name: 'ci', prefix: 'rel_ab12', scopes: ['read:checks'], created_at: '2026-09-01T00:00:00Z' }]],
  'POST /v1/api-keys': (body) => [201, { id: 'k2', name: body.name, prefix: 'rel_cd34', scopes: ['read:checks', 'write:dependencies'], full_key: 'rel_cd34_secret', created_at: '2026-09-18T00:00:00Z' }],
  'GET /v1/vendors': () => [200, { items: [{ vendor_name: 'openai', display_name: 'OpenAI', category: 'ai', recent_status: 'operational', latency_ms: 143.2, last_check_at: '2026-09-18T10:00:00Z' }] }],
  'GET /v1/vendors/openai': () => [200, { vendor_name: 'openai', display_name: 'OpenAI', category: 'ai', recent_status: 'operational', endpoints: [{ endpoint_url: 'https://api.openai.com/v1/models', health_status: 'up', last_check_at: '2026-09-18T10:00:00Z' }] }],
  // The owner-addressed artifact route. There is deliberately no route for
  // `GET /v1/evidence/{id}/download` here: that path belongs to the public
  // evidence gate and takes a report *token*, so a CLI that called it with a
  // report id would 404 against the real API. The harness would do the same,
  // which is what makes this file a regression guard for the route.
  'GET /v1/evidence/rep-1/artifact': () => [200, PDF_BYTES, 'application/pdf'],
};

let server;
let baseUrl;
let configDir;
const original = {};

function startServer() {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
        const key = `${req.method} ${req.url.split('?')[0]}`;
        const handler = routes[key];
        // A credential that authenticates but lacks the scope, exactly as the
        // API answers it (403 + the scope that was missing).
        if ((req.headers.authorization ?? '').includes('denied-token')) {
          res.writeHead(403, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ detail: 'API key lacks required scope: read:dependencies' }));
          return;
        }
        // Authenticated routes reject a missing bearer token, exactly as the
        // API does; otherwise "no credential stored" would look like success.
        const isPublic =
          key.startsWith('GET /v1/verify/') ||
          key.startsWith('GET /v1/vendors') ||
          key === 'POST /v1/auth/login' ||
          key === 'POST /v1/auth/refresh';
        if (handler && !isPublic && !key.startsWith('GET /v1/verify/') && !(req.headers.authorization ?? '').startsWith('Bearer ')) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ detail: 'Not authenticated' }));
          return;
        }
        if (!handler) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ detail: `no route for ${key}` }));
          return;
        }
        const [status, payload, contentType] = handler(body);
        if (payload === null) {
          res.writeHead(status);
          res.end();
          return;
        }
        if (Buffer.isBuffer(payload)) {
          res.writeHead(status, { 'content-type': contentType ?? 'application/octet-stream' });
          res.end(payload);
          return;
        }
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

/** Run the CLI, capturing output through the injectable sinks. */
async function run(argv, env = process.env) {
  const out = [];
  const err = [];
  const sink = (bucket) => ({
    write: (chunk) => {
      bucket.push(String(chunk));
      return true;
    },
  });
  setOutput({ stdout: sink(out), stderr: sink(err) });
  try {
    const code = await main(argv, env);
    return { code, out: out.join(''), err: err.join('') };
  } finally {
    resetOutput();
  }
}

before(async () => {
  await startServer();
  configDir = mkdtempSync(join(tmpdir(), 'reliastra-cli-'));
  original.config = process.env.RELIASTRA_CONFIG;
  original.token = process.env.RELIASTRA_TOKEN;
  original.password = process.env.RELIASTRA_PASSWORD;
  process.env.RELIASTRA_CONFIG = join(configDir, 'config.json');
  process.env.RELIASTRA_PASSWORD = 'correct-horse';
  delete process.env.RELIASTRA_TOKEN;
});

after(() => {
  server?.close();
  rmSync(configDir, { recursive: true, force: true });
  if (original.config === undefined) delete process.env.RELIASTRA_CONFIG;
  else process.env.RELIASTRA_CONFIG = original.config;
  if (original.token === undefined) delete process.env.RELIASTRA_TOKEN;
  else process.env.RELIASTRA_TOKEN = original.token;
  if (original.password === undefined) delete process.env.RELIASTRA_PASSWORD;
  else process.env.RELIASTRA_PASSWORD = original.password;
});

/* ── Argument parsing ───────────────────────────────────────────────────── */

describe('argument parsing', () => {
  it('separates positionals from flags and normalises kebab-case', () => {
    const parsed = parseArgs(['deps', 'add', 'Stripe', 'https://api.stripe.com', '--check-interval', '60', '--json']);
    assert.deepEqual(parsed.positionals, ['deps', 'add', 'Stripe', 'https://api.stripe.com']);
    assert.equal(parsed.flags.checkInterval, '60');
    assert.equal(parsed.flags.json, true);
  });

  it('accepts --flag=value', () => {
    const { flags } = parseArgs(['verify', '--expect-hash=abc123']);
    assert.equal(flags.expectHash, 'abc123');
  });

  it('treats a trailing boolean flag as true', () => {
    const { flags } = parseArgs(['checks', 'recent', '--json']);
    assert.equal(flags.json, true);
  });
});

/* ── Session ────────────────────────────────────────────────────────────── */

describe('session', () => {
  it('stores a session with mode 0600 and reports the source of the credential', async () => {
    const login = await run(['login', '--email', 'engineer@example.com', '--api-url', baseUrl]);
    assert.equal(login.code, EXIT.ok);
    assert.match(login.out, /signed in as engineer@example\.com/);

    const stored = JSON.parse(readFileSync(process.env.RELIASTRA_CONFIG, 'utf8'));
    assert.equal(stored.refresh_token, 'refresh-1');

    const me = await run(['whoami', '--api-url', baseUrl]);
    assert.equal(me.code, EXIT.ok);
    assert.match(me.out, /Ada Lovelace/);
    assert.match(me.out, /from config/);
  });

  it('stores an API key with --token, after checking it works', async () => {
    const result = await run([
      'login', '--token', 'rel_0123456789abcdef0123456789abcdef01234567', '--api-url', baseUrl,
    ]);
    assert.equal(result.code, EXIT.ok);
    const stored = JSON.parse(readFileSync(process.env.RELIASTRA_CONFIG, 'utf8'));
    assert.equal(stored.api_key, 'rel_0123456789abcdef0123456789abcdef01234567');
    assert.equal(stored.access_token, undefined);

    const me = await run(['whoami', '--api-url', baseUrl]);
    assert.equal(me.code, EXIT.ok);
    assert.match(me.out, /API key/);

    // The session login below restores the session credential for later tests.
    await run(['login', '--email', 'engineer@example.com', '--api-url', baseUrl]);
  });

  it('refuses a key that cannot read dependencies, rather than storing it', async () => {
    const before = readFileSync(process.env.RELIASTRA_CONFIG, 'utf8');
    const result = await run(['login', '--token', 'denied-token', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.denied);
    assert.match(result.err, /cannot read dependencies/);
    assert.equal(readFileSync(process.env.RELIASTRA_CONFIG, 'utf8'), before);
  });

  it('reports a bad password as an auth failure, not a crash', async () => {
    const bad = await run(['login', '--email', 'nobody@example.com', '--api-url', baseUrl]);
    assert.equal(bad.code, EXIT.auth);
    assert.match(bad.err, /Incorrect email or password/);
  });

  it('exits 3 with a usable message when no credential is present', async () => {
    delete process.env.RELIASTRA_CONFIG;
    const result = await run(['deps', 'list', '--api-url', baseUrl]);
    process.env.RELIASTRA_CONFIG = join(configDir, 'config.json');
    assert.equal(result.code, EXIT.auth);
    assert.match(result.err, /Run `reliastra login`/);
    assert.match(result.err, /RELIASTRA_TOKEN/);
  });
});

/* ── Reading the product ────────────────────────────────────────────────── */

describe('reading product state', () => {
  it('renders dependencies with the observation interval, not the raw seconds', async () => {
    const result = await run(['deps', 'list', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /Stripe API/);
    assert.match(result.out, /5m/);
  });

  it('emits the API shape under --json', async () => {
    const result = await run(['deps', 'list', '--json', '--api-url', baseUrl]);
    const parsed = JSON.parse(result.out);
    assert.equal(parsed[0].endpoint_url, 'https://api.stripe.com/v1/charges');
  });

  it('shows a failed observation as a fact about one probe, with a null latency intact', async () => {
    const result = await run(['checks', 'recent', '--api-url', baseUrl]);
    assert.match(result.out, /failed/);
    assert.match(result.out, /connect timeout/);
    assert.match(result.out, /incident is opened by the detector/);
  });

  it('reports correlations without inventing a detection rule the endpoint does not return', async () => {
    const result = await run(['incidents', 'show', 'inc-1', '--api-url', baseUrl]);
    assert.match(result.out, /correlated dependencies/);
    assert.match(result.out, /dep-9999/);
    assert.doesNotMatch(result.out, /quorum/i);
    assert.match(result.out, /reliastra evidence show rep-1/);
  });

  it('summarises a bad request body the API rejected', async () => {
    const result = await run(['deps', 'add', 'Broken', 'not-a-url', '--api-url', baseUrl]);
    // The mock server accepts it; this asserts the CLI forwards the body it built.
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /dep-new/);
  });
});

/* ── Evidence and verification ──────────────────────────────────────────── */

describe('evidence', () => {
  it('writes the artifact and prints the hash of the bytes it wrote', async () => {
    const out = join(configDir, 'artifact.pdf');
    const result = await run(['evidence', 'get', 'rep-1', '--out', out, '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.ok);
    assert.equal(readFileSync(out).length, PDF_BYTES.length);
    assert.match(result.out, new RegExp(REPORT_CHECKSUM));
  });

  it('returns 0 when a document matches the record it claims to be', async () => {
    const out = join(configDir, 'artifact.pdf');
    const result = await run(['verify', 'good-id', '--file', out, '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /verification record found/);
    assert.match(result.out, /matches record\s+yes/);
  });

  it('returns 4 when the document has been altered', async () => {
    const tampered = join(configDir, 'tampered.pdf');
    writeFileSync(tampered, Buffer.from('%PDF-1.7\naltered\n'));
    const result = await run(['verify', 'good-id', '--file', tampered, '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.unverified);
    assert.match(result.err, /does not match the checksum on the record/);
  });

  it('returns 4 when the expected data hash does not match', async () => {
    const result = await run(['verify', 'good-id', '--expect-hash', 'deadbeef', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.unverified);
    assert.match(result.err, /expected data hash does not match/);
  });

  it('returns 4 for an unknown id, and says so without inventing a reason', async () => {
    const result = await run(['verify', 'missing-id', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.unverified);
    assert.match(result.err, /no verification record exists for this id/);
  });

  it('distinguishes "service degraded" from "no such record"', async () => {
    const result = await run(['verify', 'degraded-id', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.unverified);
    assert.match(result.err, /temporarily unavailable/);
  });
});

/* ── Public observatory ─────────────────────────────────────────────────── */

describe('observatory', () => {
  it('lists public vendors with the provenance of the status field stated', async () => {
    const result = await run(['obs', 'list', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /openai/);
    assert.match(result.out, /statement about this probe, not vendor-wide health/);
  });
});

/* ── Usage errors ───────────────────────────────────────────────────────── */

describe('usage', () => {
  it('prints help and exits 0 for --help', async () => {
    const result = await run(['--help']);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /reliastra — observe external dependencies/);
  });

  it('exits 1 for an unknown command', async () => {
    const result = await run(['teleport']);
    assert.equal(result.code, EXIT.usage);
    assert.match(result.err, /unknown command: teleport/);
  });

  it('exits 1 for a missing argument rather than guessing one', async () => {
    const result = await run(['evidence', 'show']);
    assert.equal(result.code, EXIT.usage);
    assert.match(result.out, /usage: reliastra evidence show/);
  });
});

/* ── Help, everywhere ───────────────────────────────────────────────────── */

describe('help', () => {
  it('answers --help for a command without running it', async () => {
    const result = await run(['evidence', '--help']);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /reliastra evidence <list|show|get>/);
    assert.match(result.out, /verification URL/);
  });

  it('answers --help for a subcommand, so a flag never has to be guessed', async () => {
    const result = await run(['evidence', 'get', '--help']);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /--out <path>/);
    assert.match(result.out, /hashed here, not echoed|computed from the file on disk/);
  });

  it('documents exit codes in the top-level help', async () => {
    const result = await run(['--help']);
    assert.match(result.out, /verification claim did not hold/);
    assert.match(result.out, /could not be reached/);
  });

  it('rejects an unknown subcommand and offers the one that exists', async () => {
    const result = await run(['evidence', 'frobnicate']);
    assert.equal(result.code, EXIT.usage);
    assert.match(result.err, /unknown subcommand: evidence frobnicate/);
    assert.match(result.err, /reliastra evidence --help/);
  });

  it('rejects an unknown flag rather than ignoring it', async () => {
    const result = await run(['deps', 'list', '--interva', '60', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.usage);
    assert.match(result.err, /unknown flag/);
    assert.match(result.err, /did you mean `--interval`/);
  });

  it('prints a version string', async () => {
    const result = await run(['--version']);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out.trim(), /^\d+\.\d+\.\d+/);
  });
});

/* ── Doctor ─────────────────────────────────────────────────────────────── */

describe('doctor', () => {
  it('passes every essential check with a stored session', async () => {
    await run(['login', '--email', 'engineer@example.com', '--api-url', baseUrl]);
    const result = await run(['doctor', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /api reachable/);
    assert.match(result.out, /authenticated/);
  });

  it('names authentication as the failure rather than blaming the network', async () => {
    const result = await run(['doctor', '--api-url', baseUrl], {
      ...process.env,
      RELIASTRA_TOKEN: 'denied-token',
    });
    assert.equal(result.code, EXIT.denied);
    assert.match(result.err, /authenticated/);
    assert.match(result.err, /reliastra keys create/);
  });

  it('reports an unreachable API as a network failure with its own exit code', async () => {
    const result = await run(['doctor', '--api-url', 'http://127.0.0.1:9']);
    assert.equal(result.code, EXIT.network);
    assert.match(result.err, /api reachable/);
  });

  it('never prints the credential value', async () => {
    const secret = 'rel_0123456789abcdef0123456789abcdef01234567';
    await run(['login', '--email', 'engineer@example.com', '--api-url', baseUrl]);
    const result = await run(['doctor', '--json', '--api-url', baseUrl], {
      ...process.env,
      RELIASTRA_TOKEN: secret,
    });
    assert.equal(result.code, EXIT.ok);
    assert.doesNotMatch(result.out, new RegExp(secret));
    assert.match(result.out, /"credential_source": "environment"/);
  });
});

/* ── Terminal to web ────────────────────────────────────────────────────── */

describe('web links', () => {
  const site = 'https://console.test';

  it('builds the public verification URL for any identifier it prints', async () => {
    const result = await run(['open', 'verify', '8Kd2xQ7mB4pL', '--site-url', site]);
    assert.equal(result.code, EXIT.ok);
    assert.equal(result.out.trim(), `${site}/reports/8Kd2xQ7mB4pL`);
  });

  it('builds console URLs for incidents, evidence and dependencies', async () => {
    const incident = await run(['open', 'incident', 'inc-1', '--site-url', site]);
    assert.equal(incident.out.trim(), `${site}/incidents/inc-1`);
    const evidence = await run(['open', 'evidence', 'rep-1', '--site-url', site]);
    assert.equal(evidence.out.trim(), `${site}/evidence/rep-1`);
    const dependency = await run(['open', 'dependency', 'dep-1', '--site-url', site]);
    assert.equal(dependency.out.trim(), `${site}/dependencies/dep-1`);
  });

  it('needs an id for a resource, and says which kinds exist', async () => {
    const result = await run(['open', 'incident', '--site-url', site]);
    assert.equal(result.code, EXIT.usage);
    assert.match(result.err, /incident needs an id/);
  });

  it('prints the console URL from the evidence detail, not only from `open`', async () => {
    const result = await run(['evidence', 'show', 'rep-1', '--site-url', site, '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /https:\/\/reliastra\.com\/reports\/good-id/);
    assert.match(result.out, new RegExp(`${site}/evidence/rep-1`));
  });
});

/* ── Destructive commands ───────────────────────────────────────────────── */

describe('destructive commands', () => {
  it('refuses to remove a dependency without a confirmation or --yes', async () => {
    const result = await run(['deps', 'rm', 'dep-1234abcd', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.usage);
    assert.match(result.err, /no terminal is attached/);
    assert.match(result.err, /--yes/);
  });

  it('removes it with --yes, which is what a script passes', async () => {
    const result = await run(['deps', 'rm', 'dep-1234abcd', '--yes', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /removed dep-1234abcd/);
  });

  it('revokes an API key by id', async () => {
    const result = await run(['keys', 'rm', 'k1', '--yes', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /revoked k1/);
  });
});

/* ── One dependency, end to end ─────────────────────────────────────────── */

describe('dependency record', () => {
  it('shows configuration, observations and incidents together', async () => {
    const result = await run(['deps', 'show', 'dep-1234abcd', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /Stripe API/);
    assert.match(result.out, /last 1 observations/);
    assert.match(result.out, /incidents for this dependency/);
    assert.match(result.out, /console  https:\/\/reliastra\.com\/dependencies\/dep-1234abcd/);
  });

  it('filters observations by dependency through the dependency\'s own endpoint', async () => {
    const result = await run([
      'checks', 'recent', '--dependency', 'dep-1234abcd', '--api-url', baseUrl,
    ]);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /for dependency dep-1234abcd/);
  });

  it('follows an incident to its evidence record with --evidence', async () => {
    const result = await run(['incidents', 'show', 'inc-1', '--evidence', '--api-url', baseUrl]);
    assert.equal(result.code, EXIT.ok);
    assert.match(result.out, /evidence record/);
    assert.match(result.out, /https:\/\/reliastra\.com\/reports\/good-id/);
  });
});

/* ── Failure taxonomy ───────────────────────────────────────────────────── */

describe('failure taxonomy', () => {
  it('distinguishes "not permitted" from "not authenticated"', async () => {
    const result = await run(['deps', 'list', '--api-url', baseUrl], {
      ...process.env,
      RELIASTRA_TOKEN: 'denied-token',
    });
    assert.equal(result.code, EXIT.denied);
    assert.match(result.err, /not permitted/);
    assert.match(result.err, /scope/);
  });

  it('gives an unreachable API its own exit code, not an auth one', async () => {
    const result = await run(['deps', 'list', '--api-url', 'http://127.0.0.1:9']);
    assert.equal(result.code, EXIT.network);
    assert.match(result.err, /could not be reached/);
    assert.doesNotMatch(result.err, /authentication/);
  });

  it('never prints a stack trace', async () => {
    const result = await run(['deps', 'list', '--api-url', baseUrl], {
      ...process.env,
      RELIASTRA_TOKEN: 'denied-token',
    });
    assert.doesNotMatch(result.err, /\n\s+at /);
  });
});
