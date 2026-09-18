/**
 * Output.
 *
 * Every command renders twice: once for a person (`table`, `kv`, `line`) and
 * once for a program (`--json`). The rule that keeps the two honest is that
 * `--json` writes exactly the API's own shape - no renaming, no derived
 * fields, no dropped nulls - so `reliastra ... --json | jq` behaves like the
 * API call it stands for.
 *
 * No colour is emitted. A CLI whose output is unreadable when piped into a file
 * or a CI log is a CLI that gets its output re-parsed by hand.
 */

const isTty = () => Boolean(process.stdout.isTTY);

/**
 * Output sinks.
 *
 * Commands never touch `process.stdout` directly. A test replaces these to
 * capture output, which is why this indirection exists rather than a clever
 * trick around the global stream: patching `process.stdout.write` also swallows
 * the test reporter's own TAP output, and a suite that hides its own failures
 * is worse than no suite.
 */
let out = process.stdout;
let err = process.stderr;

export function setOutput({ stdout, stderr } = {}) {
  out = stdout ?? process.stdout;
  err = stderr ?? process.stderr;
}

export function resetOutput() {
  out = process.stdout;
  err = process.stderr;
}

export function write(text) {
  out.write(text.endsWith('\n') ? text : `${text}\n`);
}

export function writeError(text) {
  err.write(text.endsWith('\n') ? text : `${text}\n`);
}

export function jsonOut(value) {
  write(JSON.stringify(value, null, 2));
}

/** Fixed-width column table. Widths follow the longest cell, capped. */
export function table(rows, columns, { empty = 'no rows' } = {}) {
  if (!rows.length) {
    write(empty);
    return;
  }
  const cell = (row, col) => {
    const value = col.value(row);
    return value === null || value === undefined || value === '' ? '—' : String(value);
  };
  const widths = columns.map((col) => {
    const longest = Math.max(
      col.header.length,
      ...rows.map((row) => cell(row, col).length),
    );
    return Math.min(longest, col.max ?? 48);
  });

  const line = (values) =>
    values
      .map((value, i) => {
        const text = String(value);
        const padded = text.length > widths[i] ? `${text.slice(0, widths[i] - 1)}…` : text;
        return padded.padEnd(widths[i]);
      })
      .join('  ')
      .replace(/\s+$/, '');

  write(line(columns.map((c) => c.header.toUpperCase())));
  write(line(columns.map((c) => '─'.repeat(widths[columns.indexOf(c)]))));
  for (const row of rows) write(line(columns.map((col) => cell(row, col))));
}

/** Aligned `key  value` block for a single record. */
export function kv(pairs, { indent = 0 } = {}) {
  const pad = ' '.repeat(indent);
  const width = Math.max(...pairs.map(([key]) => key.length));
  const lines = pairs.map(([key, value]) => {
    const rendered = value === null || value === undefined || value === '' ? '—' : String(value);
    const [first, ...rest] = rendered.split('\n');
    const head = `${pad}${key.padEnd(width)}  ${first}`;
    return [head, ...rest.map((l) => `${pad}${' '.repeat(width)}  ${l}`)].join('\n');
  });
  write(lines.join('\n'));
}

/** Section heading for multi-part output. */
export function heading(text) {
  write(`\n${text}`);
}

export const SYMBOL = {
  ok: '✓',
  fail: '✕',
  warn: '!',
  live: '●',
  unknown: '?',
};

export function isInteractive() {
  return isTty();
}
