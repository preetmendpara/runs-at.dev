import { withActor, json } from '../../../../lib/api-v1.js';
import { ownedNamesFor } from '../../../../lib/owned-names.js';

export const dynamic = 'force-dynamic';

export function GET(request) {
  return withActor(request, 'read', async (actor) => {
    const { names, slotsFree } = await ownedNamesFor(actor.login, { token: process.env.CARD_TOKEN ?? process.env.REGISTRY_TOKEN });
    return json({ login: actor.login, names, slotsFree, tokenExpiresAt: new Date(actor.exp).toISOString() });
  });
}
