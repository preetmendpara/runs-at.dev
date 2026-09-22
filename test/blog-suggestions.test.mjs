// Content suggestion engine: significance filtering, grouping, dedupe, and
// the suggestion document shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSignificant, groupCandidates, generateSuggestions } from '../lib/blog-suggestions.js';

const pr = (number, title, { labels = [], files = [], url } = {}) => ({
  number,
  title,
  labels: labels.map((l) => ({ name: l })),
  files,
  url: url ?? `https://github.com/zordhalo/runs-on.dev/pull/${number}`,
});

test('registry churn and housekeeping are never suggested', () => {
  for (const noise of [
    pr(1, 'claim: person by @someone'),
    pr(2, 'index: someone owns 1 name'),
    pr(3, 'swap: a → b by @someone'),
    pr(4, 'chore: bump deps'),
    pr(5, 'ci: tighten the test job'),
    pr(6, 'release: v2.1 by @someone'),
    pr(7, 'Bump marked from 1.0 to 2.0', { labels: ['dependencies'] }),
    pr(8, 'feat: something big', { labels: ['skip-blog'] }),
  ]) {
    assert.equal(isSignificant(noise), false, noise.title);
  }
});

test('labeled and conventional-change PRs are suggested', () => {
  for (const good of [
    pr(10, 'feat: add a claim heat map', { labels: ['enhancement'] }),
    pr(11, 'fix: dns-check false negatives', { labels: ['bug'] }),
    pr(12, 'docs: guide for Railway deploys', { labels: ['documentation'] }),
    pr(13, 'feat: MCP server'),
    pr(14, 'anything at all', { labels: ['blog'] }),
  ]) {
    assert.equal(isSignificant(good), true, good.title);
  }
});

test('groupCandidates collapses related PRs into one suggestion', () => {
  const groups = groupCandidates([
    pr(20, 'feat: vercel deploy guide', { files: ['docs/guides/vercel/page.md'] }),
    pr(21, 'feat: vercel verification walkthrough', { files: ['docs/guides/vercel/steps.md'] }),
    pr(22, 'feat: MCP server for agents', { files: ['app/api/mcp/route.js'] }),
  ]);
  assert.equal(groups.length, 2);
  const docs = groups.find((g) => g.items.some((i) => i.pr.number === 20));
  assert.equal(docs.items.length, 2, 'the two vercel PRs share a directory and group');
});

test('generateSuggestions dedupes against already-covered PRs', () => {
  const { suggestions, seen } = generateSuggestions(
    [pr(30, 'feat: a brand new feature'), pr(31, 'feat: another new feature')],
    { alreadyCovered: [30] },
  );
  assert.equal(seen.length, 2);
  assert.equal(suggestions.length, 1);
  assert.deepEqual(suggestions[0].coveredPrs, [31]);
});

test('suggestion documents carry the full review payload', () => {
  const { suggestions } = generateSuggestions([pr(40, 'feat: mcp tools for registry lookups', { files: ['app/api/mcp/route.js'] })]);
  const s = suggestions[0];
  for (const field of ['title', 'summary', 'why', 'prs', 'category', 'outline', 'keyPoints', 'links', 'seo', 'coveredPrs']) {
    assert.ok(s[field] !== undefined, `missing ${field}`);
  }
  assert.equal(s.category, 'feature');
  assert.ok(s.seo.title.length <= 60);
  assert.ok(s.seo.metaDescription.length <= 155);
  assert.ok(s.outline.length >= 3);
  assert.equal(s.prs[0].number, 40);
});
