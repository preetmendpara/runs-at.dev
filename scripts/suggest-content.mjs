// Content suggestion cron (run by .github/workflows/suggest-content.yml):
// fetches recently merged PRs, filters registry churn, groups related
// work, and writes one JSON suggestion per cluster into
// content/suggestions/ for human review. Never publishes anything.
//
//   GITHUB_TOKEN=<token> node scripts/suggest-content.mjs
//
// Idempotent: PRs already listed in state.json or covered by an existing
// suggestion file are skipped, so re-running after a partial failure
// cannot create duplicates. The state file is rewritten only after all
// suggestion files are safely on disk.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { generateSuggestions } from '../lib/blog-suggestions.js';

const REPO = process.env.GITHUB_REPOSITORY ?? 'zordhalo/runs-on.dev';
const STATE_FILE = 'content/suggestions/state.json';
const SUGGESTIONS_DIR = 'content/suggestions';
const PER_PAGE = 50;
const MAX_PAGES = 4;

const token = process.env.GITHUB_TOKEN ?? '';
const api = (path) => {
  const res = fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  }).then((r) => {
    if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}`);
    return r.json();
  });
  return res;
};

function loadState() {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    } catch {
      console.error('state.json unparseable; starting fresh (dedupe still guarded by suggestion files)');
    }
  }
  return { lastRun: null, processedPrs: [], failed: [] };
}

// Fetch merged PRs newer than the last successful run (or the last 30 days
// on a first run, so a fresh install has something to look at).
async function fetchMergedPrs(sinceIso) {
  const since = sinceIso ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const prs = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const list = await api(`/repos/${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=${PER_PAGE}&page=${page}`);
    for (const pr of list) {
      if (!pr.merged_at) continue;
      if (pr.merged_at < since) return prs;
      prs.push({ number: pr.number, title: pr.title, url: pr.html_url, labels: pr.labels ?? [], mergedAt: pr.merged_at });
    }
    if (list.length < PER_PAGE) break;
  }
  return prs;
}

async function fetchFiles(number) {
  const files = await api(`/repos/${REPO}/pulls/${number}/files?per_page=100`);
  return files.map((f) => f.filename);
}

// PRs covered by suggestion files that exist on disk, so a state-file loss
// cannot cause duplicate suggestions.
function coveredByFiles() {
  if (!existsSync(SUGGESTIONS_DIR)) return [];
  const covered = [];
  for (const f of readdirSync(SUGGESTIONS_DIR)) {
    if (!f.endsWith('.json') || f === 'state.json') continue;
    try {
      const doc = JSON.parse(readFileSync(`${SUGGESTIONS_DIR}/${f}`, 'utf8'));
      covered.push(...(doc.coveredPrs ?? []));
    } catch {}
  }
  return covered;
}

const state = loadState();
const covered = new Set([...state.processedPrs, ...coveredByFiles(), ...state.failed.map((f) => f.number)]);

console.log(`fetching merged PRs since ${state.lastRun ?? 'first run'}...`);
const prs = (await fetchMergedPrs(state.lastRun)).filter((p) => !covered.has(p.number));
console.log(`${prs.length} unprocessed merged PRs`);

if (prs.length === 0) {
  state.lastRun = new Date().toISOString();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  console.log('nothing to suggest; state updated');
  process.exit(0);
}

// Files are fetched lazily per candidate (only significant unlabeled PRs
// need them for grouping), to keep API calls low.
const candidates = [];
for (const pr of prs) {
  const withFiles = { ...pr, files: [] };
  const labels = (pr.labels ?? []).map((l) => l.name ?? l);
  const significant = labels.length > 0 || /^(feat|fix|docs|new|add)\b/.test(pr.title.toLowerCase());
  if (significant) {
    try {
      withFiles.files = await fetchFiles(pr.number);
    } catch (err) {
      console.error(`files fetch failed for #${pr.number}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  candidates.push(withFiles);
}

const { suggestions } = generateSuggestions(candidates, {
  alreadyCovered: [...covered],
  repo: REPO,
});
console.log(`${suggestions.length} suggestion(s) generated`);

mkdirSync(SUGGESTIONS_DIR, { recursive: true });
for (const s of suggestions) {
  const file = `${SUGGESTIONS_DIR}/${s.suggestedSlugBase}.json`;
  if (existsSync(file)) {
    console.log(`suggestion file exists: ${file}, skipping write`);
    continue;
  }
  writeFileSync(file, JSON.stringify({ status: 'suggested', createdAt: new Date().toISOString(), ...s }, null, 2) + '\n');
  console.log(`wrote ${file}: ${s.title}`);
}

// State advances only after every suggestion file is safely written.
state.lastRun = new Date().toISOString();
state.processedPrs = [...new Set([...state.processedPrs, ...prs.map((p) => p.number)])];
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
console.log('state updated');
