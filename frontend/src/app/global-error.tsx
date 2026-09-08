'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Global error boundary for the public site.
 *
 * Deliberately minimal and self-contained: an error boundary that depends on
 * the component tree which just crashed is not an error boundary. Inline
 * styles guarantee it renders even if the stylesheet was the failure.
 *
 * It shows the framework-provided `digest` - the only identifier that can
 * actually be correlated with a server log - and nothing else. No stack, no
 * message, no request payload: an error page is not a place to leak internals
 * to an anonymous visitor.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to the console without serialising anything user-identifying.
    console.error('[reliastra] unhandled error', error.digest ?? '(no digest)');
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          background: '#08090A',
          color: '#F2F2EE',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <main
          style={{
            width: '100%',
            maxWidth: '640px',
            margin: '0 auto',
            padding: '0 24px',
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '13px',
              letterSpacing: '0.06em',
              color: '#D9A441',
            }}
          >
            HTTP 500
          </p>
          <h1
            style={{
              margin: '18px 0 0',
              fontSize: 'clamp(2.5rem, 8vw, 4.5rem)',
              lineHeight: 0.95,
              letterSpacing: '-0.035em',
              fontWeight: 600,
            }}
          >
            Interrupted.
          </h1>
          <p
            style={{
              margin: '26px 0 0',
              fontSize: '17px',
              lineHeight: 1.6,
              color: '#D6D8D5',
            }}
          >
            An unrecoverable error occurred while rendering this page. The fault
            has been recorded. Monitoring, alerting and evidence generation run
            on separate infrastructure and are unaffected by this failure.
          </p>
          {error.digest && (
            <p
              style={{
                margin: '18px 0 0',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '12px',
                color: '#666B70',
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <div
            style={{
              marginTop: '36px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                appearance: 'none',
                border: 0,
                borderRadius: '2px',
                padding: '12px 22px',
                background: '#D9A441',
                color: '#08090A',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.02em',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
            <Link
              href="/"
              style={{
                borderRadius: '2px',
                padding: '12px 22px',
                border: '1px solid rgba(242,242,238,0.16)',
                color: '#F2F2EE',
                fontSize: '13px',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Return to RELIASTRA
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
