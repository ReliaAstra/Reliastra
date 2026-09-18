'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A code block with a copy control.
 *
 * The one client component in the docs. It is small on purpose: the copy
 * button needs state, everything else in a guide is static markup that renders
 * on the server, and a documentation page that hydrates its prose is a
 * documentation page that feels slow.
 *
 * The copy control reports failure honestly. `navigator.clipboard` is
 * unavailable over plain HTTP and in some embedded webviews, and a button that
 * silently does nothing when you press it is worse than one that tells you to
 * select the text yourself.
 */
export function CodeBlock({
  code,
  lang,
  caption,
}: {
  code: string;
  lang?: string;
  caption?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2000);
  };

  return (
    <figure className="not-prose my-7">
      {(caption || lang) && (
        <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {caption ? (
            <span className="ob-label text-[var(--ob-text-3)]">{caption}</span>
          ) : (
            <span />
          )}
          {lang && <span className="ob-label">{lang}</span>}
        </figcaption>
      )}
      <div className="group relative border border-[var(--ob-line)] bg-[var(--ob-void)]">
        <button
          type="button"
          onClick={copy}
          className={cn(
            'absolute right-2 top-2 z-10 border border-[var(--ob-line-2)] bg-[var(--ob-raised)] px-2.5 py-1',
            'font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ob-text-3)]',
            'transition-colors hover:border-[var(--ob-line-3)] hover:text-[var(--ob-text)]',
            'focus-visible:border-[var(--ob-signal)]'
          )}
          aria-label={caption ? `Copy: ${caption}` : 'Copy code'}
        >
          {state === 'copied' ? 'copied' : state === 'failed' ? 'select manually' : 'copy'}
        </button>
        <pre className="ob-scroll-x overflow-x-auto p-5 pr-24 text-[12.5px] leading-[1.7]">
          <code className="font-mono text-[var(--ob-text-2)]">{code}</code>
        </pre>
      </div>
    </figure>
  );
}
