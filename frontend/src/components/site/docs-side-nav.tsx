import Link from 'next/link';
import { DOCS_NAV } from '@/components/site/nav-config';
import { cn } from '@/lib/utils';

/**
 * Documentation side navigation.
 *
 * Server component. The active page is passed in rather than read from the
 * router, which keeps this free of client JavaScript: the docs are read more
 * than they are navigated, and a sticky rail that costs a hydration pass on
 * every guide is a bad trade.
 *
 * Two layouts, not one scaled down:
 *   - desktop: a sticky rail beside the prose
 *   - narrow:  a horizontal scroller above the prose, so the spine stays
 *     reachable without a collapsed desktop column squeezed into 360px
 *
 * The narrow rail is deliberately a scroller rather than a wrap: five short
 * labels on one line is a spine the eye can sweep, where a wrapped block is a
 * paragraph of links that reads as unrelated content.
 */
export function DocsSideNav({ activeHref }: { activeHref: string }) {
  return (
    <nav aria-label="Documentation" className="ob-docs-nav">
      <p className="ob-label ob-docs-nav-title">Documentation</p>

      {/* Narrow viewports: horizontal scroller above the prose. */}
      <ul className="ob-docs-nav-scroll lg:hidden">
        {DOCS_NAV.map((item) => {
          const active = item.href === activeHref;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn('ob-docs-nav-pill', active && 'is-active')}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop: sticky rail. */}
      <ul className="ob-docs-nav-rail hidden lg:flex">
        {DOCS_NAV.map((item) => {
          const active = item.href === activeHref;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn('ob-docs-nav-link', active && 'is-active')}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
