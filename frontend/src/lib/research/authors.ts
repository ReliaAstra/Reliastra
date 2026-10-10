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

import { SITE_URL } from '@/lib/site-url';

export type ResearchAuthor = {
  id: string;
  name: string;
  /**
   * Other published forms of the same person's name, for the same identity.
   *
   * A name is not a unique identifier and searchers do not agree on its order:
   * "Adeshina Emmanuel" and "Emmanuel Adeshina" are the same engineer, and a
   * `Person` node carrying only one of them gives an entity matcher nothing to
   * join on. Only forms this person actually publishes are listed.
   */
  alternateName?: string[];
  /** Role as it should appear in the byline. */
  role: string;
  /** 2-3 sentences. Claims must be things the published work demonstrates. */
  bio: string;
  /** Absolute URL of the author profile, when one is published. */
  url?: string;
  /** Public profile image, when one is available. */
  image?: string;
  /** Absolute URL, used for `sameAs` in structured data. */
  sameAs?: string[];
  /** Areas the author is accountable for, used on the research index. */
  domains?: string[];
};

/**
 * Declared authors.
 *
 * Intentionally short. Publishing a paper under a name RELIASTRA has not
 * confirmed would be exactly the class of unsupported claim the research
 * agenda forbids, and `Person` structured data carrying a fabricated name is
 * worse than no `Person` at all: it propagates.
 *
 * To add an author, append a record here and set `author` on the paper. The
 * byline, the `Person` node, the author block and the citation string all
 * follow from that one entry.
 *
 * A declared author does not retro-byline the corpus: papers published before
 * this registry had an entry keep the imprint, which is a true statement about
 * how they were published.
 */
export const RESEARCH_AUTHORS: readonly ResearchAuthor[] = [
  {
    id: 'adeshina-emmanuel',
    name: 'Adeshina Emmanuel',
    alternateName: ['Emmanuel Adeshina'],
    role: 'AI and Cloud Infrastructure Security Engineer',
    bio:
      'Adeshina Emmanuel is an infrastructure security engineer working across cloud identity, ' +
      'Kubernetes, AI systems, and the measurement systems that verify them. He architects and ' +
      'builds the RELIASTRA platform - the probe network, the Go CLI, the evidence pipeline - and ' +
      'publishes the method alongside the product.',
    url: 'https://reliastra.com/about',
    sameAs: [
      'https://www.linkedin.com/in/emmanueladeshina01',
      'https://x.com/secengineerx01',
      'https://eadeshina.hashnode.dev/',
      'https://hashnode.com/@emmanueladeshina01',
      'https://github.com/EmmanuelAdesina',
    ],
    domains: [
      'AI infrastructure security',
      'Cloud identity and access control',
      'Kubernetes and platform security',
      'Infrastructure architecture',
      'DevSecOps and SRE practice',
      'Measurement integrity',
      'Distributed systems',
    ],
  },
];

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
