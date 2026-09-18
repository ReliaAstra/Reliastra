/**
 * Terminal prompts.
 *
 * Two rules, both about not lying to the operator:
 *
 *  1. A secret is never accepted as a flag. An argument lands in shell history
 *     and in every process listing on the machine, which turns a convenience
 *     into a credential leak. It comes from a prompt, or from an environment
 *     variable when there is no terminal.
 *  2. Nothing destructive happens without a typed confirmation when a person is
 *     present, and nothing destructive happens *at all* without `--yes` when
 *     there is not. A prompt that reads EOF and proceeds is worse than no
 *     prompt, because it looks like it asked.
 */

import { createInterface } from 'node:readline';
import { EXIT } from '../bin/reliastra.mjs';
import { write, writeError } from './output.mjs';

/** Read a line without echoing it, when the terminal supports that. */
export function promptSecret(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }
    process.stderr.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let value = '';
    const onData = (chunk) => {
      const char = chunk.toString('utf8');
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stderr.write('\n');
        resolve(value);
      } else if (char === '\u0003') {
        process.stderr.write('\n');
        process.exit(EXIT.usage);
      } else if (char === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    process.stdin.on('data', onData);
  });
}

/**
 * `y`/`n` confirmation for a destructive action.
 *
 * Returns `true` only on an explicit yes. Without a terminal the caller must
 * have passed `--yes`, which this reports as `null` so the caller can explain
 * rather than guess.
 */
export async function confirm(question) {
  if (!process.stdin.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

/**
 * Guard a destructive command.
 *
 * Returns an exit code when the action must not proceed, or `null` to proceed.
 * The two refusal paths are kept separate in the message: "you did not confirm"
 * and "there is no terminal to confirm on" need different fixes.
 */
export async function guardDestructive({ flags, what }) {
  if (flags.yes) return null;
  const confirmed = await confirm(`remove ${what}? [y/N] `);
  if (confirmed === null) {
    writeError(
      `refusing to remove ${what} without confirmation: no terminal is attached.`
    );
    writeError(`re-run with --yes if this is intended (for example, from a script).`);
    return EXIT.usage;
  }
  if (!confirmed) {
    write('nothing removed.');
    return EXIT.usage;
  }
  return null;
}
