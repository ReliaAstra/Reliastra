import {
  incidentRecordSidecar,
  loadIncidentRecord,
} from '@/lib/observatory/incident-record';

/**
 * The JSON sidecar of one public incident record page.
 *
 * URL shape: the page path plus `/index.json` - a static segment colocated
 * with the page it mirrors (Next cannot serve HTML and JSON from one path,
 * and a middleware rewrite for the `.json` suffix would put every request
 * through a global module to save four characters of URL).
 *
 * Content: the same canonical objects the HTML page rendered, resolved
 * through `loadIncidentRecord` - the shared loader, never a re-read or a
 * scrape of the page. A machine that fetched both URLs would find two
 * renderings of one record, never two records.
 *
 * Response contract, identical in meaning to the page's: record exists ->
 * 200 JSON; vendor or incident absent -> 404 JSON; API unreadable -> throw,
 * so this URL serves 5xx and crawlers retry (a sidecar must never answer
 * "no such record" for a timeout - the HTML page could still be serving).
 *
 * `X-Robots-Tag: noindex` because a sidecar is a data endpoint, not a page:
 * the HTML record is the indexable unit, this is its machine twin.
 */

export const revalidate = 300;

const NO_STORE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Robots-Tag': 'noindex',
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
};

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ vendor: string; id: string }> }
): Promise<Response> {
  const { vendor, id } = await ctx.params;

  const load = await loadIncidentRecord(vendor, id);
  const sidecar = incidentRecordSidecar(vendor, id, load);

  if (sidecar.status === 404) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'No public incident record at this URL.',
        },
      }),
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  return new Response(JSON.stringify(sidecar.document), {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}
