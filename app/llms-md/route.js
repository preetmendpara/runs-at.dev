import { buildLlmsTxt } from '../../lib/llms.js';

// The same agent index as /llms.txt, served as text/markdown for requests
// that negotiate for it (Accept: text/markdown). proxy.js rewrites page
// requests that prefer markdown here, and stamps Vary: Accept on every
// HTML response so caches never serve one variant for the other.
export const dynamic = 'force-static';

export function GET() {
  // Vary is declared on the response itself, not just in config headers:
  // Vercel's edge strips header-level Vary from cached page responses, and
  // a markdown variant cached as HTML (or vice versa) is exactly the failure
  // content negotiation exists to prevent.
  return new Response(buildLlmsTxt(), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      vary: 'Accept, Accept-Encoding, rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch',
    },
  });
}
