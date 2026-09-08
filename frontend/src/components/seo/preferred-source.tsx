'use client';

import Script from 'next/script';

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
 * - Non-blocking: publisher.js is loaded only where this widget is rendered
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
      <Script src="https://news.google.com/swg/js/v1/publisher.js" strategy="afterInteractive" />
      {/* Google enhances this div when publisher.js loads */}
      <div {...({ 'google-add-preferred-source-btn': '' } as any)} data-theme={theme} data-lang={lang} />
      {/* Fallback for no-JS / script blocked - invisible when JS enhances */}
      <noscript>
        <a
          href="https://news.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="ob-small underline underline-offset-4"
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
    body: 'If you find RELIASTRA’s independent infrastructure intelligence useful, add us as a Preferred Source - you’ll see future incident analysis and dependency research more often when you search.',
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
 * Subtle, high-trust, compact - brutalist/premium, not popup.
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
        // Hairline block, not a card: consistent with every other module on
        // the public site.
        'border-t border-[var(--ob-line)] pt-6',
        className ?? '',
      ].join(' ')}
    >
      <p className="ob-label">{copy.eyebrow}</p>
      <h2
        id={titleId}
        className="mt-3 text-[15px] font-semibold tracking-[-0.01em] text-[var(--ob-text)]"
      >
        {copy.title}
      </h2>
      <p className="mt-2 max-w-[68ch] text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
        {copy.body}
      </p>
      <div className="mt-5">
        <PreferredSourceButton lang={lang} />
      </div>
      <p className="ob-small mt-3">
        Powered by Google - you choose your sources.
      </p>
    </section>
  );
}
