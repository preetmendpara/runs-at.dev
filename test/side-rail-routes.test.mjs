// Desktop side-rail ads: which pages get them, and the width they need.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sideRailsAllowed, SIDE_RAIL_MIN_WIDTH } from '../lib/side-rail-routes.js';

const APEX = 'runs-at.dev';

test('side rails: only on narrow-column content pages', () => {
  for (const p of ['/docs', '/docs/quickstart', '/docs/guides/vercel', '/faq', '/about', '/policy', '/privacy', '/contact', '/blog']) {
    assert.equal(sideRailsAllowed(p, APEX), true, p);
  }
  for (const p of ['/', '', '/stats', '/manage', '/admin', '/api/claim', '/api/auth/github/callback', '/debug/preet', '/_card/preet', '/sites/preet', '/blog/a-post', '/docsx', '/unknown']) {
    assert.equal(sideRailsAllowed(p, APEX), false, p);
  }
});

test('side rails: never on a claimed *.runs-at.dev name', () => {
  assert.equal(sideRailsAllowed('/docs', 'preet.runs-at.dev'), false);
});

test('side rails: the breakpoint leaves room for both rails, gutters and the edge dock', () => {
  const column = 768, gutter = 32, ad = 300, dockFromEdge = 66;
  const rightRailOuterEdge = SIDE_RAIL_MIN_WIDTH / 2 + column / 2 + gutter + ad;
  assert.ok(SIDE_RAIL_MIN_WIDTH / 2 - column / 2 - gutter - ad > 0, 'left rail stays on screen');
  assert.ok(rightRailOuterEdge < SIDE_RAIL_MIN_WIDTH - dockFromEdge, 'right rail clears the edge dock');
});
