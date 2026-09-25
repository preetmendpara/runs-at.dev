// Near-miss suggestions for the "this name is available" page: claimed names
// within Levenshtein distance 2 of the one a visitor tried. Kept out of the
// page module so it can be tested -- Next.js does not allow extra exports
// from a page file.

// Simple Levenshtein distance, enough for short subdomain names.
export function editDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return matrix[a.length][b.length];
}

// Claimed names from a Git Trees API response for domains/
// (GET /repos/{owner}/{repo}/git/trees/main:domains). The Trees API lists a
// directory in one request with no 1,000-entry cap -- the Contents API it
// replaces returned only the first 1,000 files, so past that point names were
// silently missing from suggestions. Only JSON blobs are names; .gitkeep and
// any subdirectory are skipped.
export function claimedNamesFromTree(body) {
  const entries = Array.isArray(body?.tree) ? body.tree : [];
  return entries
    .filter((e) => e.type === 'blob' && typeof e.path === 'string' && e.path.endsWith('.json'))
    .map((e) => e.path.slice(0, -'.json'.length));
}

// The three closest claimed names, nearest first, never the name itself.
export function similarNames(attempted, claimed) {
  return claimed
    .filter((c) => c !== attempted && editDistance(attempted, c) <= 2)
    .map((c) => ({ name: c, distance: editDistance(attempted, c) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((s) => s.name);
}
