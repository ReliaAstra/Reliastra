// Failure taxonomy, the fidelity triptych, and the design-system sheet.
import { Screen, section, chip, meter, axis, hint, pad, padPlain, table, errorBlock, obsSpark, TOKENS, resolveStyle } from '../screen.mjs';

const G = { tick: '✓', cross: '×', warn: '!', dot: '·', caret: '›', arrow: '→', rail: '│', rule: '─' };

/* ── 10 · the error taxonomy ───────────────────────────────────────────── */
export function errorsScreen(theme = 'dark') {
  const C = 120;
  const s = new Screen({ cols: C, theme });
  s.title = 'reliastra · failure taxonomy';
  s.add(section('errors', 'every failure is classified · the exit code says which class', C));
  s.blank();
  s.prompt('incidents list --status open');
  s.addAll(errorBlock({
    kind: 'down',
    title: 'not permitted: missing scope read:incidents',
    detail: 'this credential is valid but not permitted to make this call.',
    fix: 'reliastra keys create ci-deploy --scopes read:incidents,read:checks',
    exit: 5,
    indent: 2,
  }));
  s.blank();
  s.prompt('deps list');
  s.addAll(errorBlock({
    kind: 'down',
    title: 'could not reach https://api.reliastra.com: connection refused',
    detail: 'the API could not be reached at all. Nothing was checked; nothing is claimed.',
    fix: 'check the connection, then reliastra doctor; a self-hosted API needs --api-url',
    exit: 6,
    indent: 2,
  }));
  s.blank();
  s.prompt('verify');
  s.addAll(errorBlock({
    kind: 'down',
    title: 'verification id required',
    detail: 'the id is printed in the artifact footer and encoded in its QR code.',
    fix: 'reliastra verify <verification-id> --file incident.pdf',
    exit: 1,
    indent: 2,
  }));
  s.blank();
  s.add(`  {f:${G.rail}} {d:No stack traces: a stack from this tool describes our code, not your problem.}`);
  s.exitCode = 5;
  return s;
}

/* ── 11 · fidelity triptych: one screen, three levels ──────────────────── */
function fidelityBase(theme) {
  const C = 100;
  const s = new Screen({ cols: C, theme });
  s.title = 'reliastra checks recent --limit 4';
  s.prompt('checks recent --limit 4');
  s.blank();
  s.add(section('observations', 'newest first', C));
  s.addAll(
    table(
      [
        { header: 'executed (utc)', width: 20 },
        { header: 'result', width: 10 },
        { header: 'status', width: 6 },
        { header: 'latency', width: 9, align: 'right' },
        { header: 'detail', width: 33, max: 33 },
      ],
      [
        { cells: ['{d:2026-10-06 18:41:12Z}', chip('DOWN', 'down'), '{x:503}', '{x:4180 ms}', '{d:gateway: upstream connect error}'] },
        { cells: ['{d:2026-10-06 18:41:12Z}', chip('UP', 'up'), '{d:200}', '{n:118 ms}', '{d:ok}'] },
        { cells: ['{d:2026-10-06 18:40:03Z}', chip('DEGRADED', 'degraded'), '{d:200}', '{w:1412 ms}', '{w:latency above the 1 s envelope}'] },
        { cells: ['{d:2026-10-06 18:36:12Z}', chip('UP', 'up'), '{d:200}', '{n:121 ms}', '{d:ok}'] },
      ],
      { indent: 0 }
    )
  );
  s.blank();
  s.add(`  {d:4 shown of 1,204} {t:·} {x:1 failed} {t:·} {p:us-east · 1 observation point}`);
  s.exitCode = 0;
  return s;
}

/** The plain fidelity level: same structure, no colour, no tint. This is what
 *  a CI log, a pipe and NO_COLOR get — and it is today's CLI. */
export function fidelityPlain(theme = 'dark') {
  const s = fidelityBase(theme);
  s.lines = s.lines.map((l) => l.replace(/\{([^:{}]):/g, '{ :'));
  s.title = 'reliastra checks recent --limit 4  ·  piped';
  return s;
}

export function fidelityFull(theme = 'dark') {
  return fidelityBase(theme);
}

/** The --json level: the API's own shape, keys alphabetical, no chrome. */
export function fidelityJson(theme = 'dark') {
  const C = 100;
  const s = new Screen({ cols: C, theme });
  s.title = 'reliastra checks recent --limit 2 --json';
  s.prompt('checks recent --limit 2 --json');
  const j = (depth, text) => `${'  '.repeat(depth)}${text}`;
  s.add('{f:[}');
  s.add('  {f:{}');
  s.add('    {v:"dependency_id"}{f::} {d:"dep-4c1f9e2a"}{f:,}');
  s.add('    {v:"error_message"}{f::} {d:"gateway: upstream connect error"}{f:,}');
  s.add('    {v:"executed_at"}{f::} {d:"2026-10-06T18:41:12Z"}{f:,}');
  s.add('    {v:"is_up"}{f::} {x:false}{f:,}');
  s.add('    {v:"latency_ms"}{f::} {n:4180}{f:,}');
  s.add('    {v:"status_code"}{f::} {n:503}');
  s.add('  {f:},}');
  s.add('  {f:{}');
  s.add('    {v:"dependency_id"}{f::} {d:"dep-9b21aa04"}{f:,}');
  s.add('    {v:"error_message"}{f::} {q:null}{f:,}');
  s.add('    {v:"executed_at"}{f::} {d:"2026-10-06T18:41:12Z"}{f:,}');
  s.add('    {v:"is_up"}{f::} {u:true}{f:,}');
  s.add('    {v:"latency_ms"}{f::} {n:118}{f:,}');
  s.add('    {v:"status_code"}{f::} {n:200}');
  s.add('  {f:}}');
  s.add('{f:]}');
  s.exitCode = 0;
  return s;
}

/* ── 12 · the design-system sheet ──────────────────────────────────────── */
export function designSheet(theme = 'dark') {
  const C = 150;
  const s = new Screen({ cols: C, theme });
  s.title = 'reliastra cli · terminal design system · v0.1.0';
  s.add(pad('{H:RELIASTRA} {t:cli design system v0.1.0}', C - 46) + '{t:terminal surface · proposal}');
  s.add('{d:Restraint over decoration. One accent for identity, four semantic inks for verdicts, one}');
  s.add('{d:reserved ink for provenance, and a neutral ramp for everything else. Nothing is painted}');
  s.add('{d:inside this surface that a real terminal cannot print.}');
  s.blank();

  s.add(section('roles', 'a role is never a colour name in code', C));
  const roleRows = [
    ['brand', 'b'], ['brand.bright', 'B'],
    ['verdict.up', 'u'], ['verdict.degraded', 'w'], ['verdict.down', 'x'], ['verdict.unknown', 'q'],
    ['provenance', 'p'],
    ['text.primary', ' '], ['text.secondary', 'd'], ['text.tertiary', 't'], ['text.faint', 'f'],
  ];
  for (const [name, code] of roleRows) {
    const r = TOKENS.roles[name];
    s.add(
      `  {${code}:${'█'.repeat(6)}}  {v:${padPlain(name, 16)}} {t:${padPlain(r[theme], 9)}} {t:${padPlain('256:' + String(r.ansi256 ?? '—'), 8)}} {t:${padPlain('16:' + String(r.ansi16 ?? '—'), 14)}} {d:${r.comment.slice(0, 88)}}`
    );
  }
  s.blank();

  s.add(section('type', 'ibm plex mono · 400 / 500 / 600', C));
  s.add('  {t:display   } {H:RELIASTRA} {d:the wordmark only, upper, tracked}');
  s.add('  {t:section   } {h:OBSERVATIONS IN WINDOW} {d:ruled headings, upper}');
  s.add('  {t:key       } {k:document checksum} {d:left column of a kv block}');
  s.add('  {t:value     } {v:7c1d0a5f} {d:right column, medium}');
  s.add('  {t:verdict   } {V:CONFIRMED DOWN} {d:the words a pipeline branches on}');
  s.add('  {t:numeric   } {n:4180 ms} {d:right-aligned, always with its unit}');
  s.add('  {t:mono_raw  } {m:0c72b41e9d5a44c1} {d:ids, hashes, urls — wrapped, never elided}');
  s.blank();

  s.add(section('glyphs', 'twelve marks, no dingbats', C));
  s.add('  {v:✓} {t:tick}   {v:×} {t:cross}   {v:!} {t:warn}   {v:·} {t:dot}   {v:›} {t:caret}   {v:→} {t:arrow}   {v:│} {t:rail}   {v:─} {t:rule}   {v:█} {t:meter}   {v:▁▂▄▅▆} {t:spark}   {v:—} {t:missing}   {v:…} {t:elide}');
  s.add('  {d:ascii tier:} {v:+} {v:x} {v:!} {v:.} {v:>} {v:->} {v:-} {v:_-=#} {t:when the terminal is not UTF-8}');
  s.blank();

  s.add(section('components', '', C));
  s.add(`  chips    ${chip('UP', 'up')}  ${chip('DOWN', 'down')}  ${chip('DEGRADED', 'degraded')}  ${chip('NO DATA', 'unknown')}  {S:RELIASTRA}  {P:V2.0}`);
  s.add(`  meter    ${meter(0.82, 24, 'b')} {n:0.82} {t:vendor_failure · methodology v2.0}`);
  s.add(`  axis     ${axis(0.34, 24, 'b')} {d:one marker at the value, for dense table rows}`);
  s.add(`  spark    ${obsSpark([{ up: true, ms: 200 }, { up: true, ms: 210 }, { up: true, ms: 195 }, { up: true, ms: 940 }, { up: false, ms: 4180 }, { up: false, ms: 4210 }, { up: false, ms: 4195 }, { up: true, ms: 205 }, { up: true, ms: 212 }, { up: true, ms: 199 }, { up: true, ms: 208 }, { up: true, ms: 203 }], 24)} {d:neutral ink · failures in red}`);
  s.add(`  sweep    {B:█·····} {B:·█····} {B:··█···} {B:···█··} {B:····█·} {B:·····█} {d:the spinner is a caliper, not a fidget toy}`);
  s.add(`  hint     ${' '}${'{B:›} {d:reliastra evidence show 7c1d0a5f}'}`);
  s.add(`  error    {X:${G.cross}} {V:not permitted: missing scope read:incidents}`);
  s.add(`           {f:${G.rail}} {B:${G.arrow}} {d:reliastra keys create ci-deploy --scopes read:incidents}`);
  s.add(`           {f:${G.rail}} {t:exit 5}`);
  s.blank();

  s.add(section('fidelity', 'one code path, five levels', C));
  for (const lvl of TOKENS.fidelity.levels) {
    s.add(`  {v:${padPlain(lvl.id, 8)}} {d:${padPlain(lvl.when.slice(0, 62), 64)}} {t:${lvl.renders.slice(0, 60)}}`);
  }
  s.blank();

  s.add(section('voice', 'the honesty contract, in the layout', C));
  s.add(`  {f:${G.rail}} {d:A verdict is stated with its scope: where it was seen, when, and from how many points.}`);
  s.add(`  {f:${G.rail}} {d:A region label is never placed where a reader will take it for corroboration.}`);
  s.add(`  {f:${G.rail}} {d:Attribution prints as a score with its methodology version. Never as a cause.}`);
  s.add(`  {f:${G.rail}} {d:A field the API did not return is — , never 0, never unknown, never blank.}`);
  s.exitCode = 0;
  return s;
}
