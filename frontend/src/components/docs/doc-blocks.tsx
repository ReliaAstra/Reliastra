import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { DocBlock } from '@/lib/docs/types';
import { CodeBlock } from './code-block';

/**
 * The block renderer for every documentation guide.
 *
 * Typography lives in the `.ob-prose` scope so a guide reads like the research
 * pages and the product page - one scale, one link treatment, one list style.
 * What this file adds is the block vocabulary: code, tables, callouts and field
 * lists, each of which has exactly one presentation.
 */

/**
 * Inline markup: `code`, **bold**, and [links](https://…).
 *
 * Deliberately three forms and no more. A docs corpus with a fourth would need
 * a parser, and a docs corpus that needs a parser is describing its rendering
 * instead of its subject.
 */
export function inline(text: string, keyPrefix = 'i'): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      const label = token.slice(1, token.indexOf(']'));
      const href = token.slice(token.indexOf('(') + 1, -1);
      const external = /^https?:/.test(href);
      nodes.push(
        <a
          key={key}
          href={href}
          className="ob-link"
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {label}
        </a>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const NOTE_STYLE: Record<string, { rule: string; label: string }> = {
  info: { rule: 'border-l-[var(--ob-signal)]', label: 'Note' },
  note: { rule: 'border-l-[var(--ob-line-3)]', label: 'Note' },
  warn: { rule: 'border-l-[var(--ob-critical)]', label: 'Careful' },
};

function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case 'p':
      return <p>{inline(block.text)}</p>;

    case 'code':
      return (
        <CodeBlock code={block.code} lang={block.lang} caption={block.caption} />
      );

    case 'list': {
      const items = block.items.map((item, i) => <li key={i}>{inline(item, `li-${i}`)}</li>);
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }

    case 'table':
      return (
        <figure className="not-prose my-8">
          <div className="ob-scroll-x overflow-x-auto border border-[var(--ob-line)]">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-[var(--ob-line-2)]">
                  {block.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="ob-label whitespace-nowrap px-4 py-3 text-left align-bottom"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r} className="border-b border-[var(--ob-line)] last:border-0">
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={cn(
                          'px-4 py-3 align-top leading-[1.6] text-[var(--ob-text-3)]',
                          c === 0 && 'text-[var(--ob-text-2)]'
                        )}
                      >
                        {inline(cell, `t-${r}-${c}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.caption && <figcaption className="ob-small mt-3">{block.caption}</figcaption>}
        </figure>
      );

    case 'note': {
      const style = NOTE_STYLE[block.tone] ?? NOTE_STYLE.note;
      return (
        <aside
          className={cn(
            'not-prose my-8 border-l-2 bg-[var(--ob-raised)] px-5 py-4',
            style.rule
          )}
        >
          <p className="ob-label mb-2">{block.title ?? style.label}</p>
          <p className="max-w-[62ch] text-[14px] leading-[1.65] text-[var(--ob-text-3)]">
            {inline(block.text)}
          </p>
        </aside>
      );
    }

    case 'definitions':
      return (
        <dl className="not-prose my-8 flex flex-col">
          {block.items.map((item) => (
            <div
              key={item.term}
              className="grid gap-1.5 border-t border-[var(--ob-line)] py-5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-8"
            >
              <dt className="text-[14px] font-semibold text-[var(--ob-text)]">{item.term}</dt>
              <dd className="max-w-[62ch] text-[14px] leading-[1.65] text-[var(--ob-text-3)]">
                {inline(item.def)}
              </dd>
            </div>
          ))}
        </dl>
      );

    case 'fields':
      return (
        <dl className="not-prose my-8 flex flex-col">
          {block.items.map((item) => (
            <div key={item.field} className="border-t border-[var(--ob-line)] py-5">
              <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <code className="font-mono text-[13.5px] font-medium text-[var(--ob-text)]">
                  {item.field}
                </code>
                {item.type && <span className="ob-label">{item.type}</span>}
              </dt>
              <dd className="mt-2 max-w-[64ch] text-[14px] leading-[1.65] text-[var(--ob-text-3)]">
                {inline(item.def)}
              </dd>
            </div>
          ))}
        </dl>
      );

    case 'steps':
      return (
        <ol className="not-prose my-8 flex flex-col gap-8">
          {block.items.map((item, i) => (
            <li key={item.title} className="border-t border-[var(--ob-line)] pt-5">
              <div className="flex items-baseline gap-3">
                <span className="ob-label ob-label-signal">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-[15.5px] font-semibold tracking-[-0.01em] text-[var(--ob-text)]">
                  {item.title}
                </h3>
              </div>
              <div className="mt-3 pl-[calc(0.6875rem*2+0.75rem)]">
                <p className="max-w-[62ch] text-[14px] leading-[1.65] text-[var(--ob-text-3)]">
                  {inline(item.text)}
                </p>
                {item.code && (
                  <CodeBlock code={item.code.code} lang={item.code.lang} />
                )}
              </div>
            </li>
          ))}
        </ol>
      );

    default:
      return null;
  }
}

export function DocBlocks({ blocks }: { blocks: DocBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </>
  );
}
