import { handleRpc, mcpManifest, PROTOCOL_VERSION } from '../../../lib/mcp.js';
import { getRecord } from '../../../lib/registry.js';

// MCP over Streamable HTTP, mounted at /.well-known/mcp via a rewrite. All
// requests are answered statelessly with a single JSON response (no SSE
// stream, no session). Tools only read public registry data, so there is
// nothing to authenticate and nothing to rate-limit beyond the shared
// CARD_TOKEN quota inside getRecord.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } },
      { status: 400 },
    );
  }

  if (Array.isArray(body)) {
    const replies = await handleBatch(body, { getRecord: (name) => getRecord(name, {}) });
    return Response.json(replies);
  }

  // Notifications (no id) expect no response body, just acceptance.
  if (!body || typeof body !== 'object' || body.id === undefined || body.id === null) {
    if (body && typeof body === 'object' && body.jsonrpc === '2.0' && typeof body.method === 'string') {
      return new Response(null, { status: 202 });
    }
    return Response.json(
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid request' } },
      { status: 400 },
    );
  }

  if (body.jsonrpc !== '2.0') {
    return Response.json(
      { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32600, message: 'invalid request: jsonrpc must be "2.0"' } },
      { status: 400 },
    );
  }

  const out = await handleRpc(body, { getRecord: (name) => getRecord(name, {}) });
  return Response.json(out);
}

// No SSE stream: this server is stateless request/response only.
// GET has two callers with different needs: an MCP client probing for an SSE
// stream (gets the protocol-correct 405 JSON refusal, plus Allow: POST), and
// a human pasting the URL into a browser (gets a small live status page:
// server, protocol version, tools, and how to connect). Content negotiation
// picks between them.
const STATUS_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>runs-on.dev MCP</title>
<style>body{background:#101010;color:#f3f3f3;font-family:ui-monospace,Consolas,monospace;max-width:640px;margin:60px auto;padding:0 20px;line-height:1.6}
h1{font-weight:400;font-size:22px}code{color:#98ff38}a{color:#f3f3f3}hr{border:0;border-top:1px solid #212121}</style></head>
<body>
<h1>runs-on.dev MCP server · live</h1>
<p>protocol: Streamable HTTP JSON-RPC (${PROTOCOL_VERSION}) · transport: POST only</p>
<hr>
<p>tools:</p>
<p>· <code>check_name</code> — is a subdomain available to claim?</p>
<p>· <code>get_record</code> — fetch a claimed name's public registry record</p>
<hr>
<p>connect:</p>
<p><code>curl -X POST $URL -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'</code></p>
<p>full spec: <a href="/openapi.json">/openapi.json</a> · agent index: <a href="/llms.txt">/llms.txt</a></p>
</body></html>`;

// GET has three callers: an MCP client probing for the optional SSE stream
// (protocol-correct 405 JSON refusal with Allow: POST), a human in a
// browser (a small live status page at 405 with Allow: POST), and an agent
// or auditor asking for JSON (a plain-JSON manifest of the server facts).
export async function GET(request) {
  const accept = request.headers.get('accept') ?? '';

  // An MCP client probing for the optional SSE stream: refuse in protocol.
  if (accept.includes('text/event-stream')) {
    return Response.json(
      { jsonrpc: '2.0', id: null, error: { code: -32601, message: 'GET is not supported; POST JSON-RPC to this endpoint' } },
      { status: 405, headers: { Allow: 'POST' } },
    );
  }

  // A human in a browser: a plain status page, still carrying 405 semantics
  // via the Allow header so nobody mistakes this for a usable GET surface.
  if (accept.includes('text/html')) {
    return new Response(STATUS_PAGE, {
      status: 405,
      headers: { 'content-type': 'text/html; charset=utf-8', Allow: 'POST' },
    });
  }

  return Response.json(mcpManifest());
}
