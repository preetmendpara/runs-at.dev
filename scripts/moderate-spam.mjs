// Spam comment moderation for the runs-on.dev registry.
//
// Runs from .github/workflows/moderate.yml on a schedule and on new comment
// events. See lib/moderation.js for the patterns and the tombstone format.
//
// Two modes, run in this order by the workflow:
//
//   archive   scan every comment, write a tombstone for each spam match into
//             .moderation/log.jsonl, and stop. Deletes nothing.
//   enforce   delete the live comments that the log already accounts for, and
//             block their authors.
//
// The split exists so the workflow can commit and push the log between the two
// steps. Deleting first and archiving afterwards would mean any crash, timeout,
// or revoked token in the gap destroys the only copy of the evidence; this way
// `enforce` refuses to remove anything that is not already committed to the
// repository. Losing a delete is recoverable -- the next sweep, thirty minutes
// later, catches it. Losing the body is not.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  LOG_PATH,
  SPAM_PATTERNS,
  compilePatterns,
  isExempt,
  isSpam,
  mergeLog,
  offenceCounts,
  parseLog,
  serializeLog,
  tombstone,
} from '../lib/moderation.js';

const REPO = process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.GITHUB_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN; // optional: enables blocking

const MODE = process.argv[2];
if (MODE !== 'archive' && MODE !== 'enforce') {
  console.error('moderate: usage: moderate-spam.mjs <archive|enforce>');
  process.exit(1);
}

if (!REPO || !TOKEN) {
  console.error('moderate: GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  process.exit(1);
}

const PATTERNS_PATH = 'data/spam-patterns.json';

// Read the live pattern list. A missing or malformed file falls back to the
// compiled-in defaults and warns loudly rather than failing the run: the point
// of moving the list into data was to make it editable by pull request, and a
// typo in that pull request should not leave the repository with no moderation
// at all until someone notices.
async function loadPatterns() {
  try {
    const patterns = compilePatterns(JSON.parse(await readFile(PATTERNS_PATH, 'utf8')));
    console.log(`moderate: ${patterns.length} pattern(s) from ${PATTERNS_PATH}`);
    return patterns;
  } catch (err) {
    console.log(`::warning::${PATTERNS_PATH}: ${err.message} -- falling back to built-in patterns`);
    return SPAM_PATTERNS;
  }
}

const PATTERNS = await loadPatterns();

const api = (path, init = {}, token = TOKEN) =>
  fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  });

async function collect(path, label) {
  const comments = [];
  let page = 1;
  for (;;) {
    const res = await api(`${path}?per_page=100&page=${page}&sort=created&direction=desc`);
    if (!res.ok) throw new Error(`list ${label} page ${page}: ${res.status}`);
    const body = await res.json();
    if (body.length === 0) break;
    comments.push(...body);
    if (body.length < 100) break;
    page += 1;
  }
  return comments;
}

// `kind` is carried alongside each comment because the two namespaces are
// numbered independently and are deleted through different endpoints.
async function collectSpam() {
  const [issueComments, prComments] = await Promise.all([
    collect(`/repos/${REPO}/issues/comments`, 'issue comments'),
    collect(`/repos/${REPO}/pulls/comments`, 'PR review comments'),
  ]);

  return [
    ...issueComments.map((c) => ({ comment: c, kind: 'issue-comment' })),
    ...prComments.map((c) => ({ comment: c, kind: 'pr-review-comment' })),
  ].filter(({ comment }) => !isExempt(comment.user?.login) && isSpam(comment.body, PATTERNS));
}

async function readLog() {
  try {
    return parseLog(await readFile(LOG_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeLog(records) {
  await mkdir(dirname(LOG_PATH), { recursive: true });
  await writeFile(LOG_PATH, serializeLog(records), 'utf8');
}

async function summarize(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const { appendFile } = await import('node:fs/promises');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
}

// ---------------------------------------------------------------- archive

if (MODE === 'archive') {
  const spam = await collectSpam();
  const existing = await readLog();
  const { records, added } = mergeLog(
    existing,
    spam.map(({ comment, kind }) => tombstone(comment, { kind, patterns: PATTERNS })),
  );

  if (added.length === 0) {
    console.log(`moderate: nothing new to archive (${spam.length} live spam comment(s) already logged)`);
  } else {
    await writeLog(records);
    console.log(`moderate: archived ${added.length} comment(s) to ${LOG_PATH}`);
    await summarize([
      `# Spam archived — ${new Date().toISOString()}`,
      '',
      ...added.map((r) => `- \`${r.kind}\` ${r.id} by @${r.author} on #${r.thread}`),
    ]);
  }
}

// ---------------------------------------------------------------- enforce

if (MODE === 'enforce') {
  const spam = await collectSpam();
  const archived = new Set((await readLog()).map((r) => `${r.kind}:${r.id}`));

  const deleteEndpoint = {
    'issue-comment': (id) => `/repos/${REPO}/issues/comments/${id}`,
    'pr-review-comment': (id) => `/repos/${REPO}/pulls/comments/${id}`,
  };

  // Blocking is per account, not per comment: an author with three comments in
  // one sweep should produce one block call, not three.
  const blocked = new Set();

  async function blockUser(login) {
    if (!login || blocked.has(login)) return;
    blocked.add(login);
    if (!ADMIN_TOKEN) {
      console.log(`::warning::blocking skipped for ${login}: no ADMIN_TOKEN configured`);
      return;
    }
    const res = await api(`/user/blocks/${login}`, { method: 'PUT' }, ADMIN_TOKEN);
    if (res.ok) console.log(`blocked ${login}`);
    else console.error(`block ${login}: ${res.status} ${res.statusText}`);
  }

  const removed = [];
  for (const { comment, kind } of spam) {
    // The invariant this whole two-step dance exists to enforce.
    if (!archived.has(`${kind}:${comment.id}`)) {
      console.log(`::warning::skipping ${kind} ${comment.id}: not in ${LOG_PATH} yet`);
      continue;
    }
    const res = await api(deleteEndpoint[kind](comment.id), { method: 'DELETE' });
    if (!res.ok) {
      console.error(`delete ${kind} ${comment.id}: ${res.status}`);
      continue;
    }
    console.log(`deleted ${kind} ${comment.id} by ${comment.user.login}`);
    removed.push({ kind, id: comment.id, author: comment.user.login });
    await blockUser(comment.user.login);
  }

  if (removed.length === 0) {
    console.log('moderate: no spam to remove');
  } else {
    const counts = offenceCounts(await readLog());
    await summarize([
      `# Spam removed — ${new Date().toISOString()}`,
      '',
      ...removed.map((r) => `- \`${r.kind}\` ${r.id} by @${r.author}`),
      '',
      '## Total logged offences by account',
      '',
      ...[...counts].map(([login, n]) => `- @${login}: ${n}`),
    ]);
  }
}
