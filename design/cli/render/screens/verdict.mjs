// Verdict screens: the incident dossier and the two verify outcomes.
import { Screen, section, meter, hint, padPlain } from '../screen.mjs';

const G = { tick: '✓', cross: '×', warn: '!', dot: '·', caret: '›', arrow: '→', rail: '│', rule: '─' };

const KV = (key, keyWidth) => `  {k:${padPlain(key, keyWidth)}}`;

/* ── 06 · reliastra incidents show 9f1c8b0e ────────────────────────────── */
export function incidentScreen(theme = 'dark') {
  const C = 132;
  const s = new Screen({ cols: C, theme });
  s.title = 'reliastra incidents show 9f1c8b0e';
  s.prompt('incidents show 9f1c8b0e');
  s.blank();
  s.add(section('incident 9f1c8b0e', 'open · severity major', C));
  s.add(`  {X:${G.cross} CONFIRMED DOWN}  {d:Stripe Payments API failed 6 consecutive probes.}`);
  s.blank();
  const kw = 14;
  s.add(`${KV('window', kw)} {v:2026-10-06 17:12:00Z} {t:→} {v:2026-10-06 17:41:00Z} {t:(29 m)}`);
  s.add(`${KV('dependency', kw)} {v:dep-4c1f9e2a} {t:·} {v:Payments API}`);
  s.add(`${KV('endpoint', kw)} {m:https://api.stripe.com/v1/health}`);
  s.add(`${KV('detector', kw)} {d:consecutive_failures} {t:≥} {d:3 of 3} {t:·} {p:methodology v2.0}`);
  s.add(`${KV('observations', kw)} {x:6 failed} {t:·} {d:0 up in window}`);
  s.add(`${KV('evidence', kw)} {v:7c1d0a5f} {t:·} {d:reliastra evidence show 7c1d0a5f}`);
  s.blank();
  s.add(section('observations in window', '6 probes · 1 point', C));
  s.add(`  {t:17:12} {f:─}{x:×}{f:──}{x:×}{f:──}{x:×}{f:──}{x:×}{f:──}{x:×}{f:──}{x:×}{f:─} {t:17:41}  {d:six probes, six failures, none up}`);
  s.blank();
  const obs = [
    ['17:12:04', '503', '4180 ms', 'gateway: upstream connect error or disconnect'],
    ['17:17:04', '503', '4210 ms', 'gateway: upstream connect error or disconnect'],
    ['17:22:05', '503', '4195 ms', 'gateway: upstream connect error or disconnect'],
    ['17:27:04', '503', '4240 ms', 'gateway: upstream connect error or disconnect'],
    ['17:32:04', '503', '4180 ms', 'gateway: upstream connect error or disconnect'],
    ['17:37:05', '503', '4266 ms', 'gateway: upstream connect error or disconnect'],
  ];
  obs.forEach(([t, code, ms, detail]) => {
    s.add(`  {d:${t}}  {x:${G.cross}} {x:${code}} {x:${padPlain(ms, 9, 'right')}}  {d:${detail}}`);
  });
  s.blank();
  s.add(section('attribution', 'weighted score · not proof of cause', C));
  s.add(`  {v:vendor_failure}      {n:0.82}  ${meter(0.82, 20, 'b')}`);
  const signals = [
    ['overlap_window', 0.3, '1'],
    ['status_match', 0.2, '2'],
    ['latency_shape', 0.12, '4'],
    ['error_signature', 0.12, '3'],
    ['own_fault_ruled_out', 0.08, '5'],
  ];
  signals.forEach(([name, w, c]) => {
    s.add(`    {k:${padPlain(name, 19)}} {n:${w.toFixed(2)}}  ${meter(w / 0.82, 20, c)} {t:share of the score}`);
  });
  s.add(`  {f:${G.rail}} {p:methodology v2.0} {d:· five weighted signals · an overlap is an alignment of two timelines}`);
  s.blank();
  s.add(section('next', '', C));
  s.add(hint('reliastra incidents show 9f1c8b0e --evidence follows it to the record', 2));
  s.add(hint('reliastra incidents correlate dep-0a5b8f22 scores the overlapping degradation', 2));
  s.exitCode = 0;
  return s;
}

const RECORD_HASH = '0c72b41e9d5a44c1b8e07f3a6d29c4b81e5f7a20d3c6b948e1f0a5c7d2b84e63';
const FILE_HASH_OK = RECORD_HASH;
const FILE_HASH_BAD = '9d41c07b2e8f4a63d5c19b70e2a84f6c0d3b5e71a9c82f40b6d17e35c90a2f48';

/* ── 07 · reliastra verify — it holds ──────────────────────────────────── */
export function verifyPassScreen(theme = 'dark') {
  const C = 110;
  const s = new Screen({ cols: C, theme });
  s.title = 'reliastra verify 8Kd2xQ7mB4pL --file incident.pdf';
  s.prompt('verify 8Kd2xQ7mB4pL --file incident.pdf');
  s.blank();
  s.add(`  {U:${G.tick} VERIFIED}  {d:the document on disk is the document this record points at.}`);
  s.blank();
  const kw = 17;
  s.add(`${KV('verification id', kw)} {v:8Kd2xQ7mB4pL}`);
  s.add(`${KV('incident', kw)} {v:9f1c8b0e} {t:·} {v:dep-4c1f9e2a} {t:·} {v:Payments API}`);
  s.add(`${KV('window', kw)} {v:2026-09-04 09:12:00Z} {t:→} {v:2026-09-04 09:41:00Z}`);
  s.add(`${KV('methodology', kw)} {p:v2.0}`);
  s.add(`${KV('retention', kw)} {d:until 2027-09-04 09:12:00Z}`);
  s.blank();
  s.add(section('checks performed', '3 passed · 1 advisory', C));
  s.add(`  {U:${G.tick}} {v:record found}       {d:public record 8Kd2xQ7mB4pL exists and is readable}`);
  s.add(`  {U:${G.tick}} {v:data hash}          {d:payload hashes to the recorded value}`);
  s.add(`  {U:${G.tick}} {v:document checksum}  {d:incident.pdf matches report_checksum}`);
  s.add(`  {W:${G.warn}} {v:signature}          {w:unsigned artifact} {d:— the record says so, and so does the PDF footer}`);
  s.blank();
  s.add(section('local file', '', C));
  s.add(`${KV('file', kw)} {v:incident.pdf} {t:(412 KB)}`);
  s.add(`${KV('sha-256', kw)} {m:${RECORD_HASH}}`);
  s.add(`${KV('matches record', kw)} {u:yes}`);
  s.blank();
  s.add('  {d:The record proves what the payload must hash to. It does not restate the incident.}');
  s.add(`  {p:public page} {m:https://reliastra.com/verify/8Kd2xQ7mB4pL}`);
  s.exitCode = 0;
  return s;
}

/* ── 08 · reliastra verify — it does not hold ──────────────────────────── */
export function verifyFailScreen(theme = 'dark') {
  const C = 110;
  const s = new Screen({ cols: C, theme });
  s.title = 'reliastra verify 8Kd2xQ7mB4pL --file incident-edited.pdf';
  s.prompt('verify 8Kd2xQ7mB4pL --file incident-edited.pdf');
  s.blank();
  s.add(`  {X:${G.cross} MISMATCH}  {d:the file on disk is not the artifact this record was issued for.}`);
  s.blank();
  const kw = 17;
  s.add(`${KV('verification id', kw)} {v:8Kd2xQ7mB4pL}`);
  s.add(`${KV('record checksum', kw)} {m:${RECORD_HASH}}`);
  s.add(`${KV('file sha-256', kw)} {m:${FILE_HASH_BAD}}`);
  let firstDiff = 0;
  while (RECORD_HASH[firstDiff] === FILE_HASH_BAD[firstDiff]) firstDiff += 1;
  s.add(`${' '.repeat(2 + kw + 2 + firstDiff)}{x:^} {x:first difference at nibble ${firstDiff}}`);
  s.blank();
  s.add(section('checks performed', '2 passed · 1 failed · 1 advisory', C));
  s.add(`  {U:${G.tick}} {v:record found}       {d:public record 8Kd2xQ7mB4pL exists and is readable}`);
  s.add(`  {U:${G.tick}} {v:data hash}          {d:payload hashes to the recorded value}`);
  s.add(`  {X:${G.cross}} {v:document checksum}  {x:incident-edited.pdf does not match report_checksum}`);
  s.add(`  {W:${G.warn}} {v:signature}          {w:unsigned artifact} {d:— a signature would have failed here too}`);
  s.blank();
  s.add(`  {f:${G.rail}} {B:${G.arrow}} {d:re-fetch the artifact: reliastra evidence get 7c1d0a5f --out incident.pdf}`);
  s.add(`  {f:${G.rail}} {B:${G.arrow}} {d:if the file was edited deliberately, this record no longer describes}`);
  s.add(`  {f:${G.rail}} {d:  it. Say that out loud before you hand the document to anyone.}`);
  s.blank();
  s.add('  {t:exit 4 · a verification claim that did not hold}');
  s.exitCode = 4;
  return s;
}
