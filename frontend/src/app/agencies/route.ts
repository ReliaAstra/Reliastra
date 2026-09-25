/**
 * /agencies -> HTTP 410 Gone.
 *
 * Why a 410 and not a redirect: this URL described an agency/MSP product line
 * - client estates, white-label delivery, a per-client console - that RELIASTRA
 * does not build and will not build. The current product is a developer-first
 * tool for engineers operating their own SaaS dependencies, and there is no
 * current page that legitimately "absorbs" an agency pitch without either
 * inventing an agency capability or misrepresenting the product. A 410 is the
 * only status that tells a crawler, honestly, that the address is permanently
 * retired and has no replacement.
 *
 * A 410 (not a bare 404) matters here: it is an explicit statement that the
 * removal is intentional and permanent, so a search engine drops the URL from
 * its index on the next crawl instead of retrying it as a possible transient
 * miss.
 *
 * The response is deliberately minimal - a route handler, not a page, so it
 * does not render the marketing shell. It carries `X-Robots-Tag: noindex` as
 * defense in depth and a plain link back to the public site.
 *
 * Do NOT repoint this at `/` or `/pricing`: redirecting a retired agency pitch
 * to an unrelated page is exactly the "redirect everything to the homepage"
 * anti-pattern, and it would tell a crawler the agency content lives somewhere
 * it does not.
 */
export async function GET() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex, nofollow" />
    <title>410 Gone - RELIASTRA</title>
  </head>
  <body>
    <h1>410 Gone</h1>
    <p>
      This page has been permanently removed. RELIASTRA is a developer-first
      tool for observing external dependencies; it does not offer agency or
      MSP software.
    </p>
    <p><a href="/">Return to RELIASTRA</a></p>
  </body>
</html>`;

  return new Response(html, {
    status: 410,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Explicit, transport-layer, so the signal survives even if a crawler
      // ignores the body's meta tag.
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
