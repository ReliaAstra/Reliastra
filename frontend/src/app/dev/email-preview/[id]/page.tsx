import { loadClass } from '@/lib/email-compiled';

/**
 * Renders one compiled email at true 600px measure.
 *
 * `?embed=1` strips the harness chrome so the frame on the index page shows
 * only the message. Without it the same route serves a 1:1 review surface with
 * the subject, preheader and class metadata printed above the message, which is
 * what a screenshot for design review should contain.
 */

export const dynamic = 'force-dynamic';

export default async function EmailPreviewOne({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ embed?: string; view?: string }>;
}) {
  const { id } = await params;
  const { embed, view } = await searchParams;
  const cls = await loadClass(id);

  if (!cls) {
    return (
      <html>
        <body style={{ padding: 40, fontFamily: 'monospace' }}>
          Unknown class: {id}
        </body>
      </html>
    );
  }

  if (view === 'text') {
    return (
      <html>
        <body
          style={{
            margin: 0,
            padding: 24,
            background: '#FFFFFF',
            color: '#111',
            font: "12px/1.6 ui-monospace, Consolas, 'Courier New', monospace",
            whiteSpace: 'pre-wrap',
          }}
        >
          {cls.text}
        </body>
      </html>
    );
  }

  // Raw HTML: this response IS the email, exactly as an MUA would receive it.
  // Serving it as a full document keeps the doctype and head intact so a
  // screenshot matches what a client renders.
  const raw = (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="x-norender" content="1" />
        <title>{cls.name}</title>
      </head>
      <body style={{ margin: 0 }}>
        <div dangerouslySetInnerHTML={{ __html: cls.html }} />
      </body>
    </html>
  );

  if (embed || view === 'embed') return raw;

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>{`${cls.name} · Reliastra email preview`}</title>
      </head>
      <body
        style={{
          margin: 0,
          background: '#0B0F19',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
        }}
      >
        <header style={{ padding: '20px 24px', borderBottom: '1px solid #1E293B' }}>
          <p
            style={{
              margin: 0,
              font: "600 10px/1 ui-monospace, Consolas, monospace",
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#64748B',
            }}
          >
            {cls.name} · {cls.audience} · {cls.id}
          </p>
          <p
            style={{
              margin: '8px 0 0',
              color: '#F8FAFC',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {cls.subject}
          </p>
          <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 12 }}>
            Preheader — {cls.preview_text}
          </p>
          <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 12 }}>
            {cls.variables.length} variables · senders{' '}
            {cls.permitted_senders.join(', ')} · html {cls.html.length}B · text{' '}
            {cls.text.length}B
          </p>
        </header>
        <div style={{ background: '#FBFBFC', padding: 24 }}>
          <iframe
            src={`/dev/email-preview/${id}?view=embed`}
            title={cls.name}
            style={{
              display: 'block',
              margin: '0 auto',
              width: 600,
              height: 1400,
              border: '1px solid #1E293B',
              borderRadius: 8,
              background: '#FBFBFC',
            }}
          />
        </div>
      </body>
    </html>
  );
}
