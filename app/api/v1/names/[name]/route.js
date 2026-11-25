import { withActor, json, publicRecord } from '../../../../../lib/api-v1.js';
import { getRecord } from '../../../../../lib/registry.js';
import { validateName } from '../../../../../lib/name.js';
import { sameLogin } from '../../../../../lib/edit.js';
import { updateRecord } from '../../../../../lib/record-update.js';

export const dynamic = 'force-dynamic';

const WRITABLE = ['records', 'subdomains', 'nameservers', 'ds', 'profile'];

export async function GET(request, { params }) {
  const { name } = await params;
  return withActor(request, 'read', async (actor) => {
    if (!validateName(name).ok) return json({ error: 'invalid_name' }, 400);
    let record;
    try {
      record = await getRecord(name, { token: process.env.CARD_TOKEN ?? process.env.REGISTRY_TOKEN });
    } catch {
      return json({ error: 'busy', retryInMs: 4000 }, 503, { 'Retry-After': '4' });
    }
    // A name owned by someone else answers exactly like a missing one: the
    // API manages your own names, it is not for probing other accounts.
    if (!record || !sameLogin(record.owner?.github, actor.login)) return json({ error: 'not_found' }, 404);
    return json(publicRecord(record));
  });
}

export async function PATCH(request, { params }) {
  const { name } = await params;
  return withActor(request, 'write', async (actor) => {
    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return json({ error: 'invalid_body', details: ['send a JSON object'] }, 400);
    }
    const unknown = Object.keys(raw).filter((k) => !WRITABLE.includes(k));
    if (unknown.length) {
      return json({ error: 'invalid_body', details: unknown.map((k) => `"${k}" cannot be set; allowed: ${WRITABLE.join(', ')}`) }, 400);
    }
    const out = await updateRecord({ actor, name, body: raw, token: process.env.REGISTRY_TOKEN });
    if (out.status === 403 && out.body.error === 'not_owner') return json({ error: 'not_found' }, 404);
    const { record, ...rest } = out.body;
    return json(record ? { ...rest, record: publicRecord(record) } : rest, out.status, out.headers);
  });
}
