// The published OpenAPI spec is a public contract: if it drifts from valid
// OpenAPI 3.1 shape (or an operation loses its id/description), agents and
// generator tools break silently. These tests walk the structural contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const spec = JSON.parse(await readFile(new URL('../public/openapi.json', import.meta.url), 'utf8'));

test('is a valid OpenAPI 3.1 document with identity metadata', () => {
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(spec.info.title.length > 3);
  assert.ok(spec.info.description.length > 50);
  assert.ok(Array.isArray(spec.servers) && spec.servers[0].url === 'https://runs-on.dev');
});

test('every operation has a unique operationId, tags, and responses', () => {
  const ids = new Set();
  for (const [path, methods] of Object.entries(spec.paths)) {
    assert.ok(path.startsWith('/'), `${path} must be a path`);
    for (const [method, op] of Object.entries(methods)) {
      assert.ok(op, `${method} ${path} missing`);
      assert.equal(typeof op.operationId, 'string', `${method} ${path} needs an operationId`);
      assert.ok(!ids.has(op.operationId), `duplicate operationId: ${op.operationId}`);
      ids.add(op.operationId);
      assert.ok(op.summary, `${op.operationId} needs a summary`);
      assert.ok(op.description, `${op.operationId} needs a description`);
      assert.ok(op.responses && Object.keys(op.responses).length > 0, `${op.operationId} needs responses`);
    }
  }
  assert.ok(ids.size >= 11, `expected the full surface, got ${ids.size} operations`);
});

test('declares scoped security schemes (essential for agents)', () => {
  const schemes = spec.components.securitySchemes;
  assert.ok(schemes.githubSession, 'session scheme missing');
  assert.ok(schemes.siteToken, 'deploy token scheme missing');
  assert.ok(schemes.githubSession.description.includes('names:claim'));
  assert.ok(schemes.siteToken.description.includes('sites:publish'));
  const oauthScopes = schemes.registryOAuth.flows.authorizationCode.scopes;
  assert.ok(oauthScopes['records:write'], 'oauth2 flow must name records:write');
  assert.equal(schemes.githubSession.scopes, undefined, 'scopes live on the oauth2 scheme, not apiKey schemes');
  assert.equal(schemes.siteToken.scopes, undefined, 'scopes live on the oauth2 scheme, not http schemes');
});

test('write paths declare their security requirements explicitly', () => {
  assert.deepEqual(spec.paths['/api/claim'].post.security, [{ githubSession: ['names:claim'] }]);
  assert.deepEqual(spec.paths['/api/records'].post.security, [{ githubSession: ['records:write'] }]);
  assert.deepEqual(spec.paths['/api/sites/deploy'].post.security, [{ siteToken: ['sites:publish'] }]);
  assert.deepEqual(spec.paths['/api/check'].get.security, []);
});

test('every error response documents the shared Error schema', () => {
  for (const methods of Object.values(spec.paths)) {
    for (const op of Object.values(methods)) {
      for (const [status, response] of Object.entries(op.responses)) {
        if (op.operationId === 'mcpJsonRpc') continue; // JSON-RPC envelope, not the registry Error schema
        if (Number(status) < 400) continue;
        const schema = response.content?.['application/json']?.schema;
        const isErrorShape = schema?.allOf?.some((s) => s.$ref === '#/components/schemas/Error')
          || schema?.$ref === '#/components/schemas/Error';
        assert.ok(isErrorShape, `${op.operationId} ${status} should reference the Error schema`);
      }
    }
  }
});

test('declares an oauth2 flow with machine-readable named scopes', () => {
  const oauth = spec.components.securitySchemes.registryOAuth;
  assert.equal(oauth.type, 'oauth2');
  const scopes = oauth.flows.authorizationCode.scopes;
  for (const scope of ['names:claim', 'records:write', 'names:release', 'names:swap', 'tokens:mint', 'sites:publish']) {
    assert.ok(scopes[scope], `missing scope: ${scope}`);
    assert.ok(scopes[scope].length > 10, `scope ${scope} needs a real description`);
  }
  assert.ok(oauth.flows.authorizationCode.authorizationUrl.includes('/api/auth/github'));
});

test('every operation pins the API version header parameter', () => {
  for (const methods of Object.values(spec.paths)) {
    for (const op of Object.values(methods)) {
      const refs = (op.parameters ?? []).some((p) => p.$ref === '#/components/parameters/ApiVersionHeader');
      assert.ok(refs, `${op.operationId} is missing the X-API-Version parameter`);
    }
  }
  const param = spec.components.parameters.ApiVersionHeader;
  assert.equal(param.in, 'header');
  assert.equal(param.schema.const, '1');
});

test('documents the rate-limit header convention', () => {
  assert.ok(spec.info.description.includes('RateLimit-Limit'));
  assert.ok(spec.info.description.includes('RateLimit-Reset'));
  assert.ok(spec.info.description.includes('Retry-After'));
});
