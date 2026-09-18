/**
 * Evidence, verification, API keys and the public observatory.
 *
 * `verify` is the command this CLI exists for. Everything else is convenience;
 * this one answers the question a recipient of an artifact actually has -
 * *is this document what RELIASTRA issued?* - and answers it with a status
 * code, so it can gate a pipeline.
 *
 * The commands around it exist so that question can be reached without leaving
 * the terminal: `evidence show` prints the record's public verification URL,
 * and `open verify <id>` prints the page a human reads. The verification logic
 * itself is never reimplemented here. The API is the authority; the CLI formats
 * its answer.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { EXIT } from '../../bin/reliastra.mjs';
import { jsonOut, kv, table, write, writeError, heading, hint } from '../output.mjs';
import { guardDestructive } from '../prompt.mjs';

const time = (iso) => (iso ? String(iso).replace('T', ' ').replace(/\..*$/, 'Z') : null);
const bytes = (n) => (n === null || n === undefined ? null : `${(n / 1024).toFixed(0)} KiB`);
const listOf = (data) => (Array.isArray(data) ? data : (data?.items ?? data?.data ?? []));

/* ── evidence ───────────────────────────────────────────────────────────── */

async function listEvidence({ flags, client, session, webUrls }) {
  const { data } = await client.get('/v1/evidence', { query: { limit: flags.limit ?? 50 } });
  const items = listOf(data);

  if (flags.json) {
    jsonOut(items);
    return EXIT.ok;
  }
  const columns = [
    { header: 'report', value: (e) => e.id, max: 8 },
    { header: 'generated (utc)', value: (e) => time(e.generated_at) },
    { header: 'expires', value: (e) => time(e.expires_at) },
    { header: 'size', value: (e) => bytes(e.file_size_bytes) },
    { header: 'sha-256', value: (e) => e.checksum, max: 16 },
  ];
  if (flags.web) {
    columns.push({ header: 'web', value: (e) => webUrls(session.siteUrl).evidence(e.id), max: 60 });
  }
  table(items, columns, {
    empty: 'no evidence records yet — they are issued from a resolved incident',
  });
  hint(
    items.length
      ? '`reliastra evidence show <id>` prints the record and its public verification URL;\n`reliastra evidence get <id>` writes the PDF.'
      : '',
    flags
  );
  return EXIT.ok;
}

async function showEvidence({ args, flags, client, session, webUrls }) {
  const [id] = args;
  if (!id) {
    writeError('evidence report id required');
    write('usage: reliastra evidence show <report-id> [--payload] [--web]');
    return EXIT.usage;
  }
  const { data } = await client.get(`/v1/evidence/${encodeURIComponent(id)}`);
  const site = webUrls(session.siteUrl);

  if (flags.json) {
    jsonOut(data);
    return EXIT.ok;
  }

  kv([
    ['report', data.id ?? id],
    ['incident', data.incident_id],
    ['generated', time(data.generated_at)],
    ['expires', time(data.expires_at)],
    ['size', bytes(data.file_size_bytes)],
    ['sha-256 (document)', data.checksum],
  ]);

  if (flags.payload) {
    // The payload hash and the signature describe the facts rather than the
    // file: one is what the incident data must hash to, the other proves who
    // produced it. They are behind a flag because most readers want the
    // document checksum and the verification URL, not three more hashes.
    kv([
      ['sha-256 (payload)', data.data_hash],
      ['methodology', data.methodology_version],
      [
        'signed',
        data.signed
          ? `yes (${data.signature_alg})`
          : 'no — this deployment issues unsigned artifacts, and the document says so',
      ],
    ]);
  }

  write('');
  if (data.verification_url) {
    // The whole point of the record, printed as a URL rather than described:
    // anyone holding the document can paste it and get the hashes re-checked
    // without an account.
    write(`verify   ${data.verification_url}`);
    write(`api      ${client.apiUrl}/v1/verify/${data.verification_id ?? '<verification-id>'}`);
  } else {
    write('verify   —');
    write(
      '         no verification id is recorded for this artifact. Artifacts issued before'
    );
    write('         snapshots were linked cannot be verified against the public record.');
  }
  write(`console  ${site.evidence(data.id ?? id)}`);
  hint(
    `\nre-check the bytes on disk against the record:\n  reliastra evidence get ${id} --out artifact.pdf && reliastra verify ${data.verification_id ?? '<id>'} --file artifact.pdf`,
    flags
  );
  return EXIT.ok;
}

async function getEvidence({ args, flags, client, session, webUrls }) {
  const [id] = args;
  if (!id) {
    writeError('evidence report id required');
    write('usage: reliastra evidence get <report-id> [--out file.pdf]');
    return EXIT.usage;
  }
  const out = flags.out ?? `reliastra-evidence-${id}.pdf`;
  const buffer = await client.download(`/v1/evidence/${encodeURIComponent(id)}/download`);
  writeFileSync(out, buffer);

  // The hash of the bytes on disk, computed here rather than echoed from the
  // API: comparing the two is the whole point of writing the file.
  const digest = createHash('sha256').update(buffer).digest('hex');

  // Best effort: the record is worth printing, but a failure to read it must
  // not turn a successful download into an error.
  const record = await client
    .get(`/v1/evidence/${encodeURIComponent(id)}`)
    .then((r) => r.data)
    .catch(() => null);

  if (flags.json) {
    jsonOut({
      file: out,
      bytes: buffer.length,
      sha256: digest,
      matches_record: record?.checksum ? record.checksum === digest : null,
      verification_url: record?.verification_url ?? null,
    });
    return EXIT.ok;
  }

  kv([
    ['wrote', out],
    ['bytes', buffer.length],
    ['sha-256', digest],
    [
      'matches record',
      record?.checksum ? (record.checksum === digest ? 'yes' : 'no') : 'not checked',
    ],
  ]);
  if (record?.verification_url) write(`\nverify   ${record.verification_url}`);
  hint(
    `\nThe record proves what these bytes must hash to. Check them from the record side with:\n  reliastra verify ${record?.verification_id ?? '<verification-id>'} --file ${out}`,
    flags
  );
  void session;
  void webUrls;
  return EXIT.ok;
}

export async function evidence(context) {
  const [sub, ...rest] = context.args;
  if (sub === 'list' || sub === undefined) return listEvidence(context);
  if (sub === 'show') return showEvidence({ ...context, args: rest });
  if (sub === 'get' || sub === 'download') return getEvidence({ ...context, args: rest });
  context.writeError(`unknown subcommand: evidence ${sub}`);
  context.write('  evidence list | evidence show <id> | evidence get <id>');
  context.writeError(`run \`reliastra evidence --help\` for the full form.`);
  return EXIT.usage;
}

/* ── verify ─────────────────────────────────────────────────────────────── */

/**
 * Check an artifact against the public verification record.
 *
 * This command is unauthenticated on purpose - the whole scenario it serves is
 * a person who was handed a document and has no RELIASTRA account. It fails
 * closed: a missing record, a hash mismatch, or an unreachable service all
 * leave the exit code at 4, and only an exact match returns 0.
 */
export async function verify({ args, flags, client }) {
  const verificationId = flags.id ?? args[0];
  if (!verificationId) {
    writeError('verification id required');
    write(
      'usage: reliastra verify <verification-id> [--file document.pdf] [--expect-hash <sha256>]'
    );
    write(
      'the id is printed in the artifact footer and encoded in its QR code; `reliastra evidence show <report-id>` prints it too.'
    );
    return EXIT.usage;
  }

  // 404 and 503 are answers to the verification question, not transport
  // failures: "no record" and "cannot check right now" are both cases where the
  // claim did not hold and the exit code must say so. Only 5xx that are not the
  // documented degraded response, or a network failure, propagate as errors.
  let response;
  let record = {};
  try {
    const result = await client.request(`/v1/verify/${encodeURIComponent(verificationId)}`, {
      retryOnAuth: false,
    });
    response = result.response;
    record = result.data ?? {};
  } catch (error) {
    if (error?.status === 404) {
      response = { status: 404 };
      record = { found: false, ...(typeof error.body === 'object' ? error.body : {}) };
    } else if (error?.status === 503) {
      response = { status: 503 };
      record = {
        found: false,
        service_degraded: true,
        ...(typeof error.body === 'object' ? error.body : {}),
      };
    } else {
      throw error;
    }
  }

  const found = record.found === true;
  const degraded = response.status === 503 || record.service_degraded === true;
  const problems = [];
  if (!found && degraded) {
    problems.push('the verification service could not be read, so this record could not be checked');
  } else if (!found) {
    problems.push('no verification record exists for this id');
  }

  // ── Local checks, when the caller supplied something to check against ──
  //
  // Only the rendered document is re-hashed here, and only against the
  // checksum the record publishes. The payload hash (data_hash) covers the
  // canonical serialisation of the facts, and the record does not publish a
  // checksum for any payload file, so a "check" of a JSON file this CLI
  // re-serialised itself would be our own encoder agreeing with itself - and
  // would report a mismatch on any float whose shortest representation differs
  // from Python's. Claiming a verification that can produce false accusations
  // is worse than not offering it.
  let recomputed = null;
  if (flags.file) {
    const buffer = readFileSync(flags.file);
    recomputed = createHash('sha256').update(buffer).digest('hex');
    if (!record.report_checksum) {
      problems.push('the record carries no document checksum to compare against');
    } else if (record.report_checksum !== recomputed) {
      problems.push('the file on disk does not match the checksum on the record');
    }
  }
  if (flags.expectHash && record.data_hash && flags.expectHash !== record.data_hash) {
    problems.push('the expected data hash does not match the record');
  }

  const ok = found && problems.length === 0;

  if (flags.json) {
    jsonOut({
      verification_id: verificationId,
      found,
      ok,
      problems,
      record,
      local: flags.file ? { file: flags.file, sha256: recomputed } : null,
    });
    return ok ? EXIT.ok : EXIT.unverified;
  }

  if (response.status === 503) {
    writeError(
      'the verification service is temporarily unavailable - this is not a statement about the record'
    );
    return EXIT.unverified;
  }

  heading(ok ? 'verification record found' : 'verification did not hold');
  if (found) {
    kv([
      ['verification id', verificationId],
      ['incident', record.incident_id],
      ['dependency', record.dependency_id],
      ['window', `${time(record.time_window?.start)} → ${time(record.time_window?.end)}`],
      ['data hash', record.data_hash],
      ['document checksum', record.report_checksum],
      ['methodology', record.methodology_version],
      [
        'signed',
        record.authenticity?.signed
          ? `yes (${record.authenticity.algorithm})`
          : 'no — this deployment issues unsigned artifacts and the document says so',
      ],
      ['public keys', record.authenticity?.public_keys],
      [
        'retention',
        record.retention?.expired === true
          ? `expired ${time(record.retention.expires_at)}`
          : record.retention?.expires_at
            ? `until ${time(record.retention.expires_at)}`
            : 'not recorded',
      ],
      ['renderer', record.rendering?.renderer ?? null],
    ]);
  }
  if (recomputed) {
    heading('local file');
    kv([
      ['file', flags.file],
      ['sha-256', recomputed],
      ['matches record', record.report_checksum === recomputed ? 'yes' : 'no'],
    ]);
  }
  if (problems.length) {
    writeError('');
    for (const problem of problems) writeError(`  ${problem}`);
  }
  write('');
  write('The record proves what the payload must hash to. It does not restate the incident.');
  return ok ? EXIT.ok : EXIT.unverified;
}

/* ── keys ───────────────────────────────────────────────────────────────── */

export async function keys({ args, flags, client }) {
  const [sub, ...rest] = args;

  if (sub === 'list' || sub === undefined) {
    const { data } = await client.get('/v1/api-keys');
    const items = listOf(data);
    if (flags.json) {
      jsonOut(items);
      return EXIT.ok;
    }
    table(
      items,
      [
        { header: 'name', value: (k) => k.name },
        { header: 'id', value: (k) => k.id, max: 8 },
        { header: 'prefix', value: (k) => k.prefix },
        { header: 'scopes', value: (k) => (k.scopes ?? []).join(','), max: 44 },
        { header: 'last used', value: (k) => time(k.last_used_at) },
        { header: 'expires', value: (k) => time(k.expires_at) },
      ],
      { empty: 'no API keys — `reliastra keys create ci-deploy`' }
    );
    hint(
      items.length
        ? 'a key is shown once at creation and can be revoked without touching your session.'
        : '',
      flags
    );
    return EXIT.ok;
  }

  if (sub === 'create') {
    const name = rest[0] ?? flags.name;
    if (!name) {
      writeError('a key name is required');
      write('usage: reliastra keys create <name> [--scopes read:checks,read:incidents]');
      return EXIT.usage;
    }
    const body = { name };
    if (flags.scopes) body.scopes = String(flags.scopes).split(',').map((s) => s.trim());
    const { data } = await client.post('/v1/api-keys', body);
    if (flags.json) {
      jsonOut(data);
      return EXIT.ok;
    }
    kv([
      ['name', data.name],
      ['scopes', (data.scopes ?? []).join(', ')],
      ['key', data.full_key],
    ]);
    write('\nthis is the only time the key is shown. Store it as a secret, not in a shell profile.');
    write(`use it with: RELIASTRA_TOKEN=${data.full_key} reliastra deps list`);
    return EXIT.ok;
  }

  if (sub === 'rm' || sub === 'remove' || sub === 'revoke') {
    const id = rest[0] ?? flags.name;
    if (!id) {
      writeError('key id required');
      write('usage: reliastra keys rm <key-id> [--yes]   (`reliastra keys list` shows the ids)');
      return EXIT.usage;
    }
    const refusal = await guardDestructive({ flags, what: `API key ${id}` });
    if (refusal !== null) return refusal;

    await client.remove(`/v1/api-keys/${encodeURIComponent(id)}`);
    if (flags.json) {
      jsonOut({ revoked: id });
      return EXIT.ok;
    }
    write(`revoked ${id}`);
    write('any process using this key stops authenticating immediately.');
    return EXIT.ok;
  }

  writeError(`unknown subcommand: keys ${sub}`);
  write('  keys list | keys create <name> | keys rm <id>');
  writeError('run `reliastra keys --help` for the full form.');
  return EXIT.usage;
}

/* ── obs ────────────────────────────────────────────────────────────────── */

/** The public observatory. No credential is read or sent for these calls. */
export async function obs({ args, flags, client, session, webUrls }) {
  const [sub, ...rest] = args;

  if (sub === 'list' || sub === undefined) {
    // The JSON catalogue. `/v1/feed/vendors` is the Atom/RSS feed of the same
    // data, and a CLI that parsed XML for a table would be a worse CLI.
    const { data } = await client.get('/v1/vendors', {
      query: { limit: flags.limit ?? 100 },
    });
    const items = listOf(data);
    if (flags.json) {
      jsonOut(items);
      return EXIT.ok;
    }
    table(
      items,
      [
        { header: 'vendor', value: (v) => v.vendor_name },
        { header: 'category', value: (v) => v.category },
        { header: 'recent', value: (v) => v.recent_status },
        {
          header: 'latency',
          value: (v) =>
            v.latency_ms === null || v.latency_ms === undefined
              ? null
              : `${Math.round(v.latency_ms)} ms`,
        },
        { header: 'last observed', value: (v) => time(v.last_check_at) },
      ],
      { empty: 'the public index is empty — no vendor records are published right now' }
    );
    write(
      '\nRecent status is derived from the five most recent observations and is a statement about this probe, not vendor-wide health.'
    );
    return EXIT.ok;
  }

  if (sub === 'show') {
    const vendor = rest[0] ?? flags.vendor;
    if (!vendor) {
      writeError('vendor name required');
      write('usage: reliastra obs show <vendor-name> [--web]');
      return EXIT.usage;
    }
    const { data } = await client.get(`/v1/vendors/${encodeURIComponent(vendor)}`);
    if (flags.json) {
      jsonOut(data);
      return EXIT.ok;
    }
    kv([
      ['vendor', data.vendor_name ?? vendor],
      ['display name', data.display_name],
      ['category', data.category],
      ['endpoints', (data.endpoints ?? []).length],
      ['recent status', data.recent_status],
      ['last observed', time(data.last_check_at)],
    ]);
    if (Array.isArray(data.endpoints) && data.endpoints.length) {
      heading('endpoints');
      table(data.endpoints, [
        { header: 'url', value: (e) => e.endpoint_url, max: 56 },
        { header: 'health', value: (e) => e.health_status },
        { header: 'last observed', value: (e) => time(e.last_check_at) },
      ]);
    }
    if (flags.web || !flags.quiet) {
      write(`\npage     ${webUrls(session.siteUrl).vendor(data.vendor_name ?? vendor)}`);
    }
    return EXIT.ok;
  }

  writeError(`unknown subcommand: obs ${sub}`);
  write('  obs list | obs show <vendor>');
  writeError('run `reliastra obs --help` for the full form.');
  return EXIT.usage;
}
