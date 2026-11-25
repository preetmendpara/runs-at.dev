import { adminFromRequest } from '../../../../lib/admin.js';
import { validateName } from '../../../../lib/name.js';
import { getContentsMeta, putRecordUpdate, REPO, headers } from '../../../../lib/registry.js';
import { releaseSlot } from '../../../../lib/entitlements.js';
import { updateOwnerIndex } from '../../../../lib/owners.js';
import { registryChanged } from '../../../../lib/registry-cache.js';

// Admin-only actions on any claimed name. Each is a commit in the public
// registry with the admin's login on it, like every other write.
//
//   clear_delegation  remove custom nameservers and DS (back to runs-at.dev DNS)
//   reset_card        remove every record, subdomain and delegation: the name
//                     serves its profile card again (abuse takedown)
//   release           delete the name; its slot goes back to the owner
const ACTIONS = new Set(['clear_delegation', 'reset_card', 'release']);
const TOKEN = () => process.env.REGISTRY_TOKEN;
const uncached = (url, init) => fetch(url, { ...init, cache: 'no-store' });

export async function POST(request) {
  const gate = adminFromRequest(request);
  if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
  const admin = gate.session.login;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? '').trim().toLowerCase();
  const action = String(body.action ?? '');
  const reason = String(body.reason ?? '').trim().slice(0, 200);
  if (!validateName(name).ok) return Response.json({ error: 'invalid_name' }, { status: 400 });
  if (!ACTIONS.has(action)) return Response.json({ error: 'invalid_action' }, { status: 400 });

  const meta = await getContentsMeta(`domains/${name}.json`, { token: TOKEN(), fetchImpl: uncached }).catch(() => null);
  if (!meta) return Response.json({ error: 'not_found' }, { status: 404 });
  const owner = meta.data.owner?.github;

  if (action === 'release') {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/domains/${name}.json`, {
      method: 'DELETE',
      headers: { ...headers(TOKEN()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `admin release: ${name} (owner @${owner}) by @${admin}${reason ? ` — ${reason}` : ''}`, sha: meta.sha }),
    }).catch(() => null);
    if (!res?.ok) return Response.json({ error: res?.status === 409 ? 'stale' : 'write_failed' }, { status: res?.status === 409 ? 409 : 502 });
    registryChanged('admin release');
    // Best effort, as /api/release does: sync-owners rebuilds the index anyway.
    await releaseSlot(owner, name, { token: TOKEN(), fetchImpl: uncached }).catch(() => null);
    await updateOwnerIndex(owner, (names) => (names.includes(name) ? names.filter((n) => n !== name) : null), { token: TOKEN(), fetchImpl: uncached }).catch(() => null);
    return Response.json({ ok: true, action, name });
  }

  const head = { ...meta.data };
  delete head.nameservers;
  delete head.ds;
  if (action === 'reset_card') {
    head.records = {};
    delete head.subdomains;
  }
  const result = await putRecordUpdate(head, { token: TOKEN(), sha: meta.sha, editor: `${admin} (admin${reason ? `: ${reason}` : ''})`, fetchImpl: uncached });
  if (!result.ok) {
    const status = result.reason === 'stale' ? 409 : result.reason === 'ratelimited' ? 503 : 500;
    return Response.json({ error: result.reason }, { status });
  }
  registryChanged(`admin ${action}`);
  return Response.json({ ok: true, action, name, commit: result.commit ?? null });
}
