/**
 * Dependencies, observations and incidents.
 *
 * These commands are the shape of the product: what is being probed, what each
 * probe recorded, and what the detector concluded from a run of probes. The
 * output never merges those three into a single "health" number, because they
 * answer different questions and a reader needs to see which one they are
 * looking at.
 *
 * Every command that identifies an object prints how to reach that object in
 * the web console - `--web` on the list commands, and a closing line on the
 * detail commands. The terminal is the fast path; the console is where the
 * window is charted and the artifact is readable, and the CLI should not
 * pretend otherwise.
 */

import { EXIT } from '../../bin/reliastra.mjs';
import { jsonOut, kv, table, write, writeError, heading, hint } from '../output.mjs';
import { guardDestructive } from '../prompt.mjs';

const time = (iso) => (iso ? String(iso).replace('T', ' ').replace(/\..*$/, 'Z') : null);
const ms = (value) => (value === null || value === undefined ? null : `${Math.round(value)} ms`);
const yesNo = (value) => (value === true ? 'yes' : value === false ? 'no' : null);
const listOf = (data) => (Array.isArray(data) ? data : (data?.items ?? data?.data ?? []));

/** Seconds as a compact duration: 60 → 1m, 300 → 5m, 86400 → 24h. */
function interval(seconds) {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

/* ── deps ───────────────────────────────────────────────────────────────── */

async function listDeps({ flags, client, session, webUrls }) {
  const { data } = await client.get('/v1/dependencies', {
    query: { limit: flags.limit ?? 100 },
  });
  const items = listOf(data);

  if (flags.json) {
    jsonOut(items);
    return EXIT.ok;
  }
  const columns = [
    { header: 'id', value: (d) => d.id, max: 8 },
    { header: 'name', value: (d) => d.name, max: 28 },
    { header: 'endpoint', value: (d) => d.endpoint_url, max: 52 },
    { header: 'every', value: (d) => interval(d.check_interval_seconds) },
    { header: 'active', value: (d) => yesNo(d.is_active) },
    { header: 'last check', value: (d) => time(d.last_check_at) },
  ];
  if (flags.web) {
    columns.push({ header: 'web', value: (d) => webUrls(session.siteUrl).dependency(d.id), max: 60 });
  }
  table(items, columns, {
    empty: 'no dependencies are being probed yet — `reliastra deps add "Name" https://…`',
  });
  hint(
    items.length
      ? '`reliastra deps show <id>` for one dependency; `reliastra open dependencies <id> --browser` for the console view.'
      : '',
    flags
  );
  return EXIT.ok;
}

/**
 * One dependency, with its recent observations and its incidents.
 *
 * Three requests, issued together: the configuration, the observations, and any
 * incidents the detector opened for it. They are independent reads, and running
 * the dependency on the incidents endpoint (rather than pulling the account's
 * whole incident history) is exactly what that filter is for.
 */
async function showDep({ args, flags, client, session, webUrls }) {
  const [id] = args;
  if (!id) {
    writeError('dependency id required');
    write('usage: reliastra deps show <dependency-id> [--observations 10] [--web]');
    return EXIT.usage;
  }
  const path = `/v1/dependencies/${encodeURIComponent(id)}`;
  const [{ data: dep }, observations, incidents] = await Promise.all([
    client.get(path),
    client
      .get(`${path}/results`, { query: { limit: flags.observations ?? 10 } })
      .then((r) => listOf(r.data))
      .catch(() => null),
    client
      .get('/v1/incidents', { query: { dependency_id: id, limit: 5 } })
      .then((r) => listOf(r.data))
      .catch(() => null),
  ]);

  if (flags.json) {
    jsonOut({ dependency: dep, observations, incidents });
    return EXIT.ok;
  }

  kv([
    ['dependency', dep.id],
    ['name', dep.name],
    ['endpoint', `${dep.method ?? 'GET'} ${dep.endpoint_url}`],
    ['expects', (dep.expected_status_codes ?? []).join(', ') || null],
    ['interval', interval(dep.check_interval_seconds)],
    ['timeout', dep.timeout_seconds ? `${dep.timeout_seconds}s` : null],
    ['next check', time(dep.next_check_at)],
    ['active', yesNo(dep.is_active)],
    ['region label', (dep.regions ?? []).join(', ') || null],
  ]);

  if (observations) {
    heading(`last ${observations.length} observations`);
    table(
      observations,
      [
        { header: 'executed (utc)', value: (c) => time(c.executed_at) },
        { header: 'result', value: (c) => (c.is_up ? 'up' : 'failed') },
        { header: 'status', value: (c) => c.status_code },
        { header: 'latency', value: (c) => ms(c.latency_ms) },
        { header: 'detail', value: (c) => c.error_message, max: 40 },
      ],
      { empty: 'no observations recorded yet' }
    );
  } else {
    heading('observations unavailable');
    write('the observation list could not be read; the dependency itself is above.');
  }

  if (incidents) {
    heading(`incidents for this dependency (${incidents.length})`);
    table(
      incidents,
      [
        { header: 'id', value: (i) => i.id, max: 8 },
        { header: 'started (utc)', value: (i) => time(i.started_at) },
        { header: 'resolved', value: (i) => time(i.resolved_at) },
        { header: 'severity', value: (i) => i.severity },
        { header: 'status', value: (i) => i.status },
      ],
      { empty: 'none — no incident has been opened for this dependency' }
    );
  }

  write(`\nconsole  ${webUrls(session.siteUrl).dependency(dep.id)}`);
  return EXIT.ok;
}

async function addDep({ args, flags, client }) {
  const [name, endpointUrl] = args;
  if (!name || !endpointUrl) {
    writeError('a name and a URL are both required');
    write('usage: reliastra deps add <name> <url> [--interval 300] [--expect 200,204] [--method GET]');
    return EXIT.usage;
  }
  const body = {
    name,
    endpoint_url: endpointUrl,
    method: flags.method ?? 'GET',
    check_interval_seconds: flags.interval ? Number(flags.interval) : undefined,
    expected_status_codes: flags.expect
      ? String(flags.expect).split(',').map((s) => Number(s.trim()))
      : undefined,
    timeout_seconds: flags.timeout ? Number(flags.timeout) : undefined,
    // One observation point is deployed; the scheduler label is not a choice
    // the operator makes, so the CLI does not expose it as one.
    regions: [flags.region ?? 'us-east'],
  };
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];

  const { data } = await client.post('/v1/dependencies', body);
  if (flags.json) {
    jsonOut(data);
    return EXIT.ok;
  }
  kv([
    ['id', data.id],
    ['name', data.name],
    ['endpoint', data.endpoint_url],
    ['interval', interval(data.check_interval_seconds)],
    ['next check', time(data.next_check_at)],
  ]);
  hint(
    `first observations appear on the next scheduled check.\nwatch them with \`reliastra checks recent\`; \`reliastra deps show ${data.id}\` has the configuration.`,
    flags
  );
  return EXIT.ok;
}

async function removeDep({ args, flags, client }) {
  const [id] = args;
  if (!id) {
    writeError('dependency id required');
    write('usage: reliastra deps rm <dependency-id> [--yes]');
    return EXIT.usage;
  }
  const refusal = await guardDestructive({ flags, what: `dependency ${id}` });
  if (refusal !== null) return refusal;

  await client.remove(`/v1/dependencies/${encodeURIComponent(id)}`);
  if (flags.json) {
    jsonOut({ deleted: id });
    return EXIT.ok;
  }
  write(`removed ${id}`);
  write('observations already recorded are kept; only future probes stop.');
  return EXIT.ok;
}

export async function deps(context) {
  const [sub, ...rest] = context.args;
  if (sub === 'list' || sub === undefined) return listDeps(context);
  if (sub === 'show') return showDep({ ...context, args: rest });
  if (sub === 'add') return addDep({ ...context, args: rest });
  if (sub === 'rm' || sub === 'remove') return removeDep({ ...context, args: rest });
  context.writeError(`unknown subcommand: deps ${sub}`);
  context.write('  deps list | deps show <id> | deps add <name> <url> | deps rm <id>');
  context.writeError(`run \`reliastra deps --help\` for the full form.`);
  return EXIT.usage;
}

/* ── checks ─────────────────────────────────────────────────────────────── */

export async function checks({ args, flags, client }) {
  const [sub] = args;
  if (sub !== undefined && sub !== 'recent') {
    writeError(`unknown subcommand: checks ${sub}`);
    write('  checks recent [--limit 50] [--dependency <id>]');
    writeError('run `reliastra checks --help` for the full form.');
    return EXIT.usage;
  }

  // `/v1/checks/recent` is org-wide; scoping to one dependency uses the
  // dependency's own results endpoint, which is the same data by the route
  // that owns it rather than a client-side filter.
  const { data } = flags.dependency
    ? await client.get(`/v1/dependencies/${encodeURIComponent(flags.dependency)}/results`, {
        query: { limit: flags.limit ?? 50 },
      })
    : await client.get('/v1/checks/recent', { query: { limit: flags.limit ?? 50 } });
  const items = listOf(data);

  if (flags.json) {
    jsonOut(items);
    return EXIT.ok;
  }
  table(
    items,
    [
      { header: 'executed (utc)', value: (c) => time(c.executed_at) },
      { header: 'result', value: (c) => (c.is_up ? 'up' : 'failed') },
      { header: 'status', value: (c) => c.status_code },
      { header: 'latency', value: (c) => ms(c.latency_ms) },
      { header: 'detail', value: (c) => c.error_message, max: 40 },
      { header: 'dep', value: (c) => c.dependency_id, max: 8 },
    ],
    { empty: 'no observations recorded yet' }
  );
  if (!flags.quiet) {
    const scope = flags.dependency ? ` for dependency ${flags.dependency}` : '';
    heading(
      `${items.length} observation${items.length === 1 ? '' : 's'}${scope} · newest first · region label "${items[0]?.region ?? '—'}"`
    );
    write(
      'A failed observation is a fact about one probe. An incident is opened by the detector, not by this list.'
    );
  }
  return EXIT.ok;
}

/* ── incidents ──────────────────────────────────────────────────────────── */

async function listIncidents({ flags, client, session, webUrls }) {
  const { data } = await client.get('/v1/incidents', {
    query: {
      limit: flags.limit ?? 25,
      status: flags.status,
      dependency_id: flags.dependency,
    },
  });
  const items = listOf(data);

  if (flags.json) {
    jsonOut(items);
    return EXIT.ok;
  }
  const columns = [
    { header: 'id', value: (i) => i.id, max: 8 },
    { header: 'started (utc)', value: (i) => time(i.started_at) },
    { header: 'resolved', value: (i) => time(i.resolved_at) },
    { header: 'severity', value: (i) => i.severity },
    { header: 'status', value: (i) => i.status },
    { header: 'root cause', value: (i) => i.root_cause },
  ];
  if (flags.web) {
    columns.push({ header: 'web', value: (i) => webUrls(session.siteUrl).incident(i.id), max: 60 });
  }
  table(items, columns, {
    empty: 'no incidents recorded — which is a result, not a missing page',
  });
  hint(
    items.length
      ? '`reliastra incidents show <id>` for the window and correlations; `--web` prints the console URLs.'
      : '',
    flags
  );
  return EXIT.ok;
}

async function showIncident({ args, flags, client, session, webUrls }) {
  const [id] = args;
  if (!id) {
    writeError('incident id required');
    write('usage: reliastra incidents show <incident-id> [--evidence] [--web]');
    return EXIT.usage;
  }
  const { data } = await client.get(`/v1/incidents/${encodeURIComponent(id)}`);

  // `--evidence` follows the link the record carries rather than making the
  // operator copy an id between two commands: dependency → incident → evidence
  // → verification is one path, and each step should hand over the next.
  let evidence = null;
  if (flags.evidence && data.evidence_report_id) {
    const result = await client
      .get(`/v1/evidence/${encodeURIComponent(data.evidence_report_id)}`)
      .catch((error) => ({ error }));
    if (result.error) {
      writeError(
        `the evidence record ${data.evidence_report_id} could not be read: ${result.error.message}`
      );
    } else {
      evidence = result.data;
    }
  }

  if (flags.json) {
    jsonOut({ incident: data, evidence });
    return EXIT.ok;
  }

  kv([
    ['incident', data.id],
    ['dependency', data.dependency_id],
    ['window', `${time(data.started_at)} → ${time(data.resolved_at) ?? 'open'}`],
    ['severity / status', `${data.severity} / ${data.status}`],
    ['root cause', data.root_cause],
    ['description', data.description],
    ['evidence record', data.evidence_report_id],
    ['evidence status', data.evidence_status],
  ]);

  const correlations = Array.isArray(data.correlations) ? data.correlations : [];
  if (correlations.length) {
    heading('correlated dependencies');
    table(correlations, [
      { header: 'dependency', value: (c) => c.correlated_dependency_id, max: 12 },
      { header: 'method', value: (c) => c.correlation_method },
      { header: 'confidence', value: (c) => c.correlation_confidence },
      { header: 'window', value: (c) => `${c.time_window_seconds}s` },
    ]);
    write('  alignment between two timelines, not a statement of cause.');
  }

  if (evidence) {
    heading('evidence record');
    kv([
      ['report', evidence.id],
      ['generated', time(evidence.generated_at)],
      ['expires', time(evidence.expires_at)],
      ['sha-256 (document)', evidence.checksum],
      ['sha-256 (payload)', evidence.data_hash],
      ['methodology', evidence.methodology_version],
      ['signed', evidence.signed ? `yes (${evidence.signature_alg})` : 'no — this deployment issues unsigned artifacts'],
    ]);
    if (evidence.verification_url) write(`\nverify   ${evidence.verification_url}`);
  }

  write(`\nconsole  ${webUrls(session.siteUrl).incident(data.id)}`);
  if (!evidence && data.evidence_report_id) {
    hint(
      `the detection rule and attribution verdict are inside the evidence record:\n  reliastra evidence show ${data.evidence_report_id}`,
      flags
    );
  } else if (!data.evidence_report_id) {
    hint(
      'no evidence record is attached; one is issued when the incident resolves.',
      flags
    );
  }
  return EXIT.ok;
}

async function correlateIncident({ args, flags, client }) {
  const [id] = args;
  if (!id) {
    writeError('incident id required');
    write('usage: reliastra incidents correlate <incident-id>');
    return EXIT.usage;
  }
  const { data } = await client.post(`/v1/incidents/${encodeURIComponent(id)}/correlate`, {});
  if (flags.json) {
    jsonOut(data);
    return EXIT.ok;
  }
  const results = Array.isArray(data) ? data : (data?.correlations ?? [data]);
  table(
    results,
    [
      { header: 'dependency', value: (r) => r.dependency_name ?? r.dependency_id },
      { header: 'classification', value: (r) => r.classification },
      { header: 'confidence', value: (r) => r.confidence_score },
    ],
    { empty: 'no dependency degradation overlapped this incident window' }
  );
  write(
    '\nScores come from five weighted signals with a published methodology version.\nAn overlap is an alignment between two timelines — it is not a statement of cause.'
  );
  return EXIT.ok;
}

export async function incidents(context) {
  const [sub, ...rest] = context.args;
  if (sub === 'list' || sub === undefined) return listIncidents(context);
  if (sub === 'show') return showIncident({ ...context, args: rest });
  if (sub === 'correlate') return correlateIncident({ ...context, args: rest });
  context.writeError(`unknown subcommand: incidents ${sub}`);
  context.write('  incidents list | incidents show <id> | incidents correlate <id>');
  context.writeError(`run \`reliastra incidents --help\` for the full form.`);
  return EXIT.usage;
}
