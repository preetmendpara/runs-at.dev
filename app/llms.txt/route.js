import { buildLlmsTxt } from '../../lib/llms.js';

// Plain-text summary for AI assistants and crawlers. Regenerated on each
// deploy from static facts in lib/llms.js, no data fetch needed.
export const dynamic = 'force-static';

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
