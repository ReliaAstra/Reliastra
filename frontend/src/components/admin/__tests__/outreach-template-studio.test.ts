import { describe, expect, it } from 'vitest';
import {
  buildOutreachEmailHtml,
  buildOutreachText,
  decodeConfig,
  DEFAULT_DRAFT,
  encodeConfig,
} from '@/components/admin/outreach-template-studio';

describe('outreach template compiler', () => {
  it('renders a responsive, email-safe shell with the configured identity and footer', () => {
    const html = buildOutreachEmailHtml({
      ...DEFAULT_DRAFT,
      contentWidth: 680,
      brandName: 'NORTHSTAR / SYSTEMS',
      postalAddress: '14 Meridian Way · Lagos',
      footerAlignment: 'left',
    });

    expect(html).toContain('class="rs-outreach-studio-v1 rs-outreach-config-');
    expect(html).toContain('class="rs-email-shell" width="680"');
    expect(html).toContain('NORTHSTAR / SYSTEMS');
    expect(html).toContain('14 Meridian Way · Lagos');
    expect(html).toContain('href="mailto:support@reliastra.com?subject=Unsubscribe"');
    expect(html).toContain('align="left"');
    expect(html).toContain('bgcolor="#f3f6f9"');
    expect(html).toContain('{{company}}');
    expect(html).not.toContain('<script');
  });

  it('escapes authored copy and omits optional action and footer modules when disabled', () => {
    const html = buildOutreachEmailHtml({
      ...DEFAULT_DRAFT,
      headline: '<script>alert("x")</script>',
      body: 'A <b>careful</b> note & a {{company}} token.',
      ctaEnabled: false,
      footerEnabled: false,
    });

    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('A &lt;b&gt;careful&lt;/b&gt; note &amp; a {{company}} token.');
    expect(html).not.toContain('class="rs-cta"');
    expect(html).not.toContain('class="rs-footer"');
    expect(html).not.toContain('Prefer not to hear from us? Unsubscribe');
  });

  it('creates a readable text fallback with its own footer and opt-out path', () => {
    const text = buildOutreachText({
      ...DEFAULT_DRAFT,
      body: 'First paragraph.\n\nSecond paragraph for {{company}}.',
    });

    expect(text).toContain('First paragraph.\n\nSecond paragraph for {{company}}.');
    expect(text).toContain('Review the reliability brief\nhttps://reliastra.com/product');
    expect(text).toContain('Reliastra · Lagos, Nigeria');
    expect(text).toContain('mailto:support@reliastra.com?subject=Unsubscribe');
  });

  it('round-trips editable settings through the template metadata marker', () => {
    const draft = {
      ...DEFAULT_DRAFT,
      postalAddress: 'Kigali — East Africa',
      footerNote: 'A custom note · with punctuation',
      paletteId: 'custom' as const,
      accentColor: '#24a8d1',
      footerBackground: '#e9edf2',
      footerEnabled: false,
    };
    const decoded = decodeConfig(encodeConfig(draft));

    expect(decoded).toMatchObject({
      postalAddress: draft.postalAddress,
      footerNote: draft.footerNote,
      paletteId: 'custom',
      accentColor: '#24a8d1',
      footerBackground: '#e9edf2',
      footerEnabled: false,
    });
  });
});
