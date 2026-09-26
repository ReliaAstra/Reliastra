import {
  loadVendorQuestion,
  vendorQuestionSidecar,
} from '@/lib/observatory/questions';

/**
 * The JSON twin of one direct-answer page.
 *
 * Same loader as the HTML (`loadVendorQuestion`), pure mapper for the bytes
 * (`vendorQuestionSidecar`) - one answer, two renderers, neither derived
 * from the other. Response contract matches the page in meaning: subject
 * exists -> 200; catalog does not name the slug -> 404 JSON; measurement API
 * unreadable -> throw for a 5xx (an answer endpoint that answered "no" on a
 * timeout would let a transient failure retract a published answer).
 *
 * `X-Robots-Tag: noindex`: the HTML answer is the indexable unit; this is
 * its machine-readable twin.
 */

export const revalidate = 60;

const NO_STORE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Robots-Tag': 'noindex',
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
};

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ vendor: string }> }
): Promise<Response> {
  const { vendor } = await ctx.params;

  const load = await loadVendorQuestion(vendor);
  const sidecar = vendorQuestionSidecar(vendor, load);

  if (sidecar.status === 404) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'No measured vendor answers a question at this URL.',
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
