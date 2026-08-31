'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Github } from 'lucide-react';
import { BrandLogo } from '@/components/landing/shared/BrandLogo';
import { goTo, goToPartner, scrollToId } from '@/components/landing/theme';

const ease = [0.25, 0.1, 0.25, 1] as const;

const FOOTER_LINKS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', action: () => scrollToId('solution') },
      { label: 'Pricing', action: () => scrollToId('pricing') },
      { label: 'Track', href: '/track' },
      { label: 'Partners', action: () => scrollToId('partners') },
    ],
  },
  {
    title: 'Research',
    links: [
      { label: 'Research Home', href: '/research' },
      { label: 'The Dependency Gap', href: '/research/the-dependency-gap' },
      { label: 'Measurement Methodology', href: '/research/how-reliastra-measures-vendor-reliability' },
      { label: 'Research Agenda', href: '/research/reliastra-research-agenda' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Support', action: () => goTo('support') },
      { label: 'Contact', action: () => goTo('support') },
      { label: 'Join as partner', action: () => goToPartner('signup') },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Guarantee', action: () => goTo('support') },
    ],
  },
];

const SOCIAL_LINKS = [
  { icon: Github, href: 'https://github.com/ReliaAstra', label: 'GitHub' },
];

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#0A0A0F] pb-10 pt-20">
      <div className="mx-auto max-w-[1200px] px-6 md:px-12">
        <div className="grid grid-cols-2 gap-12 md:grid-cols-2 lg:grid-cols-5">
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
                    {'href' in link && link.href ? (
                      <Link
                        href={link.href}
                        className="text-sm text-white/40 transition-colors duration-200 hover:text-white"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <button
                        onClick={link.action}
                        className="text-sm text-white/40 transition-colors duration-200 hover:text-white"
                      >
                        {link.label}
                      </button>
                    )}
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
            href="/track"
            className="text-xs text-white/40 transition-colors hover:text-white"
          >
            System status
          </Link>
        </div>
      </div>
    </footer>
  );
}
