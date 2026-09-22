// Spam moderation policy and the tombstone log.
//
// scripts/moderate-spam.mjs deletes spam comments from the registry's issues
// and pull requests. Deleting is the right end state -- contributors should
// not land on a competitor's advertisement in the middle of claiming a name --
// but the first version deleted and kept nothing, which meant every incident
// erased its own evidence. By the time a pattern of abuse was worth reporting
// to GitHub, the only thing left to report it with was a screenshot somebody
// happened to take.
//
// So the comment is archived before it is removed. `.moderation/log.jsonl` is
// an append-only record of what was deleted, who posted it, where, and the
// full body verbatim. It lives in the repository for the same reason the
// registry itself does: no hidden database, and anyone reading the repo can
// audit what the moderation bot has done in their name.
//
// This module holds the parts that are pure functions of their input so they
// can be tested without the API; the script keeps the network I/O.

// The default pattern list, used when data/spam-patterns.json cannot be read.
//
// The live list lives in that file so a new domain can be added by editing
// data, not code -- the moderation sweep reads it on every run, which means a
// pattern added by pull request takes effect on the next half-hour tick with
// no deploy. These two stay here as a floor: if the file is ever deleted or
// malformed, moderation degrades to the known-bad domains rather than to
// nothing at all.
export const SPAM_PATTERNS = [
  /go-live\.me/i,
  /golive\.me/i,
];

// Compiles the on-disk list. Each entry is { pattern, flags?, note? }; `note`
// is documentation for whoever reads the file next and is not used here.
//
// A bad entry throws rather than being skipped. A silently dropped pattern is
// the worst outcome available: moderation would report success on every run
// while quietly letting the thing it was added for through.
export function compilePatterns(doc) {
  if (!doc || !Array.isArray(doc.patterns)) {
    throw new Error('spam patterns: expected { patterns: [...] }');
  }
  return doc.patterns.map((entry, i) => {
    if (!entry || typeof entry.pattern !== 'string') {
      throw new Error(`spam patterns: entry ${i} has no pattern string`);
    }
    try {
      return new RegExp(entry.pattern, entry.flags ?? 'i');
    } catch (err) {
      throw new Error(`spam patterns: entry ${i} (${entry.pattern}) is not a valid regex: ${err.message}`);
    }
  });
}

// A comment by a bot or the owner is never spam, even when it quotes a spam
// link in order to report or discuss it -- as this file's own header does.
// The workflow's GITHUB_TOKEN identity is `github-actions[bot]`.
export const EXEMPT_LOGINS = new Set([
  'github-actions[bot]',
  'zordhalo',
]);

export const LOG_PATH = '.moderation/log.jsonl';

export function isExempt(login) {
  return EXEMPT_LOGINS.has(login);
}

// Returns the source text of every pattern the body matched, so the tombstone
// records *why* it was removed and not merely that it was. If the pattern list
// is later tightened or a false positive is argued, the log says which rule
// fired.
export function matchedPatterns(body, patterns = SPAM_PATTERNS) {
  if (typeof body !== 'string') return [];
  return patterns.filter((p) => p.test(body)).map((p) => p.source);
}

export function isSpam(body, patterns = SPAM_PATTERNS) {
  return matchedPatterns(body, patterns).length > 0;
}

// GitHub gives the containing thread as an API URL rather than a number:
// issue comments carry `issue_url`, PR review comments carry `pull_request_url`.
// The trailing path segment is the number in both cases. A report reads far
// better as "#61" than as an api.github.com URL.
export function threadNumber(comment) {
  const url = comment.issue_url ?? comment.pull_request_url ?? '';
  const match = /\/(\d+)$/.exec(url);
  return match ? Number(match[1]) : null;
}

// Captures everything needed to substantiate a report after the live comment
// is gone. `body` is stored verbatim and never trimmed: a paraphrase is not
// evidence, and a truncated advertisement can be argued as quoted out of
// context.
export function tombstone(comment, { kind, patterns = SPAM_PATTERNS, now = new Date() } = {}) {
  return {
    recordedAt: now.toISOString(),
    kind,
    id: comment.id,
    thread: threadNumber(comment),
    author: comment.user?.login ?? null,
    authorId: comment.user?.id ?? null,
    url: comment.html_url ?? null,
    createdAt: comment.created_at ?? null,
    updatedAt: comment.updated_at ?? null,
    matched: matchedPatterns(comment.body, patterns),
    body: comment.body ?? '',
  };
}

export function parseLog(text) {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function serializeLog(records) {
  if (records.length === 0) return '';
  return `${records.map((r) => JSON.stringify(r)).join('\n')}\n`;
}

// Append-only, but idempotent. A comment is archived before it is deleted, so
// a run that archives and then fails to delete would otherwise record the same
// comment again on the next sweep. Identity is (kind, id): the two comment
// namespaces are numbered independently and can collide across them.
export function mergeLog(existing, incoming) {
  const seen = new Set(existing.map((r) => `${r.kind}:${r.id}`));
  const added = incoming.filter((r) => !seen.has(`${r.kind}:${r.id}`));
  return { records: [...existing, ...added], added };
}

// How many separate spam comments the log attributes to each account. The
// script blocks on the first offence, so this exists for the report: "four
// comments across four threads" is the sentence that makes a case, and it
// should come from the log rather than from memory.
export function offenceCounts(records) {
  const counts = new Map();
  for (const record of records) {
    if (!record.author) continue;
    counts.set(record.author, (counts.get(record.author) ?? 0) + 1);
  }
  return counts;
}
