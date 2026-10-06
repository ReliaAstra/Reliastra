/**
 * RELIASTRA · TRANSACTIONAL EMAIL DESIGN SYSTEM
 * HTML -> plain-text multipart body.
 *
 * Shared by the compile step (`scripts/compile-email-templates.ts`) and the
 * compose render route, so the text part reviewed in the preview harness is
 * byte-identical to the text part that sends. Behaviour changes here alter
 * every stored template on the next compile: keep it boring on purpose.
 */
export const toText = (html: string): string => {
  let t = html;
  // The preheader lives in a hidden div; keep it, it is what a text client reads.
  t = t.replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/t[dh]>/gi, '\t');
  t = t.replace(/<[^>]+>/g, '');
  t = t
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  return t
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').replace(/^[ \t]+/, (m) => (m.includes('\t') ? '\t' : '')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * Pull the `<body>` content out of a React Email document.
 *
 * Shared with the compile step so seeds, previews and composed sends all
 * derive from the same bytes. React Email renders a full standalone document;
 * only the body ships.
 */
export const extractBody = (html: string): string => {
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return m ? m[1] : html;
};
