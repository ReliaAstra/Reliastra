import { Children, isValidElement, type ReactNode } from 'react';
import { RESEARCH_ARTICLE_BODIES } from '@/content/research-articles';

/**
 * Derived metadata for research articles.
 *
 * Reading time is COMPUTED from the actual article tree, not typed in by
 * hand. A hardcoded "5 min read" is a small lie that goes stale the first
 * time anyone edits a paragraph, and on a publication whose entire pitch is
 * "our numbers are checkable" that is not an acceptable default.
 */

/** Recursively collect the visible text of a React tree. */
export function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(' ');
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return Children.toArray(node.props.children).map(extractText).join(' ');
  }
  return '';
}

export function wordCount(node: ReactNode): number {
  const text = extractText(node)
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/** Adult technical reading pace, rounded up, floored at one minute. */
export function readingMinutes(node: ReactNode): number {
  return Math.max(1, Math.ceil(wordCount(node) / 225));
}

/** "6 min read" for a published slug; empty string for an unknown slug. */
export function readingTimeFor(slug: string): string {
  const article = RESEARCH_ARTICLE_BODIES[slug];
  if (!article) return '';
  const minutes = readingMinutes([
    article.body,
    article.evidence,
    article.methodology,
  ]);
  return `${minutes} min read`;
}

/**
 * Dates are rendered in an unambiguous, non-localised form (14 November 2025).
 * A `MM/DD` date on a page read by engineers in five countries is a defect.
 */
export function formatArticleDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** ISO date for `<time dateTime>` and structured data. */
export function isoDate(iso: string): string {
  return iso.slice(0, 10);
}
