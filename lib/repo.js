// The public registry on GitHub, as a browser-safe module: no Buffer, no env
// reads, no server-only imports, so client components can link to a commit
// without pulling lib/registry.js into the bundle.
//
// lib/registry.js still lets REGISTRY_REPO point writes at a fork for testing.
// Links shown to visitors deliberately do not follow that override -- they
// should always name the real registry.
export const REPO_SLUG = 'zordhalo/runs-on.dev';
export const REPO_URL = `https://github.com/${REPO_SLUG}`;

export function commitUrl(sha) {
  return typeof sha === 'string' && sha ? `${REPO_URL}/commit/${sha}` : null;
}

export function shortSha(sha) {
  return typeof sha === 'string' && sha ? sha.slice(0, 7) : null;
}
