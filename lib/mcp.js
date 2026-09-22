// Minimal Model Context Protocol server over Streamable HTTP (JSON-RPC 2.0,
// POST at /.well-known/mcp, no SSE stream: the transport answers every
// request with a single JSON response). Stateless by design: no session,
// no stored client state, and the tools only read public registry data.
//
// Deps are injectable so the tests can run without network: handleRpc(body,
// { getRecord }) expects getRecord(name) -> record object or throws/returns
// null.

import { validateName } from './name.js';
import { isReserved } from './blocklist.js';

export const PROTOCOL_VERSION = '2025-03-26';
export const SERVER_INFO = { name: 'runs-on.dev', version: '1.0.0' };

const TOOLS = [
  {
    name: 'check_name',
    description:
      'Check whether a runs-on.dev subdomain name is available to claim. Returns { available: true } or why it is not (taken, reserved, or an invalid_* grammar code). Free, no auth.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name to check, without the .runs-on.dev suffix. 2-32 chars, lowercase letters, numbers, hyphens, no leading/trailing hyphen.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_record',
    description:
      'Fetch a claimed name\'s public registry record (owner, claimedAt, DNS records, subdomains, profile overrides) as JSON. Returns an isError result for names that are not claimed. Free, no auth.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The claimed name, without the .runs-on.dev suffix.',
        },
      },
      required: ['name'],
    },
  },
];

const envelope = (id, patch) => ({ jsonrpc: '2.0', id, ...patch });

function textResult(text, isError = false) {
  const out = { content: [{ type: 'text', text }] };
  if (isError) out.isError = true;
  return out;
}

async function checkName(name, deps) {
  if (typeof name !== 'string') return textResult('invalid params: name must be a string', true);
  const grammar = validateName(name);
  if (!grammar.ok) {
    return textResult(JSON.stringify({ name, available: false, code: `invalid_${grammar.reason}` }, null, 2));
  }
  if (isReserved(name).reserved) {
    return textResult(JSON.stringify({ name, available: false, code: 'reserved' }, null, 2));
  }
  let existing = null;
  let readFailed = false;
  try {
    existing = await deps.getRecord(name);
  } catch {
    // A failed registry read must not read as "available": a taken name
    // during an outage would hand agents a false go-ahead.
    readFailed = true;
  }
  if (readFailed) {
    return textResult(
      JSON.stringify({ name, available: false, code: 'check_failed' }, null, 2),
      true,
    );
  }
  return textResult(
    JSON.stringify(
      existing
        ? { name, available: false, code: 'taken', owner: existing.owner?.github ?? null }
        : { name, available: true },
      null,
      2,
    ),
  );
}

async function getRecordTool(name, deps) {
  if (typeof name !== 'string') return textResult('invalid params: name must be a string', true);
  if (!validateName(name).ok) return textResult(`no record for "${name}": not a valid name`, true);
  let record = null;
  try {
    record = await deps.getRecord(name);
  } catch {
    record = null;
  }
  if (!record) return textResult(`no record for "${name}": not claimed (or unavailable right now)`, true);
  return textResult(JSON.stringify(record, null, 2));
}

// A plain-JSON manifest for GET probes with Accept: application/json (not
// part of the MCP wire protocol): agents and auditors hitting the endpoint
// in a browser or curl get the server facts without speaking JSON-RPC.
export function mcpManifest() {
  return {
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocol: 'mcp',
    protocolVersion: PROTOCOL_VERSION,
    transport: 'streamable-http (POST JSON-RPC 2.0)',
    capabilities: { tools: {} },
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    spec: 'https://runs-on.dev/openapi.json',
  };
}

// JSON-RPC 2.0 dispatch. Returns the response envelope for requests; the
// route handles notifications (no id) with a bare 202 before calling in.
// The injected read is aliased getRecordDep: it must not shadow the module
// wrapper below, or tools/call would return raw records without the MCP
// content envelope (a bug the route tests caught).
export async function handleRpc(body, deps = {}) {
  const getRecordDep = deps.getRecord ?? (() => Promise.resolve(null));

  if (body.method === 'initialize') {
    return envelope(body.id, {
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      },
    });
  }
  if (body.method === 'tools/list') {
    return envelope(body.id, { result: { tools: TOOLS } });
  }
  if (body.method === 'tools/call') {
    const name = body.params?.name;
    const args = body.params?.arguments ?? {};
    let result;
    if (name === 'check_name') result = await checkName(args.name, { getRecord: getRecordDep });
    else if (name === 'get_record') result = await getRecordTool(args.name, { getRecord: getRecordDep });
    else return envelope(body.id, { error: { code: -32602, message: `unknown tool: ${String(name)}` } });
    return envelope(body.id, { result });
  }
  return envelope(body.id, {
    error: { code: -32601, message: `method not found: ${String(body.method)}` },
  });
}

// JSON-RPC batches (2025-03-26): every entry is processed, replies come back
// as an array with one envelope per request entry and none for
// notifications. initialize is forbidden inside a batch.
export async function handleBatch(batch, deps = {}) {
  const replies = [];
  for (const entry of batch) {
    if (!entry || typeof entry !== 'object' || entry.jsonrpc !== '2.0' || typeof entry.method !== 'string') {
      replies.push(envelope(entry?.id ?? null, { error: { code: -32600, message: 'invalid request' } }));
      continue;
    }
    if (entry.id === undefined || entry.id === null) continue; // notification
    if (entry.method === 'initialize') {
      replies.push(envelope(entry.id, { error: { code: -32600, message: 'initialize cannot be batched' } }));
      continue;
    }
    replies.push(await handleRpc(entry, deps));
  }
  return replies;
}
