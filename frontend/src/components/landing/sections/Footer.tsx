'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Github } from 'lucide-react';
import { BrandLogo } from '@/components/landing/shared/BrandLogo';
import {
  EXTERNAL_LINKS,
  PUBLIC_ROUTES,
  RESEARCH_ARTICLES,
  partnerUrl,
  researchRoute,
} from '@/lib/routes';

const ease = [0.25, 0.1, 0.25, 1] as const;

/**
 * Footer navigation.
 *
 * Three correctness rules this list now follows, all of which it previously
 * broke:
 *
 * 1. Every destination is a real URL. The old entries were `<button>`s wired to
 *    `scrollToId('solution')` and `scrollToId('partners')` — ids that exist
 *    only inside section components the landing page does not render. Because
 *    `scrollToId` falls back to scrolling to the top when the id is missing,
 *    those links were dead but still *looked* like they worked.
 * 2. Research links are generated from `RESEARCH_ARTICLES`, the same constant
 *    that produces the `/research/[slug]` routes, so the footer cannot link to
 *    a slug that 404s.
 * 3. "Join as partner" goes to partner signup, not `/signup`. `/signup` is the
 *    customer registration form and never creates a partner profile, so the old
 *    link silently enrolled visitors as customers instead of partners.
 */
const FOOTER_LINKS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Overview', href: PUBLIC_ROUTES.product },
      {
        label: 'External Dependency Intelligence',
        href: PUBLIC_ROUTES.externalDependencyIntelligence,
      },
      { label: 'Dependency Monitoring', href: PUBLIC_ROUTES.dependencyMonitoring },
      { label: 'SLA Evidence', href: PUBLIC_ROUTES.slaEvidence },
      { label: 'Incident Evidence', href: PUBLIC_ROUTES.incidentEvidence },
      { label: 'Vendor Tracking', href: PUBLIC_ROUTES.track },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: PUBLIC_ROUTES.docs },
      { label: 'Research Home', href: PUBLIC_ROUTES.research },
      ...RESEARCH_ARTICLES.map((article) => ({
        label:
          article.slug === 'the-dependency-gap'
            ? 'The Dependency Gap'
            : article.slug === 'how-reliastra-measures-vendor-reliability'
              ? 'Measurement Methodology'
              : 'Research Agenda',
        href: researchRoute(article.slug),
      })),
      { label: 'Glossary', href: PUBLIC_ROUTES.glossary },
      { label: 'Status', href: PUBLIC_ROUTES.status },
      { label: 'Security', href: PUBLIC_ROUTES.security },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: PUBLIC_ROUTES.about },
      { label: 'Contact', href: PUBLIC_ROUTES.contact },
      { label: 'Support', href: partnerUrl('support') },
    ],
  },
  {
    title: 'Business',
    links: [
      { label: 'Pricing', href: PUBLIC_ROUTES.pricing },
      { label: 'Partner Network', href: PUBLIC_ROUTES.partner },
      { label: 'Join as partner', href: partnerUrl('signup') },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: PUBLIC_ROUTES.privacy },
      { label: 'Terms of Service', href: PUBLIC_ROUTES.terms },
    ],
  },
];

const SOCIAL_LINKS = [
  { icon: Github, href: EXTERNAL_LINKS.github, label: 'GitHub' },
];

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#0A0A0F] pb-10 pt-20">
      <div className="mx-auto max-w-[1200px] px-6 md:px-12">
        <div className="grid grid-cols-2 gap-12 md:grid-cols-2 lg:grid-cols-6">
          <motion.div
            className="col-span-2 lg:col-span-1"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, ease }}
          >
            <BrandLogo className="text-white" size="lg" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/40">
              External Dependency Intelligence. Monitor, correlate, and prove vendor SLA breaches.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-white/30 transition-all duration-200 hover:bg-white/5 hover:text-white"
                  aria-label={social.label}
                >
                  <social.icon className="h-5 w-5" aria-hidden="true" />
                </a>
              ))}
            </div>
          </motion.div>

          {FOOTER_LINKS.map((col, i) => (
            <motion.div
              key={col.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: (i + 1) * 0.08, ease }}
            >
              <h4 className="mb-4 text-sm font-semibold text-white">{col.title}</h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/40 transition-colors duration-200 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} Reliastra, Inc. All rights reserved.
          </p>
          <Link
            href={PUBLIC_ROUTES.track}
            className="text-xs text-white/40 transition-colors hover:text-white"
          >
            System status
          </Link>
        </div>
      </div>
    </footer>
  );
}
