import { ImageResponse } from 'next/og';

/** Default social preview: institutional, no fabricated claims. 1200×630. */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#0A0A0F',
          color: '#FAFAFA',
          fontFamily: 'Inter, Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 800,
            }}
          >
            ✓
          </div>
          <div style={{ fontSize: 24, letterSpacing: 6, fontWeight: 700 }}>RELIASTRA</div>
        </div>
        <div style={{ marginTop: 32, fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>
          Know when your dependencies fail.
          <br />
          Prove what happened.
        </div>
        <div style={{ marginTop: 20, fontSize: 26, color: '#A1A1AA' }}>
          External Dependency Intelligence · reliastra.com
        </div>
      </div>
    ),
    { ...size }
  );
}
