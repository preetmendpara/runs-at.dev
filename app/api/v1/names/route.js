import { withActor, json, publicRecord } from '../../../../lib/api-v1.js';
import { ownedNamesFor } from '../../../../lib/owned-names.js';

export const dynamic = 'force-dynamic';

export function GET(request) {
  return withActor(request, 'read', async (actor) => {
    const { names, records } = await ownedNamesFor(actor.login, { token: process.env.CARD_TOKEN ?? process.env.REGISTRY_TOKEN });
    return json({ names: names.map((n) => publicRecord(records[n])) });
  });
}
