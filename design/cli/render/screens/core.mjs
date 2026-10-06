// Account-surface screens: help, login, doctor.
import { Screen, section, kv, hint, rule, chip, padPlain } from '../screen.mjs';

const G = { tick: '✓', cross: '×', warn: '!', dot: '·', caret: '›', arrow: '→', rail: '│', rule: '─' };

function rows(pairs, { indent = 2, keyWidth = 26, code = 'v', descCode = 'd' } = {}) {
  return pairs.map(([k, desc]) => `${' '.repeat(indent)}{${code}:${padPlain(k, keyWidth)}}{${descCode}:${desc}}`);
}

/* ── 01 · reliastra --help ─────────────────────────────────────────────── */
export function helpScreen() {
  const C = 100;
  const s = new Screen({ cols: C, theme: 'dark' });
  s.title = 'reliastra --help';
  s.prompt('--help');
  s.blank();
  const meta = 'independent observation of external dependencies';
  s.add(padPlain('{H:RELIASTRA} {t:0.4.0}', C - meta.length) + `{t:${meta}}`);
  s.add('{d:Observe the endpoints your services call, confirm failures deterministically, and}');
  s.add('{d:carry the evidence to whoever asks how you know.}');
  s.blank();
  s.add(section('account', '', C));
  s.addAll(rows([
    ['login', 'Store a session on this machine'],
    ['logout', 'Revoke the session and remove it locally'],
    ['whoami', 'Show the account this invocation resolves to'],
    ['doctor', 'Check config, credential and API, and name the failure'],
  ]));
  s.blank();
  s.add(section('probing', '', C));
  s.addAll(rows([
    ['deps list', 'Dependencies being probed'],
    ['deps show <id>', 'One dependency, its observations and its incidents'],
    ['deps add <name> <url>', 'Start probing an endpoint'],
    ['deps rm <id>', 'Stop probing an endpoint'],
    ['checks recent', 'Observations, newest first'],
  ]));
  s.blank();
  s.add(section('incidents and evidence', '', C));
  s.addAll(rows([
    ['incidents list | show', 'Open incidents, or one incident in full'],
    ['incidents correlate <id>', 'Score a degradation against this window'],
    ['evidence list | show | get', 'The records issued for this account'],
    ['verify <verification-id>', 'Check a document against the public record'],
    ['keys list | create | rm', 'API keys for CI and other services'],
  ]));
  s.blank();
  s.add(section('public', 'no credential', C));
  s.addAll(rows([
    ['obs list | show <vendor>', 'The public observatory'],
    ['open <kind> [id]', 'Print the web page for a resource'],
  ]));
  s.blank();
  s.add(section('flags', 'every command', C));
  s.addAll(rows([
    ['--json', 'Machine-readable output. The API’s own shape, unrenamed.'],
    ['--quiet', 'Suppress the explanatory lines; data only.'],
    ['--color auto|always|never', 'Colour on a TTY by default; never when piped.'],
    ['--token <token>', 'Bearer token or API key for this invocation only.'],
    ['-h, --help   -v, --version', 'This answer, and the release version.'],
  ], { keyWidth: 28 }));
  s.blank();
  s.add(section('exit codes', 'the contract a pipeline branches on', C));
  s.add('  {n:0} {d:ok} {t:·} {n:1} {d:usage} {t:·} {n:2} {d:api} {t:·} {n:3} {d:auth} {t:·} {x:4} {d:unverified} {t:·} {w:5} {d:denied} {t:·} {w:6} {d:network}');
  s.blank();
  s.add(section('try', '', C));
  s.add(hint('reliastra deps add "Payments API" https://api.example.com/health --interval 60', 2));
  s.add(hint('reliastra incidents list --status open', 2));
  s.add(hint('reliastra verify 8Kd2xQ7mB4pL --file incident.pdf', 2));
  s.exitCode = 0;
  return s;
}

/* ── 02 · reliastra login ──────────────────────────────────────────────── */
export function loginScreen() {
  const C = 100;
  const s = new Screen({ cols: C, theme: 'dark' });
  s.title = 'reliastra login';
  s.prompt('login');
  s.blank();
  s.add('{d:A password is never taken as a flag: it comes from a prompt, so it cannot}');
  s.add('{d:land in shell history or a process listing.}');
  s.blank();
  s.add('  {k:email}       {v:ada@acme.dev}');
  s.add('  {k:password}    {d:••••••••••••••}');
  s.blank();
  s.add('  {B:···█··} {d:exchanging credentials} {t:0.6s}');
  s.blank();
  s.add(`  {U:${G.tick}} {v:session stored}   {m:~/.config/reliastra/config.json} {t:(mode 0600)}`);
  s.add(`  {U:${G.tick}} {v:account}         {v:ada@acme.dev} {t:·} {d:org} {v:acme-platform} {t:·} {d:plan} {w:trial, 9 days left}`);
  s.blank();
  s.add(hint('reliastra whoami prints which credential an invocation resolves to.', 2));
  s.exitCode = 0;
  return s;
}

/* ── 03 · reliastra doctor ─────────────────────────────────────────────── */
export function doctorScreen() {
  const C = 100;
  const s = new Screen({ cols: C, theme: 'dark' });
  s.title = 'reliastra doctor';
  s.prompt('doctor');
  s.blank();
  const row = (mark, name, detail) => `  {${mark}} {v:${padPlain(name, 16)}}{d:${detail}}`;
  s.add(row('U:' + G.tick, 'config file', '~/.config/reliastra/config.json (mode 600)'));
  s.add(row('U:' + G.tick, 'credential', 'api key ci-deploy · read:checks read:incidents read:evidence'));
  s.add(row('U:' + G.tick, 'api url', 'https://api.reliastra.com'));
  s.add(row('U:' + G.tick, 'api reachable', '/health answered in 84 ms'));
  s.add(row('W:' + G.warn, 'version', '0.3.1 installed · 0.4.0 available'));
  s.add(`      {f:${G.rail}} {B:${G.arrow}} {d:npm update -g reliastra}`);
  s.add(row('U:' + G.tick, 'authenticated', 'as ada@acme.dev'));
  s.blank();
  s.add(`  {u:5 ok} {t:·} {w:1 advisory} {t:·} {d:0 failed} {t:·} {d:nothing essential is broken}`);
  s.exitCode = 0;
  return s;
}
