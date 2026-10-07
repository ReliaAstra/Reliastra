// The first five seconds: the wordmark, the first-run screen, and the home
// screen a bare `reliastra` prints once you have a session.
import { Screen, rule, hint, padPlain } from '../screen.mjs';

const G = { caret: '›', rule: '─' };

/**
 * The CLI image. Nine cells that tell the product story — a calm observation
 * trace with one spike the vendor will swear never happened — then the
 * wordmark in tracked caps and the version. Block elements and letters only,
 * so it survives every font and every fidelity level.
 */
export function wordmark(version = '0.4.0') {
  return `{f:[}{b:▁▂}{x:█}{b:▄▂▁}{f:]}  {H:R E L I A S T R A}  {t:${version}}`;
}

export const TAGLINE = '{d:independent observation of external dependencies}';

/* ── 14 · first run: no config file on this machine ────────────────────── */
export function firstRunScreen(theme = 'dark') {
  const C = 100;
  const s = new Screen({ cols: C, theme });
  s.title = 'reliastra · first run';
  s.prompt('');
  s.blank();
  s.add(wordmark());
  s.add(TAGLINE);
  s.add(rule(C));
  s.blank();
  s.add('  {d:Your API failed. Was the dependency actually down? Your monitoring proves}');
  s.add('  {d:your application failed; it cannot tell you whether the fault was internal}');
  s.add('  {d:or a third party’s. Reliastra observes the same endpoint separately,}');
  s.add('  {d:confirms the failure deterministically, and hands you the evidence.}');
  s.blank();
  s.add('  {t:not signed in · nothing probed yet}');
  s.blank();
  const door = (cmd, desc) => `  {B:${G.caret}} {v:${padPlain(cmd, 33)}}{d:${desc}}`;
  s.add(door('reliastra login', 'store a session on this machine'));
  s.add(door('reliastra obs list', 'the public observatory — no account needed'));
  s.add(door('reliastra deps add "Name" <url>', 'start probing an endpoint in one line'));
  s.blank();
  s.add(`  {t:quickstart} {m:https://reliastra.com/docs/quickstart}`);
  s.add(`  {f:${G.rule}} {d:this screen is the absence of a config file. It never prints when piped.}`);
  s.exitCode = 0;
  return s;
}

/* ── 15 · home: bare `reliastra` with a session, on a TTY ──────────────── */
export function homeScreen(theme = 'dark') {
  const C = 100;
  const s = new Screen({ cols: C, theme });
  s.title = 'reliastra';
  s.prompt('');
  s.blank();
  s.add(wordmark());
  s.add(rule(C));
  const k = (key) => `  {k:${padPlain(key, 10)}}`;
  s.add(`${k('account')} {v:ada@acme.dev} {t:·} {d:org} {v:acme-platform} {t:·} {w:trial, 9 days left}`);
  s.add(`${k('probing')} {v:5 dependencies} {t:·} {u:3 up} {t:·} {w:1 degraded} {t:·} {x:1 down}`);
  s.add(`${k('open')} {x:1 incident} {t:·} {v:9f1c8b0e} {t:·} {d:Stripe Payments API} {t:·} {d:29 m}`);
  s.add(`${k('evidence')} {v:4 records} {t:·} {d:newest} {v:7c1d0a5f} {t:·} {d:issued 2026-10-06 17:41Z}`);
  s.add(rule(C));
  s.add(hint('reliastra incidents show 9f1c8b0e    the open incident: window, attribution, evidence', 2));
  s.add(hint('reliastra checks recent --limit 20  what the probes saw, newest first', 2));
  s.add(hint('reliastra deps list                 everything being probed, with probe strips', 2));
  s.blank();
  s.add(`  {f:${G.rule}} {t:reliastra --help for every command · this screen prints on a TTY only}`);
  s.exitCode = 0;
  return s;
}
