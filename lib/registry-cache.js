// The cached entry point the pages call. Kept apart from registry-snapshot.js
// so the decisions there stay importable under plain `node --test`, which has
// no Next runtime behind `next/cache`.
//
// One cache entry, tagged `registry`, shared by the homepage and /stats: the
// two pages can no longer disagree, because they render from the same object.
// It is refreshed three ways, any one of which is enough:
//   - a successful claim / release / swap revalidates the tag directly;
//   - the GitHub push webhook (app/api/revalidate) revalidates it for any
//     commit touching domains/, which covers PR merges and manual edits;
//   - the TTL below, so a missed webhook costs at most five minutes.
// `.js` spelled out: the route handlers that import this are also loaded by
// plain `node --test`, whose ESM resolver will not guess the extension.
import { unstable_cache, revalidateTag } from 'next/cache.js';
import { loadRegistrySnapshot, REGISTRY_TAG } from './registry-snapshot.js';

export const REGISTRY_TTL_SECONDS = 300;

export const getRegistrySnapshot = unstable_cache(
  () => loadRegistrySnapshot({ token: process.env.REGISTRY_TOKEN }),
  ['registry-snapshot-v1'],
  { tags: [REGISTRY_TAG], revalidate: REGISTRY_TTL_SECONDS },
);

// After a write we know the registry changed, so the next render must not be
// served the old figure: expire immediately rather than stale-while-revalidate.
// Never throws: a claim that committed must not turn into an error because a
// cache could not be told about it (the TTL catches up regardless).
export function registryChanged(reason) {
  try {
    revalidateTag(REGISTRY_TAG, { expire: 0 });
  } catch (err) {
    console.warn(`registry-cache: revalidate after ${reason} failed: ${err.message}`);
  }
}
