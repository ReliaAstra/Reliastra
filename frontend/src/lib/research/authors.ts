/**
 * Research authorship.
 *
 * A research corpus with no named author is a marketing page with a serif
 * font. This registry exists so every paper can carry a real byline, a role,
 * a bio and a profile - and so `Person` structured data is only ever emitted
 * for a person who has been declared here.
 *
 * The rule this module enforces: **no author is inferred.** If a paper names
 * an `author` that is not in `RESEARCH_AUTHORS`, the build fails the corpus
 * test rather than quietly rendering an organisation byline over work that
 * claimed to have a human author. Conversely, an unregistered paper falls
 * back to the organisation and emits `Organization` structured data only -
 * which is a true statement, not a degraded one.
 */

export type ResearchAuthor = {
  id: string;
  name: string;
  /** Role as it should appear in the byline. */
  role: string;
  /** 2-3 sentences. Claims must be things the published work demonstrates. */
  bio: string;
  /** Absolute URL of the author profile, when one is published. */
  url?: string;
  /** Absolute URL, used for `sameAs` in structured data. */
  sameAs?: string[];
  /** Areas the author is accountable for, used on the research index. */
  domains?: string[];
};

/**
 * Declared authors.
 *
 * Intentionally empty until a named human is added. Publishing a paper under
 * a name RELIASTRA has not confirmed would be exactly the class of
 * unsupported claim the research agenda forbids, and `Person` structured data
 * carrying a fabricated name is worse than no `Person` at all: it propagates.
 *
 * To add an author, append a record here and set `author` on the paper. The
 * byline, the `Person` node, the author block and the citation string all
 * follow from that one entry.
 */
export const RESEARCH_AUTHORS: readonly ResearchAuthor[] = [];

/**
 * The publisher of record. Used as byline and as `publisher` whenever a paper
 * has no declared human author.
 */
export const RESEARCH_PUBLISHER = {
  name: 'Reliastra, Inc.',
  brand: 'RELIASTRA',
  imprint: 'RELIASTRA Research',
  url: 'https://reliastra.com',
  logo: 'https://reliastra.com/logo.svg',
} as const;

export function researchAuthor(id: string | undefined): ResearchAuthor | null {
  if (!id) return null;
  return RESEARCH_AUTHORS.find((a) => a.id === id) ?? null;
}

/** True when `id` is a declared author. Used by the corpus test. */
export function isDeclaredAuthor(id: string): boolean {
  return RESEARCH_AUTHORS.some((a) => a.id === id);
}

/**
 * The byline to print. A declared author's name, otherwise the imprint - and
 * never a name that has not been declared.
 */
export function bylineFor(authorId: string | undefined): string {
  return researchAuthor(authorId)?.name ?? RESEARCH_PUBLISHER.imprint;
}

/**
 * A plain-text citation string for the "Cite this paper" block. Deliberately
 * unadorned: an engineer pastes this into a document or an issue.
 */
export function citationFor(opts: {
  title: string;
  authorId?: string;
  publishedAt: string;
  url: string;
}): string {
  const author = researchAuthor(opts.authorId);
  const who = author
    ? `${author.name} (${author.role})`
    : RESEARCH_PUBLISHER.imprint;
  const year = opts.publishedAt.slice(0, 4);
  return `${who}, "${opts.title}", ${RESEARCH_PUBLISHER.name}, ${year}. ${opts.url}`;
}
