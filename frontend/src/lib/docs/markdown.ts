/**
 * The documentation corpus, rendered as Markdown.
 *
 * Two consumers, one renderer, because they must never disagree:
 *
 *  - `/docs/<slug>.md` - the plain-text form of a single guide, for an agent
 *    that would rather read text than parse a page.
 *  - `/llms-full.txt` - the whole corpus inline, so a model handed one URL has
 *    the documentation instead of thirteen links to go and fetch.
 *
 * Until this file existed, `/llms-full.txt` published a "Documentation map" of
 * bare label-and-URL pairs while `lib/docs/types.ts` claimed the corpus fed it.
 * The claim was false, and the failure was invisible: the endpoint rendered, was
 * well-formed, and simply did not contain the thing it advertised.
 *
 * Two properties are load-bearing and both are asserted in
 * `__tests__/docs-markdown.test.ts`:
 *
 *  - **Exhaustive.** Every member of the `DocBlock` union is handled, and the
 *    switch closes with a `never` assertion, so adding a block kind to the
 *    corpus breaks the build here rather than silently dropping content from
 *    every machine-readable surface.
 *  - **Lossless.** Every field of every block reaches the output. A renderer
 *    that quietly omits `caption`, or renders a `note` without its `title`, is
 *    worse than no renderer: it produces a confident, incomplete document.
 *
 * The corpus's inline syntax (`code`, **bold**, [label](href)) is already a
 * Markdown subset - `components/docs/doc-blocks.tsx` parses exactly those three
 * forms - so inline text passes through untouched. Translating it would risk
 * mangling text that is already correct.
 */

import type { Doc, DocBlock, DocSection } from './types';

/** Compile-time exhaustiveness. Unreachable at runtime; fails the build if a
 * new `DocBlock` variant is added without a rendering case. */
function assertNever(value: never): never {
  throw new Error(`Unhandled documentation block: ${JSON.stringify(value)}`);
}

/**
 * Escape the one character that would corrupt a pipe table cell.
 *
 * Pipes are the only structural character inside a table body; newlines cannot
 * occur because block fields are single strings.
 */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').trim();
}

function fenced(lang: string, code: string): string {
  return '```' + lang + '\n' + code.trimEnd() + '\n```';
}

/** One block, as Markdown. */
export function blockToMarkdown(block: DocBlock): string {
  switch (block.kind) {
    case 'p':
      return block.text;

    case 'code': {
      const fence = fenced(block.lang, block.code);
      // Caption after the fence, not before: a reader skimming wants the code
      // first, and the caption qualifies it.
      return block.caption ? `${fence}\n\n_${block.caption}_` : fence;
    }

    case 'list':
      return block.items
        .map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${item}`)
        .join('\n');

    case 'table': {
      const header = `| ${block.columns.map(cell).join(' | ')} |`;
      const rule = `| ${block.columns.map(() => '---').join(' | ')} |`;
      const body = block.rows.map((row) => `| ${row.map(cell).join(' | ')} |`);
      const table = [header, rule, ...body].join('\n');
      return block.caption ? `${table}\n\n_${block.caption}_` : table;
    }

    case 'note': {
      const label = block.title ?? (block.tone === 'warn' ? 'Careful' : 'Note');
      // Blockquote, matching the callout's visual weight.
      return [`> **${label}**`, '> ', `> ${block.text}`].join('\n');
    }

    case 'definitions':
      return block.items.map((item) => `- **${item.term}** — ${item.def}`).join('\n');

    case 'fields':
      return block.items
        .map((item) => {
          const type = item.type ? ` \`${item.type}\`` : '';
          return `- \`${item.field}\`${type} — ${item.def}`;
        })
        .join('\n');

    case 'steps':
      return block.items
        .map((item, i) => {
          const head = `${i + 1}. **${item.title}** — ${item.text}`;
          return item.code
            ? `${head}\n\n${indent(fenced(item.code.lang, item.code.code), '   ')}`
            : head;
        })
        .join('\n');

    default:
      return assertNever(block);
  }
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line.length ? prefix + line : line))
    .join('\n');
}

/** One section: an `##` heading above its blocks. */
export function sectionToMarkdown(section: DocSection): string {
  const body = section.blocks.map(blockToMarkdown).filter((s) => s.length > 0);
  // Joined with a blank line between parts; no empty entries, or the joiner
  // and the entry compound into runs of blank lines.
  return [`## ${section.heading}`, ...body].join('\n\n');
}

/**
 * A whole guide as a standalone Markdown document.
 *
 * `level` is the heading level of the guide's **title**; sections sit one level
 * below it. The default is 1, which is right for `/docs/<slug>.md` - a document
 * with exactly one `#`. A consumer that inlines the corpus under its own
 * heading passes a deeper level (`/llms-full.txt` uses 3, so guide titles are
 * `###` beneath its `## Documentation (full text)`), which keeps the outline
 * honest instead of making every guide a sibling of the section containing it.
 */
export function docToMarkdown(doc: Doc, options: { level?: number } = {}): string {
  const level = Math.min(5, Math.max(1, options.level ?? 1));
  // `sectionToMarkdown` emits `##`, so the shift is relative to that.
  const shift = level - 1;

  const sections = doc.sections.map((section) => {
    const md = sectionToMarkdown(section);
    return shift === 0 ? md : shiftHeadings(md, shift);
  });

  return [
    `${'#'.repeat(level)} ${doc.title}`,
    `> ${doc.summary}`,
    ...sections,
  ].join('\n\n');
}

/** Demote `##`/`###` headings by `shift` levels, leaving code fences alone. */
function shiftHeadings(markdown: string, shift: number): string {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^```/.test(line.trim())) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const m = /^(#{2,6})\s+(.*)$/.exec(line);
      if (!m) return line;
      const depth = Math.min(6, m[1].length + shift);
      return '#'.repeat(depth) + ' ' + m[2];
    })
    .join('\n');
}

/**
 * Every guide in reading order, as one document.
 *
 * This is what `/llms-full.txt` inlines. Guides are emitted in corpus order,
 * which is the order the index and the side navigation present them, so the
 * machine-readable text and the human-readable site describe the same sequence.
 */
export function corpusToMarkdown(
  docs: readonly Doc[],
  options: { level?: number } = {}
): string {
  return docs.map((doc) => docToMarkdown(doc, options)).join('\n\n---\n\n');
}
