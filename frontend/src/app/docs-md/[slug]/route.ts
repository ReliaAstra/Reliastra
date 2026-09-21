import { DOCS, docFor } from '@/lib/docs/corpus';
import { docToMarkdown } from '@/lib/docs/markdown';
import { DOCS_ROUTES } from '@/lib/routes';
import { SITE_URL } from '@/lib/seo';

/**
 * One documentation guide as plain Markdown.
 *
 * Served at `/docs/<slug>.md` via a rewrite in `next.config.ts`; this handler
 * lives at `/docs-md/<slug>` because the App Router will not hold a `route.ts`
 * and a `page.tsx` for the same dynamic segment. The rewritten URL is the one
 * that matters - "append `.md`" is the convention an agent already knows.
 *
 * Rendered by the same `lib/docs/markdown.ts` that inlines the corpus into
 * `/llms-full.txt`, so the single-guide and whole-corpus surfaces cannot
 * disagree with each other or with the rendered site.
 *
 * Deliberately `noindex`. The HTML page at `/docs/<slug>` is canonical; a second
 * indexable URL carrying the same words would split the signals the guide is
 * trying to earn. Robots are pointed away from this path directly (see
 * `app/robots.ts`), and `X-Robots-Tag` covers crawlers that reach it anyway.
 */
export function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Response | Promise<Response> {
  return (async () => {
    const { slug } = await params;
    const doc = docFor(slug);

    if (!doc) {
      return new Response(
        `No documentation guide at "${slug}".\n\nAvailable: ${DOCS.map((d) => d.slug).join(', ')}.\n`,
        {
          status: 404,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        }
      );
    }

    const canonical = `${SITE_URL}${DOCS_ROUTES[slug as keyof typeof DOCS_ROUTES]}`;

    return new Response(docToMarkdown(doc), {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        // The HTML page is the canonical representation of this guide.
        Link: `<${canonical}>; rel="canonical"`,
        'X-Robots-Tag': 'noindex',
      },
    });
  })();
}
