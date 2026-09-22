// Content suggestion engine: turns merged pull requests into structured
// blog-post suggestions for human review. Pure and dependency-free — the
// cron script injects a GitHub fetch; the tests inject fixtures.
//
// Significance: registry churn (claim:, index:, swap:, records:, release:
// commits are the daily life of a subdomain registry) and housekeeping
// (chore, ci, deps) never become suggestions. A PR can also opt out with
// the skip-blog label, or in with the blog label.
//
// Grouping: PRs that share a category AND touch a common directory (or
// share a significant title keyword) collapse into one suggestion, so five
// PRs building one integration become one article.

const SKIP_TITLE_PREFIXES = [
  'claim:', 'index:', 'swap:', 'records:', 'release:', 'revert "claim:',
  'chore', 'ci:', 'deps', 'bump', 'build:', 'lint', 'format',
];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'with', 'from',
  'add', 'adds', 'added', 'fix', 'fixes', 'fixed', 'update', 'updates', 'updated',
  'improve', 'improves', 'improved', 'change', 'changes', 'changed', 'new',
  'use', 'uses', 'make', 'makes', 'support', 'supports', 'remove', 'removes',
  'this', 'that', 'when', 'so', 'it', 'its', 'by', 'at', 'as', 'is', 'are',
  'not', 'no', 'now', 'into', 'about', 'instead', 'without', 'their', 'them',
]);

function titleWords(title) {
  return String(title)
    .toLowerCase()
    .replace(/^[a-z]+:\s*/, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

function categoryOf(pr) {
  const labels = (pr.labels ?? []).map((l) => l.name ?? l);
  if (labels.includes('skip-blog')) return null;
  if (labels.includes('blog') || labels.includes('enhancement') || labels.includes('feature')) return 'feature';
  if (labels.includes('documentation')) return 'docs';
  if (labels.includes('bug')) return 'fix';
  const title = String(pr.title ?? '').toLowerCase();
  if (title.startsWith('feat') || title.startsWith('add ') || title.startsWith('new ')) return 'feature';
  if (title.startsWith('fix')) return 'fix';
  if (title.startsWith('docs')) return 'docs';
  if (title.startsWith('release')) return 'release';
  return null; // unlabeled housekeeping: not documented
}

// A PR is worth documenting when it declares itself (label or conventional
// prefix) as something a reader would care about, and nobody opted out.
export function isSignificant(pr) {
  const labels = (pr.labels ?? []).map((l) => l.name ?? l);
  if (labels.includes('skip-blog')) return false;
  if (labels.includes('blog') || labels.includes('enhancement') || labels.includes('feature') || labels.includes('documentation') || labels.includes('bug')) return true;
  const title = String(pr.title ?? '').toLowerCase();
  if (SKIP_TITLE_PREFIXES.some((p) => title.startsWith(p))) return false;
  return /^(feat|fix|docs|new|add)\b/.test(title);
}

// Common directory prefix across the PR's files (first two segments), or ''.
function commonPrefix(files) {
  if (!files?.length) return '';
  const prefixes = files.map((f) => String(f).split('/').slice(0, 2).join('/'));
  const first = prefixes[0];
  return prefixes.every((p) => p === first) ? first : '';
}

function keywords(title) {
  return titleWords(title).slice(0, 4);
}

function sameGroup(a, b) {
  if (a.category !== b.category) return false;
  const kwA = new Set(a.keywords);
  const shared = b.keywords.filter((w) => kwA.has(w)).length;
  if (shared >= 2) return true;
  if (a.prefix && a.prefix === b.prefix && a.prefix !== '') return true;
  return false;
}

// Groups significant PRs into related clusters. Input: significant PRs with
// { number, title, labels, files, url, mergedAt }.
export function groupCandidates(prs) {
  const enriched = prs.map((pr) => ({
    pr,
    category: categoryOf(pr) ?? 'feature',
    keywords: keywords(pr.title),
    prefix: commonPrefix(pr.files),
  }));

  const groups = [];
  for (const item of enriched) {
    const hit = groups.find((g) => sameGroup(item, g));
    if (hit) {
      hit.items.push(item);
      hit.keywords = keywords([...new Set([...hit.keywords, ...item.keywords])].slice(0, 8).join(' '));
    } else {
      groups.push({ ...item, items: [item] });
    }
  }
  return groups;
}

const CATEGORY_LABEL = { feature: 'Feature', fix: 'Bug fix', docs: 'Docs', release: 'Release' };

// Builds the suggestion document a human reviews: title, summary, why, the
// covered PRs, an outline, key points, links, and SEO fields. The outline is
// a starting skeleton — humans rewrite it; that is the workflow.
export function buildSuggestion(group, { repo = 'zordhalo/runs-on.dev' } = {}) {
  const titles = group.items.map((i) => String(i.pr.title).replace(/^[a-z]+:\s*/i, ''));
  const prNumbers = group.items.map((i) => i.pr.number);
  const topKeyword = group.keywords[0];
  const single = group.items.length === 1;
  const subject = single
    ? titles[0]
    : `${titles[0].split(' ').slice(0, 4).join(' ')} and ${group.items.length - 1} more ${group.category === 'docs' ? 'docs' : 'related'} changes`;

  const title = `${subject.charAt(0).toUpperCase()}${subject.slice(1)}`;
  const summary = single
    ? `Covers ${group.items[0].pr.title} (#${prNumbers[0]}), merged into the registry.`
    : `Covers ${group.items.length} merged pull requests (#${prNumbers.join(', #')}): ${titles.join('; ')}.`;

  const files = [...new Set(group.items.flatMap((i) => i.pr.files ?? []))].slice(0, 12);
  const links = [
    ...group.items.map((i) => ({ label: `PR #${i.pr.number}: ${i.pr.title}`, url: i.pr.url ?? `https://github.com/${repo}/pull/${i.pr.number}` })),
  ];

  return {
    title,
    summary,
    why: single
      ? `Ships a change readers of the registry would notice. Worth documenting so users discover it and search engines can index it.`
      : `${group.items.length} related pull requests landed as one effort; documenting them together gives readers the story instead of fragmenting it across release notes.`,
    prs: group.items.map((i) => ({ number: i.pr.number, title: i.pr.title, url: i.pr.url ?? `https://github.com/${repo}/pull/${i.pr.number}` })),
    category: group.category,
    tags: [CATEGORY_LABEL[group.category] ?? group.category, ...(topKeyword ? [topKeyword] : [])],
    outline: [
      `What changed (one paragraph, plain language)`,
      `Why it matters for people with a ${'name.runs-on.dev'} name`,
      ...(files.length ? [`How it works (mention: ${files.slice(0, 4).join(', ')})`] : [`How it works`]),
      `How to use it (link the relevant guide or the manage page)`,
      `What is next`,
    ],
    keyPoints: titles,
    links,
    seo: {
      title: `${title} · runs-on.dev`.slice(0, 60),
      metaDescription: summary.slice(0, 155),
    },
    coveredPrs: prNumbers,
    suggestedSlugBase: titleWords(title).slice(0, 5).join('-') || `update-${prNumbers[0]}`,
  };
}

// End to end: significant filter -> dedupe against already-covered PRs ->
// group -> build. alreadyCovered: PR numbers a previous run (or a published
// post) already accounted for.
export function generateSuggestions(prs, { alreadyCovered = [], repo } = {}) {
  const covered = new Set(alreadyCovered);
  const fresh = prs.filter((pr) => !covered.has(pr.number) && isSignificant(pr));
  const groups = groupCandidates(fresh);
  const suggestions = groups.map((g) => buildSuggestion(g, { repo }));
  return { suggestions, seen: prs.map((p) => p.number), skipped: prs.length - fresh.length };
}
