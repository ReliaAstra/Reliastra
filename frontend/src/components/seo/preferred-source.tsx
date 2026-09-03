'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

type PreferredSourceButtonProps = {
  lang?: string;
  className?: string;
};

/**
 * Google's official Preferred Sources button.
 * Renders <div google-add-preferred-source-btn> which is enhanced by
 * https://news.google.com/swg/js/v1/publisher.js
 *
 * - SSR-safe: renders placeholder with fixed min-height to avoid CLS
 * - Theme-aware: maps RELIASTRA's light/dark to Google's data-theme
 * - Graceful: if script fails, shows subtle fallback copy, no throw
 * - Non-blocking: publisher.js is loaded once in RootLayout with async/afterInteractive
 */
export function PreferredSourceButton({ lang = 'en', className }: PreferredSourceButtonProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Prevent hydration mismatch: next-themes resolves after mount
  const theme: 'light' | 'dark' = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <div
      className={className}
      // Reserve space so Google's rendered button doesn't shift layout
      style={{ minHeight: 32 }}
      aria-label="Add Reliastra as Preferred Source on Google"
    >
      {/* Google enhances this div when publisher.js loads */}
      <div {...({ 'google-add-preferred-source-btn': '' } as any)} data-theme={theme} data-lang={lang} />
      {/* Fallback for no-JS / script blocked — invisible when JS enhances */}
      <noscript>
        <a
          href="https://news.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-500 underline"
        >
          Follow Reliastra on Google News
        </a>
      </noscript>
    </div>
  );
}

type PreferredSourceSectionProps = {
  variant?: 'research' | 'incident' | 'vendor' | 'generic';
  lang?: string;
  className?: string;
};

const COPY: Record<NonNullable<PreferredSourceSectionProps['variant']>, { eyebrow: string; title: string; body: string }> = {
  research: {
    eyebrow: 'Independent research',
    title: 'Follow independent infrastructure research',
    // Trust-based: reader preference, not ranking hack
    body: 'If you find RELIASTRA’s independent infrastructure intelligence useful, add us as a Preferred Source — you’ll see future incident analysis and dependency research more often when you search.',
  },
  incident: {
    eyebrow: 'Incident intelligence',
    title: 'Want future incidents as they happen?',
    body: 'Found this analysis useful? Add RELIASTRA as a Preferred Source to see future infrastructure incidents and dependency degradations more often in your results.',
  },
  vendor: {
    eyebrow: 'Vendor intelligence',
    title: 'Follow this vendor with RELIASTRA',
    body: 'Useful for tracking this vendor? Add RELIASTRA as a Preferred Source to see our independent uptime and incident history more often when you search.',
  },
  generic: {
    eyebrow: 'Preferred Source',
    title: 'Follow RELIASTRA on Google',
    body: 'If you find RELIASTRA’s infrastructure intelligence useful and trustworthy, add us as a Preferred Source to see future research more often in Google.',
  },
};

/**
 * Smart, on-brand CTA around Google's official control.
 * Subtle, high-trust, compact — brutalist/premium, not popup.
 */
export function PreferredSourceSection({ variant = 'generic', lang, className }: PreferredSourceSectionProps) {
  const copy = COPY[variant] ?? COPY.generic;
  const sectionRef = useRef<HTMLElement>(null);
  const titleId = useId();

  // Analytics: track CTA rendered/visible without fabricating conversions
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let fired = false;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !fired) {
            fired = true;
            try {
              // Reuse existing beacon endpoint with distinct path for measurement
              const blob = new Blob([], { type: 'application/json' });
              const url = `/api/v1/public/analytics/visit?path=${encodeURIComponent('/preferred-source/cta-visible')}`;
              if (navigator.sendBeacon) navigator.sendBeacon(url, blob);
              else void fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
            } catch {}
            obs.disconnect();
          }
        });
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-labelledby={titleId}
      className={[
        // Premium, subtle, aligned with RELIASTRA track/vendor cards
        'rounded-xl border border-zinc-200 bg-[#F8F9FA] p-6 dark:border-white/10 dark:bg-[#131318]',
        className ?? '',
      ].join(' ')}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-500">
        {copy.eyebrow}
      </p>
      <h2 id={titleId} className="mt-2 text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">
        {copy.title}
      </h2>
      <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        {copy.body}
      </p>
      <div className="mt-4">
        <PreferredSourceButton lang={lang} />
      </div>
      <p className="mt-2 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
        Powered by Google — you choose your sources.
      </p>
    </section>
  );
}
