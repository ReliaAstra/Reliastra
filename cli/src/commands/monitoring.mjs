/**
 * Dependencies, observations and incidents.
 *
 * These three commands are the shape of the product: what is being probed,
 * what each probe recorded, and what the detector concluded from a run of
 * probes. The output never merges those three into a single "health" number,
 * because they answer different questions and a reader needs to see which one
 * they are looking at.
 */

import { EXIT } from '../../bin/reliastra.mjs';
import { jsonOut, kv, table, write, heading } from '../output.mjs';

const time = (iso) => (iso ? String(iso).replace('T', ' ').replace(/\..*$/, 'Z') : null);
const ms = (value) => (value === null || value === undefined ? null : `${Math.round(value)} ms`);
const yesNo = (value) => (value === true ? 'yes' : value === false ? 'no' : null);

/** Seconds as a compact duration: 60 → 1m, 300 → 5m, 86400 → 24h. */
function interval(seconds) {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

/* ── deps ───────────────────────────────────────────────────────────────── */

async function listDeps({ flags, client }) {
  const { data } = await client.get('/v1/dependencies', {
    query: { limit: flags.limit ?? 100 },
  });
  const items = data?.items ?? data ?? [];

  if (flags.json) {
    jsonOut(items);
    return EXIT.ok;
  }
  table(items, [
    { header: 'id', value: (d) => d.id, max: 8 },
    { header: 'name', value: (d) => d.name, max: 28 },
    { header: 'endpoint', value: (d) => d.endpoint_url, max: 52 },
    { header: 'every', value: (d) => interval(d.check_interval_seconds) },
    { header: 'active', value: (d) => yesNo(d.is_active) },
    { header: 'last check', value: (d) => time(d.last_check_at) },
  ], { empty: 'no dependencies are being probed yet — `reliastra deps add "Name" https://…`' });
  return EXIT.ok;
}

async function addDep({ args, flags, client }) {
  const [name, endpointUrl] = args;
  if (!name || !endpointUrl) {
    write('usage: reliaastra deps add <name> <url> [--interval 300] [--expect 200,204] [--method GET]');
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
  write('\nfirst observations appear on the next scheduled check.');
  return EXIT.ok;
}

async function removeDep({ args, flags, client }) {
  const [id] = args;
  if (!id) {
    write('usage: reliaastra deps rm <dependency-id>');
    return EXIT.usage;
  }
  await client.remove(`/v1/dependencies/${encodeURIComponent(id)}`);
  if (flags.json) {
    jsonOut({ deleted: id });
    return EXIT.ok;
  }
  write(`removed ${id}`);
  return EXIT.ok;
}

export async function deps(context) {
  const [sub, ...rest] = context.args;
  if (sub === 'list' || sub === undefined) return listDeps(context);
  if (sub === 'add') return addDep({ ...context, args: rest });
  if (sub === 'rm' || sub === 'remove') return removeDep({ ...context, args: rest });
  context.write(`unknown subcommand: deps ${sub}\n  deps list | deps add <name> <url> | deps rm <id>`);
  return EXIT.usage;
}

/* ── checks ─────────────────────────────────────────────────────────────── */

export async function checks({ args, flags, client }) {
  const [sub] = args;
  if (sub !== undefined && sub !== 'recent') {
    write(`unknown subcommand: checks ${sub}\n  checks recent [--limit 50]`);
    return EXIT.usage;
  }
  const { data } = await client.get('/v1/checks/recent', { query: { limit: flags.limit ?? 50 } });
  const items = Array.isArray(data) ? data : (data?.items ?? []);

  if (flags.json) {
    jsonOut(items);
    return EXIT.ok;
  }
  table(items, [
    { header: 'executed (utc)', value: (c) => time(c.executed_at) },
    { header: 'result', value: (c) => (c.is_up ? 'up' : 'failed') },
    { header: 'status', value: (c) => c.status_code },
    { header: 'latency', value: (c) => ms(c.latency_ms) },
    { header: 'detail', value: (c) => c.error_message, max: 40 },
    { header: 'dep', value: (c) => c.dependency_id, max: 8 },
  ], { empty: 'no observations recorded yet' });
  if (!flags.quiet) {
    heading(`${items.length} observation${items.length === 1 ? '' : 's'} · newest first · region label "${items[0]?.region ?? '—'}"`);
    write('A failed observation is a fact about one probe. An incident is opened by the detector, not by this list.');
  }
  return EXIT.ok;
}

/* ── incidents ──────────────────────────────────────────────────────────── */

async function listIncidents({ flags, client }) {
  const { data } = await client.get('/v1/incidents', {
    query: { limit: flags.limit ?? 25, status: flags.status },
  });
  const items = data?.items ?? data ?? [];

  if (flags.json) {
    jsonOut(items);
    return EXIT.ok;
  }
  table(items, [
    { header: 'id', value: (i) => i.id, max: 8 },
    { header: 'started (utc)', value: (i) => time(i.started_at) },
    { header: 'resolved', value: (i) => time(i.resolved_at) },
    { header: 'severity', value: (i) => i.severity },
    { header: 'status', value: (i) => i.status },
    { header: 'root cause', value: (i) => i.root_cause },
  ], { empty: 'no incidents recorded — which is a result, not a missing page' });
  return EXIT.ok;
}

async function showIncident({ args, flags, client }) {
  const [id] = args;
  if (!id) {
    write('usage: reliaastra incidents show <incident-id>');
    return EXIT.usage;
  }
  const { data } = await client.get(`/v1/incidents/${encodeURIComponent(id)}`);
  if (flags.json) {
    jsonOut(data);
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
  }

  write('');
  write('The detection rule that fired and the attribution verdict are recorded inside the');
  write('evidence artifact for this incident — `reliastra evidence show <report-id>`.');
  return EXIT.ok;
}

async function correlateIncident({ args, flags, client }) {
  const [id] = args;
  if (!id) {
    write('usage: reliaastra incidents correlate <incident-id>');
    return EXIT.usage;
  }
  const { data } = await client.post(`/v1/incidents/${encodeURIComponent(id)}/correlate`, {});
  if (flags.json) {
    jsonOut(data);
    return EXIT.ok;
  }
  const results = Array.isArray(data) ? data : (data?.correlations ?? [data]);
  table(results, [
    { header: 'dependency', value: (r) => r.dependency_name ?? r.dependency_id },
    { header: 'classification', value: (r) => r.classification },
    { header: 'confidence', value: (r) => r.confidence_score },
  ], { empty: 'no dependency degradation overlapped this incident window' });
  return EXIT.ok;
}

export async function incidents(context) {
  const [sub, ...rest] = context.args;
  if (sub === 'list' || sub === undefined) return listIncidents(context);
  if (sub === 'show') return showIncident({ ...context, args: rest });
  if (sub === 'correlate') return correlateIncident({ ...context, args: rest });
  context.write(`unknown subcommand: incidents ${sub}\n  incidents list | incidents show <id> | incidents correlate <id>`);
  return EXIT.usage;
}
