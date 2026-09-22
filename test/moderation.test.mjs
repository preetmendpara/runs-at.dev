import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isExempt,
  isSpam,
  matchedPatterns,
  SPAM_PATTERNS,
  compilePatterns,
  mergeLog,
  offenceCounts,
  parseLog,
  serializeLog,
  threadNumber,
  tombstone,
} from '../lib/moderation.js';

const comment = (extra = {}) => ({
  id: 101,
  body: 'try https://www.go-live.me/ instead',
  user: { login: 'someone', id: 42 },
  html_url: 'https://github.com/zordhalo/runs-on.dev/pull/61#issuecomment-101',
  issue_url: 'https://api.github.com/repos/zordhalo/runs-on.dev/issues/61',
  created_at: '2026-09-07T12:00:00Z',
  updated_at: '2026-09-07T12:05:00Z',
  ...extra,
});

test('an advertised domain matches, ordinary hosting talk does not', () => {
  assert.equal(isSpam('check out go-live.me'), true);
  assert.equal(isSpam('GO-LIVE.ME'), true);
  assert.equal(isSpam('I deployed to Vercel and it went live'), false);
  assert.equal(isSpam(''), false);
});

// A body is not always a string: a comment deleted mid-sweep can come back
// with a null body, and the sweep must not throw on it.
test('a missing body is not spam', () => {
  assert.equal(isSpam(null), false);
  assert.deepEqual(matchedPatterns(undefined), []);
});

test('the log records which rule fired, not just that one did', () => {
  assert.deepEqual(matchedPatterns('go-live.me'), [SPAM_PATTERNS[0].source]);
});

test('the owner and the bot are exempt so a report can quote the link', () => {
  assert.equal(isExempt('zordhalo'), true);
  assert.equal(isExempt('github-actions[bot]'), true);
  assert.equal(isExempt('someone'), false);
});

test('the thread number comes off either comment namespace', () => {
  assert.equal(threadNumber(comment()), 61);
  assert.equal(
    threadNumber({ pull_request_url: 'https://api.github.com/repos/o/r/pulls/78' }),
    78,
  );
  assert.equal(threadNumber({}), null);
});

test('a tombstone preserves the body verbatim', () => {
  const body = 'line one\n\nhttps://www.go-live.me/ line two';
  const t = tombstone(comment({ body }), { kind: 'issue-comment' });
  assert.equal(t.body, body);
  assert.equal(t.author, 'someone');
  assert.equal(t.authorId, 42);
  assert.equal(t.thread, 61);
  assert.equal(t.kind, 'issue-comment');
  assert.deepEqual(t.matched, [SPAM_PATTERNS[0].source]);
});

// The body is the evidence, so it has to survive a round trip through the log
// with its newlines and quoting intact.
test('a multi-line body round-trips through the log', () => {
  const body = 'has "quotes"\nand\nnewlines: go-live.me';
  const t = tombstone(comment({ body }), { kind: 'issue-comment' });
  const text = serializeLog([t]);
  assert.equal(text.split('\n').filter(Boolean).length, 1);
  assert.equal(parseLog(text)[0].body, body);
});

test('an empty log serializes and parses as nothing', () => {
  assert.equal(serializeLog([]), '');
  assert.deepEqual(parseLog(''), []);
});

// Archiving happens before deletion, so a run that archives and then fails to
// delete will see the same comment again on the next sweep.
test('re-archiving the same comment adds nothing', () => {
  const t = tombstone(comment(), { kind: 'issue-comment' });
  const first = mergeLog([], [t]);
  assert.equal(first.added.length, 1);
  const second = mergeLog(first.records, [t]);
  assert.equal(second.added.length, 0);
  assert.equal(second.records.length, 1);
});

// Issue comments and PR review comments are numbered independently, so id
// alone is not an identity.
test('the same id in each namespace is two different comments', () => {
  const a = tombstone(comment(), { kind: 'issue-comment' });
  const b = tombstone(comment(), { kind: 'pr-review-comment' });
  const { records, added } = mergeLog([], [a, b]);
  assert.equal(added.length, 2);
  assert.equal(records.length, 2);
});

test('offences are counted per account for the report', () => {
  const records = [
    tombstone(comment({ id: 1 }), { kind: 'issue-comment' }),
    tombstone(comment({ id: 2 }), { kind: 'issue-comment' }),
    tombstone(comment({ id: 3, user: { login: 'other', id: 7 } }), { kind: 'issue-comment' }),
  ];
  const counts = offenceCounts(records);
  assert.equal(counts.get('someone'), 2);
  assert.equal(counts.get('other'), 1);
});

// --- the on-disk pattern list -------------------------------------------

test('the shipped pattern file compiles and covers the known domains', async () => {
  const { readFile } = await import('node:fs/promises');
  const doc = JSON.parse(await readFile('data/spam-patterns.json', 'utf8'));
  const patterns = compilePatterns(doc);
  assert.equal(isSpam('go-live.me', patterns), true);
  assert.equal(isSpam('golive.me', patterns), true);
  assert.equal(isSpam('deployed to Vercel', patterns), false);
});

test('every shipped entry carries a note for the next reader', async () => {
  const { readFile } = await import('node:fs/promises');
  const doc = JSON.parse(await readFile('data/spam-patterns.json', 'utf8'));
  for (const entry of doc.patterns) {
    assert.equal(typeof entry.note, 'string');
    assert.ok(entry.note.length > 0);
  }
});

// A dropped pattern is worse than a failed run: moderation would go green
// while letting through the exact thing the entry was added to catch.
test('a malformed pattern list throws instead of being skipped', () => {
  assert.throws(() => compilePatterns(null), /expected/);
  assert.throws(() => compilePatterns({}), /expected/);
  assert.throws(() => compilePatterns({ patterns: [{}] }), /no pattern string/);
  assert.throws(() => compilePatterns({ patterns: [{ pattern: '(' }] }), /not a valid regex/);
});

test('flags default to case-insensitive', () => {
  const [p] = compilePatterns({ patterns: [{ pattern: 'example' }] });
  assert.equal(p.flags, 'i');
  assert.equal(p.test('EXAMPLE'), true);
});
