import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SiteHeader } from './site-header';
import { SiteFooter } from './site-footer';

/**
 * The public shell. Every public page renders inside exactly one of these,
 * which is what makes the whole site feel like one company: same chrome, same
 * spacing origin, same colour ground, same skip link, same landmark order.
 *
 * `overHero` is for pages whose first section is a full-bleed image the header
 * should float over. Everything else gets a solid header and the matching top
 * offset so content never hides behind it.
 */
export function SiteShell({
  children,
  overHero = false,
  className,
}: {
  children: ReactNode;
  overHero?: boolean;
  className?: string;
}) {
  return (
    <div className="ob flex min-h-screen flex-col">
      <SiteHeader overHero={overHero} />
      <main
        id="main"
        className={cn('flex-1', !overHero && 'pt-[64px] md:pt-[76px]', className)}
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
