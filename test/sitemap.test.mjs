// The sitemap lists public pages only, with no invented dates.
import test from 'node:test';
import assert from 'node:assert/strict';
import sitemap from '../app/sitemap.js';
import { publishedPosts } from '../lib/blog.js';

const entries = sitemap();
const paths = entries.map((e) => new URL(e.url).pathname);

test('sitemap: public pages only, no private or per-user URLs', () => {
  for (const p of paths) {
    assert.doesNotMatch(p, /^\/(admin|manage|api|debug|sites|_card|banner)(\/|$)/, p);
  }
  assert.ok(entries.every((e) => new URL(e.url).host === 'runs-at.dev'), 'no claimed *.runs-at.dev cards yet');
  assert.equal(new Set(paths).size, paths.length, 'no duplicates');
});

test('sitemap: /blog is listed only when it has posts', () => {
  assert.equal(paths.includes('/blog'), publishedPosts().length > 0);
});

test('sitemap: no request-time lastModified on static pages', () => {
  for (const e of entries.filter((x) => !new URL(x.url).pathname.startsWith('/blog/'))) {
    assert.equal(e.lastModified, undefined, e.url);
  }
});
