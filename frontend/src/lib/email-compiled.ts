import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EmailClassId } from '@/emails/registry';
/**
 * Reads the compiled email artefacts that the backend seeds from.
 *
 * Server-only, and deliberately file-backed rather than re-rendering the React
 * components here. The preview must show the bytes that ship: the compiler
 * runs them through the backend's sanitizer allowlist before writing, so a
 * harness that rendered the live components would be reviewing a design that
 * no recipient ever receives. The price of that honesty is one `emails:compile`
 * between a design edit and its screenshot, which is about three seconds.
 *
 * If the file is absent the harness reports it rather than silently rendering
 * nothing, because "no preview" and "broken preview" must not look alike.
 */

export interface CompiledClass {
  id: EmailClassId;
  name: string;
  description: string;
  audience: string;
  subject: string;
  preview_text: string;
  html: string;
  text: string;
  variables: string[];
  permitted_senders: string[];
  purpose: string;
  verifiable: boolean;
}

export interface CompiledBook {
  _generated: string;
  _source: string;
  classes: CompiledClass[];
}

const RELATIVE = 'backend/app/modules/email_center/compiled_templates.json';

/**
 * Candidate locations, tried in order.
 *
 * `import.meta.url` is not dependable here: the Next bundler rewrites module
 * identity for server components, so the URL may not point at this source file
 * at runtime. `process.cwd()` is the frontend package root under `next dev` and
 * `next build`, and the `import.meta.url` branch covers being invoked from a
 * different working directory. Resolving by trying both is cheaper than a build
 * that silently renders nothing.
 */
const CANDIDATES = [
  resolve(process.cwd(), '..', RELATIVE),
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../..', RELATIVE),
  resolve(process.cwd(), RELATIVE),
];

let cached: CompiledBook | null = null;
let cachedStamp = 0;

/**
 * Cached on mtime rather than for the process lifetime.
 *
 * A bare module-level cache is correct in production and wrong in the design
 * loop: `next dev` keeps server modules resident, so recompiling the templates
 * and reloading the browser would keep serving the previous artefact - and a
 * screenshot of a stale template is worse than no screenshot, because it looks
 * like a real result.
 */
export const loadCompiled = async (): Promise<CompiledBook | null> => {
  for (const path of CANDIDATES) {
    try {
      const info = await stat(path);
      if (cached && info.mtimeMs === cachedStamp) return cached;
      const raw = await readFile(path, 'utf8');
      cached = JSON.parse(raw) as CompiledBook;
      cachedStamp = info.mtimeMs;
      return cached;
    } catch {
      continue;
    }
  }
  cached = null;
  cachedStamp = 0;
  return null;
};

export const loadClass = async (id: string): Promise<CompiledClass | null> => {
  const book = await loadCompiled();
  if (!book) return null;
  return book.classes.find((c) => c.id === id) ?? null;
};
