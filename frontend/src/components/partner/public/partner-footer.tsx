'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ReliastraLogo } from '../shared/reliastra-logo';

const footerSections: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Program',
    links: [
      { label: 'Overview', href: '/partner' },
      { label: 'How It Works', href: '/partner/how-it-works' },
      { label: 'Commission', href: '/partner/commission' },
      { label: 'Earn', href: '/partner/earn' },
      { label: 'Resources', href: '/partner/resources' },
      { label: 'Premium', href: '/partner/premium' },
      { label: 'FAQ', href: '/partner/faq' },
      { label: 'Tiers', href: '/partner/tiers' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Join as partner', href: '/partner/signup' },
      { label: 'Log in', href: '/partner/login' },
      { label: 'Sign up', href: '/partner/signup' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '/partner/privacy' },
      { label: 'Terms', href: '/partner/terms' },
    ],
  },
];

function FooterLink({ label, href }: { label: string; href: string }) {
  return (
    <motion.div whileHover={{ x: 2 }} transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const }}>
      <Link
        href={href}
        className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        {label}
      </Link>
    </motion.div>
  );
}

export function PartnerFooter() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-background">
      {/* Gradient top line */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-2 lg:col-span-1">
            <Link
              href="/partner"
              className="mb-4 flex items-center transition-opacity hover:opacity-70"
              aria-label="Partner network home"
            >
              <ReliastraLogo size="sm" />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              A premium partnership program for consultants, agencies, and
              technology advisors. Turn your infrastructure expertise into
              recurring revenue with RELIASTRA.
            </p>
            <Link
              href="/partner/resources"
              className="mt-4 inline-block text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Resources →
            </Link>
          </div>

          {/* Link columns */}
          {footerSections.map((section) => (
            <div key={section.heading}>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.heading}
              </h4>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={`${section.heading}-${link.label}`}>
                    <FooterLink label={link.label} href={link.href} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Thin separator */}
        <div className="my-8 h-px w-full bg-border/40" />

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} RELIASTRA. All rights reserved.
          </p>
          <div className="flex items-center gap-5">
            {/* Social profiles: only the canonical GitHub organization is
                linked. No per-network handles are invented here - entity
                consistency (see lib/seo SITE_ORG) beats icon count. */}
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/ReliaAstra"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/50 transition-colors hover:text-foreground"
                aria-label="GitHub"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
              </a>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40">
              v1.1
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
