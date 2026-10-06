// Data-surface screens: deps list, checks recent, obs show.
import { Screen, section, table, hint, chip, obsSpark, meter, axis, padPlain } from '../screen.mjs';

const G = { tick: '✓', cross: '×', warn: '!', dot: '·', caret: '›', arrow: '→', rail: '│', rule: '─' };

/* observations used by the strips: {up, ms} */
const OBS = {
  down: [
    { up: true, ms: 205 }, { up: true, ms: 198 }, { up: true, ms: 212 }, { up: true, ms: 190 },
    { up: true, ms: 224 }, { up: true, ms: 201 }, { up: true, ms: 216 }, { up: true, ms: 199 },
    { up: true, ms: 231 }, { up: true, ms: 208 }, { up: true, ms: 214 }, { up: true, ms: 203 },
    { up: true, ms: 226 }, { up: true, ms: 210 }, { up: true, ms: 219 }, { up: true, ms: 205 },
    { up: true, ms: 940 }, { up: false, ms: 4180 }, { up: false, ms: 4210 }, { up: false, ms: 4195 },
    { up: false, ms: 4240 }, { up: false, ms: 4180 }, { up: false, ms: 4266 }, { up: false, ms: 4201 },
  ],
  up: Array.from({ length: 24 }, (_, i) => ({ up: true, ms: 112 + (i % 4) * 9 })),
  degraded: Array.from({ length: 24 }, (_, i) => ({ up: i % 7 !== 3, ms: 210 + (i % 7 === 3 ? 1240 : (i % 3) * 60) })),
  nodata: Array.from({ length: 24 }, (_, i) => ({ up: true, ms: 90 + ((i * 29) % 40) })),
};

/* ── 04 · reliastra deps list ──────────────────────────────────────────── */
export function depsListScreen(theme = 'dark') {
  const C = 134;
  const s = new Screen({ cols: C, theme });
  s.title = 'reliastra deps list';
  s.prompt('deps list');
  s.blank();
  s.add(
    section('dependencies', '', C - 44) +
      ` {u:3 up} {t:·} {w:1 degraded} {t:·} {x:1 down} {t:·} {d:5 probed}`
  );
  s.addAll(
    table(
      [
        { header: 'id', width: 12 },
        { header: 'name', width: 16 },
        { header: 'endpoint', width: 34, max: 34 },
        { header: 'every', width: 5 },
        { header: 'state', width: 10 },
        { header: 'last 24 probes', width: 24 },
        { header: 'last check (utc)', width: 20 },
      ],
      [
        { cells: ['{m:dep-4c1f9e2a}', '{v:Payments API}', '{m:https://api.stripe.com/v1/health}', '{d:1m}', chip('DOWN', 'down'), obsSpark(OBS.down, 24), '{d:2026-10-06 18:41:12Z}'] },
        { cells: ['{m:dep-9b21aa04}', '{v:Auth (Auth0)}', '{m:https://auth.acme.dev/healthz}', '{d:1m}', chip('UP', 'up'), obsSpark(OBS.up, 24), '{d:2026-10-06 18:41:12Z}'] },
        { cells: ['{m:dep-77e0c31d}', '{v:Shipping rates}', '{m:https://api.shippo.com/v1/health}', '{d:5m}', chip('UP', 'up'), obsSpark(OBS.up.slice(4).concat(OBS.up.slice(0, 4)), 24), '{d:2026-10-06 18:40:03Z}'] },
        { cells: ['{m:dep-0a5b8f22}', '{v:Email (Postmark)}', '{m:https://api.postmarkapp.com/health}', '{d:5m}', chip('DEGRADED', 'degraded'), obsSpark(OBS.degraded, 24), '{d:2026-10-06 18:40:03Z}'] },
        { cells: ['{m:dep-31cd9e77}', '{v:FX reference}', '{m:https://fx.internal/health}', '{d:10m}', chip('NO DATA', 'unknown'), `{f:${'·'.repeat(24)}}`, '{d:—}'] },
      ],
      { indent: 0 }
    )
  );
  s.blank();
  s.add(`  {f:${G.rail}} {p:1 observation point} {t:us-east · methodology v2.0 · a region label is not corroboration}`);
  s.add(hint('reliastra deps show dep-4c1f9e2a for its observations and its incidents.', 2));
  s.exitCode = 0;
  return s;
}

/* ── 05 · reliastra checks recent ──────────────────────────────────────── */
export function checksRecentScreen(theme = 'dark') {
  const C = 134;
  const s = new Screen({ cols: C, theme });
  s.title = 'reliastra checks recent';
  s.prompt('checks recent --limit 12');
  s.blank();
  s.add(section('observations', 'newest first', C));
  const bar = (ms, failed) => axis(Math.min(1, ms / 4300), 22, failed ? 'x' : 'b');
  s.addAll(
    table(
      [
        { header: 'executed (utc)', width: 20 },
        { header: 'result', width: 10 },
        { header: 'status', width: 6 },
        { header: 'latency', width: 9, align: 'right' },
        { header: 'latency in window', width: 22 },
        { header: 'detail', width: 41, max: 41 },
        { header: 'dep', width: 12 },
      ],
      [
        { cells: ['{d:2026-10-06 18:41:12Z}', chip('DOWN', 'down'), '{x:503}', '{x:4180 ms}', bar(4180, true), '{d:gateway: upstream connect error or disconnect}', '{m:dep-4c1f9e2a}'] },
        { cells: ['{d:2026-10-06 18:41:12Z}', chip('UP', 'up'), '{d:200}', '{n:118 ms}', bar(118, false), '{d:ok}', '{m:dep-9b21aa04}'] },
        { cells: ['{d:2026-10-06 18:40:03Z}', chip('UP', 'up'), '{d:200}', '{n:212 ms}', bar(212, false), '{d:ok}', '{m:dep-77e0c31d}'] },
        { cells: ['{d:2026-10-06 18:40:03Z}', chip('DEGRADED', 'degraded'), '{d:200}', '{w:1412 ms}', bar(1412, false), '{w:latency above the 1 s envelope}', '{m:dep-0a5b8f22}'] },
        { cells: ['{d:2026-10-06 18:36:12Z}', chip('DOWN', 'down'), '{x:503}', '{x:4210 ms}', bar(4210, true), '{d:gateway: upstream connect error or disconnect}', '{m:dep-4c1f9e2a}'] },
        { cells: ['{d:2026-10-06 18:36:12Z}', chip('UP', 'up'), '{d:200}', '{n:121 ms}', bar(121, false), '{d:ok}', '{m:dep-9b21aa04}'] },
        { cells: ['{d:2026-10-06 18:35:03Z}', chip('UP', 'up'), '{d:200}', '{n:205 ms}', bar(205, false), '{d:ok}', '{m:dep-77e0c31d}'] },
        { cells: ['{d:2026-10-06 18:35:03Z}', chip('UP', 'up'), '{d:200}', '{n:198 ms}', bar(198, false), '{d:ok}', '{m:dep-0a5b8f22}'] },
        { cells: ['{d:2026-10-06 18:31:12Z}', chip('DOWN', 'down'), '{x:503}', '{x:4195 ms}', bar(4195, true), '{d:gateway: upstream connect error or disconnect}', '{m:dep-4c1f9e2a}'] },
        { cells: ['{d:2026-10-06 18:31:12Z}', chip('UP', 'up'), '{d:200}', '{n:114 ms}', bar(114, false), '{d:ok}', '{m:dep-9b21aa04}'] },
      ],
      { indent: 0 }
    )
  );
  s.blank();
  s.add(
    `  {d:10 shown of 1,204} {t:·} {d:p50} {n:142 ms} {t:·} {d:p95} {n:4.18 s} {t:·} {x:3 failed} {t:·} {p:us-east · 1 observation point}`
  );
  s.exitCode = 0;
  return s;
}

/* ── 09 · reliastra obs show stripe ────────────────────────────────────── */
export function obsShowScreen(theme = 'dark') {
  const C = 110;
  const s = new Screen({ cols: C, theme });
  s.title = 'reliastra obs show stripe';
  s.prompt('obs show stripe');
  s.blank();
  s.add(section('stripe', 'public observatory · no credential', C));
  s.add(`  {X:${G.cross} DOWN}  {d:the last probe reached the target and it failed.}`);
  s.blank();
  const k = (key) => `  {k:${padPlain(key, 17)}}`;
  s.add(`${k('recent status')} {W:DEGRADED} {d:derived from the five most recent observations}`);
  s.add(`${k('last 5 probes')} {d:18:41} {x:${G.cross} 503} {x:4180 ms}  {f:▇}`);
  s.add(`${' '.repeat(20)}{d:18:36} {x:${G.cross} 503} {x:4210 ms}  {f:▇}`);
  s.add(`${' '.repeat(20)}{d:18:31} {u:${G.tick} 200} {n:212 ms}  {f:▁}`);
  s.add(`${' '.repeat(20)}{d:18:26} {u:${G.tick} 200} {n:198 ms}  {f:▁}`);
  s.add(`${' '.repeat(20)}{d:18:21} {u:${G.tick} 200} {n:205 ms}  {f:▁}`);
  s.add(`${k('observation point')} {p:us-east} {t:·} {d:1 point} {t:·} {d:not a consensus}`);
  s.add(`${k('methodology')} {p:v2.0}`);
  s.add(`${k('page')} {m:https://reliastra.com/observatory/stripe}`);
  s.blank();
  s.add(`  {f:${G.rail}} {d:This is one observation path. It is not vendor-wide health, and no}`);
  s.add(`  {f:${G.rail}} {d:Reliastra surface presents it as one.}`);
  s.exitCode = 0;
  return s;
}
