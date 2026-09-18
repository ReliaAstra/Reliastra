import Link from 'next/link';
import { cn } from '@/lib/utils';
import { DOCS_NAV } from '@/components/site/nav-config';

/**
 * Documentation side navigation.
 *
 * A server component with no state: the guide list is a contract, not an
 * interaction. On narrow viewports it becomes a horizontal scroll rail rather
 * than a drawer, because a reader moving between adjacent guides should not
 * have to open and close a menu each time.
 */
export function DocsSideNav({ activeHref }: { activeHref: string }) {
  return (
    <nav aria-label="Documentation" className="lg:sticky lg:top-[100px] lg:self-start">
      <p className="ob-label mb-4 hidden lg:block">Documentation</p>

      {/* Narrow: a rail that stays readable and scrolls. */}
      <ul className="ob-scroll-x -mx-[var(--ob-gutter)] flex gap-2 overflow-x-auto px-[var(--ob-gutter)] pb-2 lg:hidden">
        {DOCS_NAV.map((link) => {
          const active = link.href === activeHref;
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-block whitespace-nowrap border px-3 py-2 text-[12.5px] font-medium transition-colors',
                  active
                    ? 'border-[var(--ob-signal)] bg-[var(--ob-signal-wash)] text-[var(--ob-text)]'
                    : 'border-[var(--ob-line)] text-[var(--ob-text-3)] hover:border-[var(--ob-line-3)] hover:text-[var(--ob-text)]'
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Wide: the spine, always in view. */}
      <ul className="hidden flex-col lg:flex">
        {DOCS_NAV.map((link) => {
          const active = link.href === activeHref;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block border-l py-2 pl-4 text-[13px] transition-colors',
                  active
                    ? 'border-l-[var(--ob-signal)] font-medium text-[var(--ob-text)]'
                    : 'border-l-[var(--ob-line)] text-[var(--ob-text-4)] hover:border-l-[var(--ob-line-3)] hover:text-[var(--ob-text-2)]'
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
