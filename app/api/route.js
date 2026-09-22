// Discovery index for /api: the first thing an agent or integration probes.
// Answers with the surface map instead of a 404, so the API is findable
// without reading the OpenAPI spec first. The spec remains the contract.
export const dynamic = 'force-static';

const ENDPOINTS = {
  'GET /api/check?name=<name>': 'Is <name>.runs-on.dev available to claim?',
  'POST /api/claim': 'Claim a name for the signed-in GitHub account',
  'POST /api/records': 'Update the DNS records, subdomains, and profile of a name you own',
  'POST /api/release': 'Release your name back to the pool',
  'POST /api/swap': 'Trade your name for a different one',
  'GET /api/dns-check?name=<name>': 'Live DNS and serving status for a claimed name',
  'POST /api/tokens': 'Mint a 30-day sites:publish deploy token (GitHub session)',
  'POST /api/sites/deploy': 'Deploy a static site zip (Authorization: Bearer <deploy token>)',
  'GET /api/sites/deployments': 'List your static deployments',
  'POST /api/sites/rollback': 'Roll back to a previous deployment',
};

export function GET() {
  return Response.json({
    name: 'runs-on.dev',
    version: '1',
    description: 'Free subdomain registry: claim name.runs-on.dev, manage DNS records, and host static sites on them.',
    spec: 'https://runs-on.dev/openapi.json',
    mcp: 'https://runs-on.dev/.well-known/mcp',
    docs: 'https://runs-on.dev/docs',
    auth: 'GitHub OAuth session (sign in at https://runs-on.dev) or a rod1 deploy token (scope sites:publish, self-serve at /manage)',
    rate_limit: 'RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset headers on limited endpoints; 429 carries Retry-After',
    endpoints: ENDPOINTS,
  });
}
