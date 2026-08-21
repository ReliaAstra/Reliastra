'use client';

import { motion } from 'framer-motion';
import { Github } from 'lucide-react';
import { BrandLogo } from '@/components/landing/shared/BrandLogo';
import { goTo, scrollToId } from '@/components/landing/theme';

const ease = [0.25, 0.1, 0.25, 1] as const;

const FOOTER_LINKS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', action: () => scrollToId('solution') },
      { label: 'Pricing', action: () => scrollToId('pricing') },
      { label: 'Vendor Intelligence', action: () => scrollToId('live') },
      { label: 'Partners', action: () => scrollToId('partners') },
      { label: 'Status', action: () => scrollToId('live') },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Support', action: () => goTo('support') },
      { label: 'Contact', action: () => goTo('support') },
      { label: 'Apply to Partner', action: () => goTo('apply') },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', action: () => goTo('privacy') },
      { label: 'Terms of Service', action: () => goTo('terms') },
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
        <div className="grid grid-cols-2 gap-12 md:grid-cols-4">
          <motion.div
            className="col-span-2 md:col-span-1"
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
                    <button
                      onClick={link.action}
                      className="text-sm text-white/40 transition-colors duration-200 hover:text-white"
                    >
                      {link.label}
                    </button>
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
          <button
            onClick={() => scrollToId('live')}
            className="text-xs text-white/40 transition-colors hover:text-white"
          >
            System status
          </button>
        </div>
      </div>
    </footer>
  );
}
