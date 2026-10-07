/**
 * Client-side HTML sanitizer for Email Center previews.
 *
 * Mirrors the backend allowlist (`app/modules/email_center/sanitize.py`) so
 * the preview shows what the recipient will actually receive. Previews are
 * additionally rendered inside a sandboxed `<iframe sandbox="">`, which
 * blocks script execution even if sanitization missed something - defense
 * in depth. Must only run in the browser (uses DOMParser).
 */

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col',
  'colgroup', 'div', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre',
  'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);

const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'applet', 'form',
  'input', 'button', 'select', 'textarea', 'link', 'meta', 'base',
  'noscript', 'template', 'frame', 'frameset', 'canvas', 'audio',
  'video', 'source', 'track',
]);

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'width', 'height', 'align',
  'valign', 'colspan', 'rowspan', 'cellpadding', 'cellspacing',
  'border', 'style', 'class', 'id', 'target', 'rel',
]);

const SAFE_URL = /^(?:https?|mailto|cid):/i;
const UNSAFE_STYLE =
  /expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|@import|behavior\s*:|-moz-binding|url\s*\(\s*['"]?\s*javascript\s*:/i;

function cleanUrl(value: string): string | null {
  const collapsed = value.replace(/[\s\0-\x1f]+/g, '').toLowerCase();
  if (collapsed.startsWith('javascript:') || collapsed.startsWith('vbscript:') || collapsed.startsWith('data:text/html')) {
    return null;
  }
  if (SAFE_URL.test(value.trim()) || value.trim().startsWith('#')) {
    return value.trim();
  }
  return null;
}

function cleanStyle(value: string): string | null {
  if (!value || value.length > 4000 || UNSAFE_STYLE.test(value)) return null;
  return value;
}

function sanitizeNode(node: Node): void {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.COMMENT_NODE) {
      node.removeChild(child);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      node.removeChild(child);
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap: keep the text content, drop the tag.
      while (el.firstChild) node.insertBefore(el.firstChild, el);
      node.removeChild(el);
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || !ALLOWED_ATTRS.has(name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === 'href' || name === 'src') {
        const cleaned = cleanUrl(attr.value);
        if (cleaned === null) el.removeAttribute(attr.name);
        else el.setAttribute(attr.name, cleaned);
      } else if (name === 'style') {
        const cleaned = cleanStyle(attr.value);
        if (cleaned === null) el.removeAttribute(attr.name);
      } else if (name === 'target' && !['_blank', '_self', '_top'].includes(attr.value.toLowerCase())) {
        el.removeAttribute(attr.name);
      }
    }
    if (tag === 'a' && !el.getAttribute('href')) {
      // Unsafe anchor: degrade to text.
      while (el.firstChild) node.insertBefore(el.firstChild, el);
      node.removeChild(el);
      continue;
    }
    sanitizeNode(el);
  }
}

export function sanitizeEmailHtml(raw: string | null | undefined): string {
  if (!raw) return '';
  if (typeof DOMParser === 'undefined') return '';
  try {
    const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return '';
    sanitizeNode(root);
    return root.innerHTML;
  } catch {
    return '';
  }
}

/** Substitute {{variable}} placeholders (mirrors backend behavior). */
export function renderEmailVariables(
  text: string | null | undefined,
  variables: Record<string, string>
): string {
  if (!text) return '';
  return text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (match, name: string) =>
    name in variables ? variables[name] : match
  );
}

export function extractEmailVariables(...texts: Array<string | null | undefined>): string[] {
  const found: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    const re = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (!found.includes(match[1])) found.push(match[1]);
    }
  }
  return found;
}
