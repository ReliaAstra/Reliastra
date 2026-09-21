/**
 * Documentation content model.
 *
 * Docs are data, not JSX, for one reason: a guide that is a React component
 * drifts. Nothing can check it, nothing can reuse it, and the moment there are
 * thirteen of them each one invents its own heading level and its own code
 * block. As data, the same corpus feeds the page renderer, the side navigation,
 * `llms-full.txt` and the docs test that asserts every command shown in a guide
 * exists in the CLI.
 *
 * Blocks are deliberately few. Every one of these renders, and a guide that
 * needs something else should reconsider whether it needs it.
 *
 * The corpus feeds four surfaces, and `lib/docs/markdown.ts` is the renderer
 * for the two machine-readable ones:
 *   1. `app/docs/[slug]/page.tsx`    - the rendered guide (components/docs/doc-blocks.tsx)
 *   2. `components/docs/docs-side-nav.tsx` - the navigation
 *   3. `app/docs-md/[slug]/route.ts` - `/docs/<slug>.md`, plain Markdown
 *   4. `app/llms-full.txt/route.ts`  - the whole corpus, inlined
 *
 * Adding a variant to `DocBlock` therefore has four places to satisfy. The
 * Markdown renderer ends its switch on a `never` assertion, so a new variant
 * fails the build there rather than silently vanishing from both
 * machine-readable surfaces - and `__tests__/docs-markdown.test.ts` asserts
 * every field of every variant reaches the output.
 */

export type DocBlock =
  /** A paragraph. Inline `code` and **bold** are parsed by the renderer. */
  | { kind: 'p'; text: string }
  /** A block of code with an optional caption. `lang` drives syntax hints only. */
  | { kind: 'code'; lang: string; code: string; caption?: string }
  /** A bulleted or numbered list. Items support the same inline markup. */
  | { kind: 'list'; items: string[]; ordered?: boolean }
  /** A table. First row of `rows` is data; `columns` are the headers. */
  | { kind: 'table'; columns: string[]; rows: string[][]; caption?: string }
  /** A short emphasised note. `tone` controls the rule colour, nothing else. */
  | { kind: 'note'; tone: 'note' | 'warn' | 'info'; title?: string; text: string }
  /** Term/definition pairs - the shape most reference material actually has. */
  | { kind: 'definitions'; items: { term: string; def: string }[] }
  /** Numbered procedure with an optional command per step. */
  | { kind: 'steps'; items: { title: string; text: string; code?: { lang: string; code: string } }[] }
  /** A field list for one API object or configuration key set. */
  | { kind: 'fields'; items: { field: string; type?: string; def: string }[] };

export type DocSection = {
  /** Anchor id. Used by the table of contents and by inbound links. */
  id: string;
  heading: string;
  blocks: DocBlock[];
};

export type Doc = {
  slug: string;
  title: string;
  /** One line: what a reader gets from this page. Used in listings and metadata. */
  summary: string;
  /** Grouping on the docs index. */
  group: 'Start' | 'Operate' | 'Integrate' | 'Reference';
  sections: DocSection[];
};
