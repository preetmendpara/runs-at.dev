// The MCP server's JSON-RPC dispatch, tested without network: handleRpc is
// pure modulo the injected getRecord.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRpc, mcpManifest, PROTOCOL_VERSION } from '../lib/mcp.js';

const fakeRecord = { name: 'shovith', owner: { github: 'Hawkay002' }, records: {} };
const deps = { getRecord: (name) => (name === 'shovith' ? fakeRecord : null) };

test('initialize returns the protocol version, capabilities, and server info', async () => {
  const out = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(out.jsonrpc, '2.0');
  assert.equal(out.id, 1);
  assert.equal(out.result.protocolVersion, PROTOCOL_VERSION);
  assert.ok(out.result.capabilities.tools);
  assert.equal(out.result.serverInfo.name, 'runs-on.dev');
});

test('tools/list exposes both tools with typed input schemas', async () => {
  const out = await handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const tools = out.result.tools;
  assert.deepEqual(tools.map((t) => t.name).sort(), ['check_name', 'get_record']);
  for (const tool of tools) {
    assert.ok(tool.description.length > 20, `${tool.name} needs a real description`);
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.inputSchema.properties.name);
    assert.deepEqual(tool.inputSchema.required, ['name']);
  }
});

test('tools/call check_name reports availability and grammar codes', async () => {
  const free = await handleRpc(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_name', arguments: { name: 'some-open-name' } } },
    deps,
  );
  assert.ok(free.result.content[0].text.includes('"available": true'));
  assert.ok(!free.result.isError);

  const taken = await handleRpc(
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'check_name', arguments: { name: 'shovith' } } },
    deps,
  );
  assert.ok(taken.result.content[0].text.includes('"code": "taken"'));

  const invalid = await handleRpc(
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'check_name', arguments: { name: 'x' } } },
    deps,
  );
  assert.ok(invalid.result.content[0].text.includes('invalid_length'));
});

test('tools/call get_record returns the record, or an honest miss', async () => {
  const hit = await handleRpc(
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_record', arguments: { name: 'shovith' } } },
    deps,
  );
  assert.ok(hit.result.content[0].text.includes('Hawkay002'));
  assert.ok(!hit.result.isError);

  const miss = await handleRpc(
    { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_record', arguments: { name: 'ghost' } } },
    deps,
  );
  assert.equal(miss.result.isError, true);
  assert.ok(miss.result.content[0].text.includes('not claimed'));
});

test('unknown tools and methods answer JSON-RPC errors', async () => {
  const badTool = await handleRpc({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'nope' } });
  assert.equal(badTool.error.code, -32602);
  const badMethod = await handleRpc({ jsonrpc: '2.0', id: 9, method: 'resources/list' });
  assert.equal(badMethod.error.code, -32601);
});

test('the JSON manifest mirrors the live server facts', () => {
  const m = mcpManifest();
  assert.equal(m.name, 'runs-on.dev');
  assert.equal(m.protocolVersion, PROTOCOL_VERSION);
  assert.equal(m.transport, 'streamable-http (POST JSON-RPC 2.0)');
  assert.deepEqual(m.tools.map((x) => x.name).sort(), ['check_name', 'get_record']);
});
