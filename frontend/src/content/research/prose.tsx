import type { ReactNode } from 'react';

/**
 * Semantic-only wrappers for research prose.
 *
 * These exist so article content contains content and nothing else. All
 * typography comes from the `.ob-prose` block in globals.css; a body file that
 * carries colour or spacing classes cannot be restyled without editing every
 * paragraph of every paper.
 */

export const P = ({ children }: { children: ReactNode }) => <p>{children}</p>;

export const H = ({ children }: { children: ReactNode }) => <h2>{children}</h2>;

export const H3 = ({ children }: { children: ReactNode }) => <h3>{children}</h3>;

export const LI = ({ children }: { children: ReactNode }) => <li>{children}</li>;

export const CODE = ({ children }: { children: ReactNode }) => <code>{children}</code>;

export const PRE = ({ children }: { children: ReactNode }) => (
  <pre>
    <code>{children}</code>
  </pre>
);

export const UL = ({ children }: { children: ReactNode }) => <ul>{children}</ul>;

export const OL = ({ children }: { children: ReactNode }) => <ol>{children}</ol>;

export const STRONG = ({ children }: { children: ReactNode }) => <strong>{children}</strong>;
