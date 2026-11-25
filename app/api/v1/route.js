import { json } from '../../../lib/api-v1.js';

export const dynamic = 'force-dynamic';

// The index: what exists, how to authenticate. Docs live at /docs/api.
export function GET() {
  return json({
    name: 'runs-at.dev API',
    version: 'v1',
    docs: 'https://runs-at.dev/docs/api',
    auth: 'Authorization: Bearer rat1.... (create a token at https://runs-at.dev/manage)',
    endpoints: {
      'GET /api/v1/me': 'who the token belongs to and the names it can manage',
      'GET /api/v1/names': 'every name you own, with its DNS',
      'GET /api/v1/names/{name}': 'one name you own',
      'PATCH /api/v1/names/{name}': 'change records, subdomains, nameservers, ds or profile',
      'DELETE /api/v1/tokens': 'revoke every API token for your account',
    },
  });
}
