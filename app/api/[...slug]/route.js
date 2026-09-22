// JSON catch-all for unknown /api/* paths. Agents parse JSON, not HTML: an
// unknown endpoint must answer in the same shape as every real endpoint.
// Real routes take precedence (the file convention is more specific than
// the catch-all), so this only sees paths nothing implements.
export const dynamic = 'force-dynamic';

function notFound(slug) {
  return Response.json(
    {
      error: 'not_found',
      detail: `no API endpoint at /api/${(slug ?? []).join('/')}`,
      hint: 'the endpoint list lives in the OpenAPI spec: https://runs-on.dev/openapi.json',
    },
    { status: 404, headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}

// Next 15+ hands route params as a promise on the second argument. No HEAD
// export: HEAD is served from GET with the body stripped, which is the
// protocol-correct shape for a 404.
const handler = (request, { params }) => params.then((p) => notFound(p.slug));

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
