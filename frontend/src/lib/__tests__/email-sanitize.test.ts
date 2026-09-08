import { describe, expect, it } from 'vitest';
import {
  extractEmailVariables,
  renderEmailVariables,
  sanitizeEmailHtml,
} from '@/lib/email-sanitize';

describe('renderEmailVariables', () => {
  it('substitutes known variables and leaves unknown placeholders intact', () => {
    expect(renderEmailVariables('Hi {{name}}, {{missing}}!', { name: 'Ada' })).toBe(
      'Hi {{name}}, {{missing}}!'.replace('{{name}}', 'Ada')
    );
  });

  it('never evaluates expressions', () => {
    const evil = '{{ 7*7 }} {{ name|upper }} ${name} <%= name %>';
    expect(renderEmailVariables(evil, { name: 'x' })).toBe(evil);
  });

  it('handles empty input', () => {
    expect(renderEmailVariables(null, {})).toBe('');
    expect(renderEmailVariables(undefined, {})).toBe('');
  });
});

describe('extractEmailVariables', () => {
  it('collects unique names in order across inputs', () => {
    expect(
      extractEmailVariables('Hello {{customer_name}}', 'Invoice {{invoice_id}} for {{customer_name}}')
    ).toEqual(['customer_name', 'invoice_id']);
  });

  it('ignores malformed placeholders', () => {
    expect(extractEmailVariables('{{9bad}} {{no-close {{ok_name}}')).toEqual(['ok_name']);
  });
});

describe('sanitizeEmailHtml', () => {
  it('returns empty string outside the browser (no DOMParser)', () => {
    // Node test environment has no DOMParser - the sanitizer fails closed.
    expect(sanitizeEmailHtml('<p>hi</p>')).toBe('');
    expect(sanitizeEmailHtml(null)).toBe('');
  });
});
