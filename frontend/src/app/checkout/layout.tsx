import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';

import { BrandMark } from '@/components/auth/brand-mark';
import { CheckoutProviders } from '@/components/checkout/checkout-providers';

export const metadata: Metadata = {
  title: 'Checkout',
  description:
    'Complete your RELIASTRA subscription: the exact amount, the currency it is charged in, and a secure payment experience.',
  // A checkout must never leak into a shared preview, a cache, or a crawler:
  // it carries an organization's name, its billing email and its price.
  robots: { index: false, follow: false },
};

/**
 * Checkout chrome.
 *
 * A deliberately narrow frame: the RELIASTRA masthead, a lock that says who is
 * taking the money, and nothing else. No marketing nav, no footer sitemap, no
 * theme switch, no route back into the product's other surfaces — every one of
 * those is a way to leave a payment half-finished. The provider is named at the
 * top rather than only inside a form, because "who is charging me" should be
 * answerable before the first click, not after.
 */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <CheckoutProviders>
      <div className="min-h-dvh bg-rs-base text-rs-text">
        <header className="border-b border-rs-border-subtle bg-rs-elevated">
          <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <Link href="/" aria-label="RELIASTRA home" className="inline-flex">
              <BrandMark size={22} />
            </Link>
            <p className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-rs-text-tertiary">
              <Lock size={12} aria-hidden="true" className="text-rs-up" />
              <span className="hidden sm:inline">Secure payment by Paystack</span>
              <span className="sm:hidden">Secure payment</span>
            </p>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1080px] px-5 pb-16 pt-7 sm:px-8 sm:pt-10">
          {children}
        </main>

        <footer className="mx-auto w-full max-w-[1080px] px-5 pb-10 sm:px-8">
          <p className="text-[11.5px] leading-relaxed text-rs-text-tertiary">
            Questions about an invoice or a charge?{' '}
            <a
              href="mailto:billing@reliastra.com"
              className="font-medium text-rs-text-secondary underline underline-offset-2"
            >
              billing@reliastra.com
            </a>
            {' · '}
            <Link
              href="/privacy"
              className="font-medium text-rs-text-secondary underline underline-offset-2"
            >
              Privacy
            </Link>
            {' · '}
            <Link
              href="/terms"
              className="font-medium text-rs-text-secondary underline underline-offset-2"
            >
              Terms
            </Link>
          </p>
        </footer>
      </div>
    </CheckoutProviders>
  );
}
