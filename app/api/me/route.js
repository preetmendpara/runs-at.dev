import { sessionFromRequest } from '../../../lib/session.js';
import { ownedNamesFor } from '../../../lib/owned-names.js';
import { isAdmin } from '../../../lib/admin.js';

// What the nav needs to label its claim button: does this visitor already
// hold every name they may have? Signed-out visitors cost nothing (no
// registry reads); signed-in ones cost the same reads the homepage makes.
export async function GET(request) {
  const session = sessionFromRequest(request, process.env.SESSION_SECRET);
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!session?.login) return Response.json({ signedIn: false, names: [], slotsFree: 1 }, { headers });
  const { names, slotsFree } = await ownedNamesFor(session.login, { token: process.env.REGISTRY_TOKEN })
    .catch(() => ({ names: [], slotsFree: 1 }));
  return Response.json({ signedIn: true, admin: isAdmin(session), names, slotsFree }, { headers });
}
