import type { Metadata } from 'next';

import { loadCompiled } from '@/lib/email-compiled';

/**
 * Development-only preview harness for the transactional email design system.
 *
 * Unauthenticated by design and gated to non-production, because it renders
 * customer-facing templates that must never be reachable on a live domain. It
 * exists so the design can be reviewed in a real browser at true email-client
 * width - a screenshot of the compiled artefact, not a mock of it.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Email design system · preview',
  robots: { index: false, follow: false },
};

const AUDIENCE_TONE: Record<string, string> = {
  customer: '#2563EB',
  prospect: '#7C3AED',
  vendor: '#0891B2',
  internal: '#B45309',
};

export default async function EmailPreviewIndex() {
  const book = await loadCompiled();

  if (!book) {
    return (
      <main style={shell}>
        <h1 style={h1}>Compiled templates not found</h1>
        <p style={p}>
          Run <code style={code}>npm run emails:compile</code> in{' '}
          <code style={code}>frontend/</code> to generate{' '}
          <code style={code}>backend/app/modules/email_center/compiled_templates.json</code>.
        </p>
      </main>
    );
  }

  return (
    <main style={shell}>
      <header style={{ marginBottom: 28 }}>
        <p style={eyebrow}>RELIASTRA · TRANSACTIONAL EMAIL DESIGN SYSTEM</p>
        <h1 style={h1}>Nine message classes</h1>
        <p style={p}>
          Every card renders the compiled artefact — the exact bytes the backend
          seeds and sends, after its sanitizer allowlist. Preview values are
          fabricated for layout demonstration; none of them is production
          telemetry.
        </p>
      </header>

      <div style={{ display: 'grid', gap: 20 }}>
        {book.classes.map((c) => (
          <a
            key={c.id}
            href={`/dev/email-preview/${c.id}`}
            style={{
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              border: '1px solid #1E293B',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#0B0F19',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 18px',
                borderBottom: '1px solid #1E293B',
              }}
            >
              <span
                style={{
                  font: '600 10px/1 ui-monospace, Consolas, monospace',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: AUDIENCE_TONE[c.audience] ?? '#64748B',
                  border: `1px solid ${AUDIENCE_TONE[c.audience] ?? '#64748B'}44`,
                  borderRadius: 3,
                  padding: '5px 8px',
                }}
              >
                {c.audience}
              </span>
              <span style={{ color: '#F8FAFC', fontSize: 15, fontWeight: 600 }}>
                {c.name}
              </span>
              <code
                style={{
                  marginLeft: 'auto',
                  color: '#64748B',
                  font: "11px/1 ui-monospace, Consolas, monospace",
                }}
              >
                {c.id}
              </code>
            </div>

            <div style={{ padding: '14px 18px', color: '#94A3B8', fontSize: 13 }}>
              {c.description}
            </div>

            <iframe
              src={`/dev/email-preview/${c.id}?embed=1`}
              title={c.name}
              style={{
                width: '100%',
                height: 620,
                border: 0,
                borderTop: '1px solid #1E293B',
                background: '#FBFBFC',
              }}
              scrolling="no"
            />
          </a>
        ))}
      </div>
    </main>
  );
}

const shell: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0B0F19',
  color: '#E2E8F0',
  padding: '40px 32px 80px',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif",
};

const h1: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: '#F8FAFC',
  margin: '8px 0 10px',
};

const p: React.CSSProperties = {
  fontSize: 14,
  lineHeight: '22px',
  color: '#94A3B8',
  maxWidth: '72ch',
  margin: 0,
};

const eyebrow: React.CSSProperties = {
  font: "600 10px/1 ui-monospace, Consolas, monospace",
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: '#64748B',
  margin: 0,
};

const code: React.CSSProperties = {
  font: '12px ui-monospace, Consolas, monospace',
  background: '#111726',
  border: '1px solid #1E293B',
  borderRadius: 4,
  padding: '2px 6px',
  color: '#CBD5E1',
};
