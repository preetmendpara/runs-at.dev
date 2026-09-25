// The Popunder may only load on public reading pages of the apex site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { popunderAllowed } from '../lib/ad-routes.js';

const APEX = 'runs-at.dev';

test('popunder: allowed on public reading pages', () => {
  for (const p of ['/docs', '/docs/quickstart', '/docs/guides/vercel', '/faq', '/about', '/stats', '/blog', '/blog/some-post', '/policy', '/privacy', '/contact']) {
    assert.equal(popunderAllowed(p, APEX), true, p);
  }
});

test('popunder: never on the homepage, manage, admin, api, auth, debug or cards', () => {
  for (const p of ['/', '', '/manage', '/manage?name=x', '/admin', '/api/claim', '/api/auth/github', '/api/auth/github/callback', '/debug/preet', '/_card/preet', '/sites/preet', '/docsx', '/faq/extra', '/unknown']) {
    assert.equal(popunderAllowed(p, APEX), false, p);
  }
});

test('popunder: never on a claimed *.runs-at.dev name, whatever the path', () => {
  for (const host of ['preet.runs-at.dev', 'PREET.RUNS-AT.DEV']) {
    assert.equal(popunderAllowed('/docs', host), false, host);
  }
});
