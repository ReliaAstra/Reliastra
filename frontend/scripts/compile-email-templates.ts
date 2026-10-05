/**
 * RELIASTRA · EMAIL TEMPLATE COMPILE
 *
 * Renders all nine classes with React Email and writes the result to the
 * backend as seed data.
 *
 * The one hard problem here is that the backend sanitizes every HTML body with a
 * strict allowlist (`app/modules/email_center/sanitize.py`) before storing it
 * and again before sending. That sanitizer drops `<style>` with its contents,
 * unwraps any tag not on the allowlist, and strips every attribute outside a
 * short list. React Email emits a document wrapper, a `<style>` block and a
 * `<Preview>` div, none of which survive it intact.
 *
 * So this script does three things, in order:
 *
 *   1. Render the component to a full HTML document.
 *   2. Extract the document body and re-implement the backend's allowlist as a
 *      filter, so the emitted HTML is *exactly* what the backend will store.
 *   3. Assert the output is a fixed point: sanitizing it again must be a no-op.
 *      Step 3 is the guarantee that the HTML reviewed in the preview harness is
 *      byte-identical to the HTML that sends. `backend/tests/` asserts the same
 *      property from the Python side.
 *
 * If step 3 ever fails, the correct fix is to change this script - never to
 * relax the sanitizer.
 *
 * Usage:  npm run emails:compile
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render } from '@react-email/render';
import { createElement } from 'react';

import { EMAIL_CLASSES, allVariables, type EmailClassSpec } from '../src/emails/registry';
import { PREVIEW } from '../src/emails/preview-fixtures';

// ── The backend allowlist, mirrored ────────────────────────────────────────
// Mirrored deliberately rather than imported. A Python module cannot be read
// from a Node script, and a generated JSON of it would be a build artifact
// that can drift silently. Duplication of 40 tokens is cheaper than a class of
// bug where the two implementations disagree and nothing notices.

const ALLOWED_TAGS = new Set(
  `a abbr b blockquote br caption code col colgroup div em figcaption figure h1
   h2 h3 h4 h5 h6 hr i img li ol p pre small span strong sub sup table tbody td
   tfoot th thead tr u ul`.split(/\s+/).filter(Boolean),
);

const ALLOWED_ATTRS = new Set(
  `href src alt title width height align valign colspan rowspan cellpadding
   cellspacing border style class id target rel`.split(/\s+/).filter(Boolean),
);

const VOID_TAGS = new Set(['br', 'hr', 'img', 'col']);

const DROP_WITH_CONTENT = new Set(
  `script style iframe object embed applet form input button select textarea
   link meta base noscript template frame frameset canvas audio video source
   track`.split(/\s+/).filter(Boolean),
);

const SAFE_URL = /^(?:https?|mailto|cid):/i;
// The forward slash in `text/html` must be escaped or it terminates the literal.
const UNSAFE_STYLE =
  /(expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|@import|behavior\s*:|-moz-binding|url\s*\(\s*['"]?\s*javascript\s*:)/i;

/**
 * Mirrors Python's `html.parser` with `convert_charrefs=False`: a recognised
 * character reference is passed through untouched, and only a *bare* ampersand
 * is escaped. Escaping every `&` unconditionally would turn `&amp;` into
 * `&amp;amp;` on the second pass, which is precisely the fixed-point failure
 * this script asserts against.
 */
const escapeText = (s: string): string => {
  const held: string[] = [];
  const guarded = s.replace(
    /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (m) => {
      held.push(m);
      return `\u0000${held.length - 1}\u0000`;
    },
  );
  return guarded
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)]);
};

const escapeAttr = (s: string): string => {
  const held: string[] = [];
  const guarded = s.replace(
    /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (m) => {
      held.push(m);
      return `\u0000${held.length - 1}\u0000`;
    },
  );
  return guarded
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)])
    .replace(/\x00/g, '');
};

const cleanUrl = (value: string): string | null => {
  const trimmed = value.trim().replace(/\x00/g, '');
  const collapsed = trimmed.replace(/[\s\x00-\x1f]+/g, '').toLowerCase();
  if (collapsed.startsWith('javascript:') || collapsed.startsWith('vbscript:')) return null;
  if (SAFE_URL.test(trimmed)) return trimmed;
  if (trimmed.startsWith('#')) return trimmed;
  return null;
};

const cleanStyle = (value: string): string | null => {
  const trimmed = value.trim().replace(/\x00/g, '');
  if (!trimmed || trimmed.length > 4000) return null;
  if (UNSAFE_STYLE.test(trimmed)) return null;
  return trimmed;
};

/**
 * Port of `sanitize._Sanitizer`. Written as a streaming pass over the HTML so
 * it handles arbitrarily nested markup without a DOM dependency.
 */
const allowlist = (html: string): string => {
  const out: string[] = [];
  let dropDepth = 0;
  const openStack: string[] = [];

  const emitStart = (tag: string, rawAttrs: string): void => {
    if (DROP_WITH_CONTENT.has(tag)) {
      dropDepth += 1;
      return;
    }
    if (dropDepth > 0) return;
    if (!ALLOWED_TAGS.has(tag)) return;

    const attrs: string[] = [];
    for (const match of rawAttrs.matchAll(
      /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g,
    )) {
      const name = match[1].toLowerCase();
      const value = match[3] ?? match[4] ?? match[5] ?? '';
      if (!name || name.startsWith('on') || !ALLOWED_ATTRS.has(name)) continue;
      let final = value;
      if (name === 'href' || name === 'src') {
        const cleaned = cleanUrl(value);
        if (cleaned === null) continue;
        final = cleaned;
      } else if (name === 'style') {
        const cleaned = cleanStyle(value);
        if (cleaned === null) continue;
        final = cleaned;
      } else if (name === 'target' && !/^(_blank|_self|_top)$/i.test(value)) {
        continue;
      }
      attrs.push(` ${name}="${escapeAttr(final)}"`);
    }
    if (tag === 'a' && !attrs.some((a) => a.startsWith(' href='))) return;

    if (VOID_TAGS.has(tag)) {
      out.push(`<${tag}${attrs.join('')}>`);
    } else {
      out.push(`<${tag}${attrs.join('')}>`);
      openStack.push(tag);
    }
  };

  // Walk tags and text, keeping comments and doctypes out entirely.
  const tokenRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/?([a-zA-Z][-a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>])*)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  let cursor = 0;

  while ((match = tokenRe.exec(html)) !== null) {
    const [full, tag, rawAttrs, text] = match;

    // Text between tags.
    if (text !== undefined) {
      if (dropDepth === 0) out.push(escapeText(text));
      continue;
    }
    // Comment / doctype / CDATA - dropped, matching the Python handler.
    if (full.startsWith('<!--') || full.startsWith('<!')) {
      // Conditional comments hold the VML fallbacks. Their content is real
      // markup the sanitizer would otherwise keep, so unwrap rather than skip.
      const inner = /<!\[if [^\]]*\]>([\s\S]*?)<!\[endif\]>/.exec(full);
      if (inner) {
        if (dropDepth === 0) out.push(allowlist(inner[1]));
      }
      continue;
    }

    const closing = full.startsWith('</');
    const name = tag.toLowerCase();

    if (closing) {
      if (DROP_WITH_CONTENT.has(name)) {
        dropDepth = Math.max(0, dropDepth - 1);
        continue;
      }
      if (dropDepth > 0) continue;
      if (!ALLOWED_TAGS.has(name) || VOID_TAGS.has(name)) continue;
      // Close through any unclosed ancestors so nesting stays balanced.
      const idx = openStack.lastIndexOf(name);
      if (idx === -1) continue;
      for (let i = openStack.length - 1; i >= idx; i -= 1) {
        out.push(`</${openStack[i]}>`);
      }
      openStack.length = idx;
      continue;
    }

    const selfClosing = /\/\s*$/.test(rawAttrs ?? '');
    const attrsOnly = selfClosing ? rawAttrs.replace(/\/\s*$/, '') : rawAttrs;
    const before = dropDepth;
    emitStart(name, attrsOnly ?? '');
    if (selfClosing && !VOID_TAGS.has(name)) {
      if (dropDepth === before && openStack[openStack.length - 1] === name) {
        out.push(`</${name}>`);
        openStack.pop();
      }
    }
  }

  for (let i = openStack.length - 1; i >= 0; i -= 1) out.push(`</${openStack[i]}>`);
  return out.join('');
};

/** Pull the `<body>` content out of a React Email document. */
const documentBody = (html: string): string => {
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return m ? m[1] : html;
};

/** Plain-text multipart body. */
const toText = (html: string): string => {
  let t = html;
  // The preheader lives in a hidden div; keep it, it is what a text client reads.
  t = t.replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/t[dh]>/gi, '\t');
  t = t.replace(/<[^>]+>/g, '');
  t = t
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  return t
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').replace(/^[ \t]+/, (m) => (m.includes('\t') ? '\t' : '')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// ── Compile ────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
// scripts/ -> frontend/ -> repo root, then into the backend package.
const outPath = resolve(here, '../../backend/app/modules/email_center/compiled_templates.json');

interface Compiled {
  id: string;
  name: string;
  description: string;
  audience: string;
  subject: string;
  preview_text: string;
  html: string;
  text: string;
  variables: string[];
  /** Per-variable required flag, description and API binding. This is what
      lets the backend refuse a send whose provenance was never populated. */
  variable_specs: {
    name: string;
    required: boolean;
    description: string;
    bound: string | null;
    machine: boolean;
  }[];
  permitted_senders: string[];
  purpose: string;
  verifiable: boolean;
}

const failures: string[] = [];
const compiled: Compiled[] = [];

async function main(): Promise<void> {
  for (const spec of EMAIL_CLASSES) {
    const fixture = PREVIEW[spec.id as keyof typeof PREVIEW];
    if (!fixture) {
      failures.push(`${spec.id}: no preview fixture`);
      continue;
    }

    // `render` is async in @react-email/render v1 and resolves to a full
    // standalone document. Awaiting it is the only correct call shape.
    const document = await render(createElement(spec.component, fixture as never), {
      pretty: false,
      plainText: false,
    });

    const bodyHtml = documentBody(document);
    const sanitized = allowlist(bodyHtml);

    // Fixed-point assertion. The Python side asserts the same property against
    // the real sanitizer; this catches regressions before they get that far.
    const second = allowlist(sanitized);
    if (second !== sanitized) {
      failures.push(`${spec.id}: output is not a fixed point of the sanitizer`);
      if (process.env.EMAIL_COMPILE_DEBUG) {
        let i = 0;
        while (i < sanitized.length && sanitized[i] === second[i]) i += 1;
        const at = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 90), i + 90));
        console.error(`\n${spec.id}: diverges at offset ${i}`);
        console.error(`  pass 1 …${at(sanitized)}…`);
        console.error(`  pass 2 …${at(second)}…`);
      }
    }

    // Nothing that must never leave the admin console may appear in a stored
    // template. Cheap to assert here, expensive to discover in an inbox.
    for (const forbidden of ['api_key', 'apiKey', 'RESEND_API', 'Bearer ']) {
      if (sanitized.includes(forbidden)) {
        failures.push(
          `${spec.id}: compiled HTML contains forbidden token "${forbidden}"`,
        );
      }
    }

    compiled.push({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      audience: spec.audience,
      subject: spec.subject,
      preview_text: spec.preview,
      html: sanitized,
      text: toText(bodyHtml),
      variables: allVariables(spec as EmailClassSpec<unknown>),
      variable_specs: spec.variables.map((v) => ({
        name: v.name,
        required: v.required,
        description: v.description,
        bound: v.bound ?? null,
        machine: Boolean(v.machine),
      })),
      permitted_senders: spec.permittedSenders,
      purpose: spec.purpose,
      verifiable: spec.verifiable,
    });
  }

  if (failures.length) {
    console.error(
      '\nCompile failed:\n' + failures.map((f) => `  · ${f}`).join('\n') + '\n',
    );
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        _generated:
          'frontend/scripts/compile-email-templates.ts — do not edit by hand',
        _source: 'frontend/src/emails',
        classes: compiled,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`Compiled ${compiled.length} email classes -> ${outPath}`);
  for (const c of compiled) {
    console.log(
      `  ${c.id.padEnd(28)} html ${String(c.html.length).padStart(6)}B` +
        `  text ${String(c.text.length).padStart(5)}B` +
        `  vars ${c.variables.length}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
