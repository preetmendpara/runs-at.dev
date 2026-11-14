// Cloudflare adapter: the calls scripts/sync-dns.mjs makes today, behind the
// provider interface. Same endpoints, same record bodies (toCloudflareRecord:
// ttl 300, DNS-only), same 404-on-delete-is-success rule, same paging.
//
// The default sync path in scripts/sync-dns.mjs deliberately still makes these
// calls inline rather than through this object, so production behaviour is
// byte-for-byte what it was. ponytail: move the script onto this adapter in a
// separate, reviewable change.
import { cloudflareZonePath, fromCloudflareRecord, toCloudflareRecord, formatApiError } from '../dns.js';
import { verifyRecords } from './pipeline.js';

export function createCloudflareProvider({ token, zoneId, domain = 'runs-at.dev', fetch = globalThis.fetch } = {}) {
  const call = (path, init = {}) =>
    fetch(`https://api.cloudflare.com/client/v4${cloudflareZonePath(zoneId)}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  const fail = async (what, res) => {
    throw new Error(`cloudflare: ${what}: ${formatApiError(res.status, await res.text().catch(() => ''))}`);
  };

  const provider = {
    async createZone() { throw new Error('cloudflare: zones are created in the dashboard, not by the sync'); },
    async deleteZone() { throw new Error('cloudflare: zone deletion is not supported'); },
    async getZone() {
      const res = await call('');
      if (res.status === 404) return null;
      if (!res.ok) await fail('get zone', res);
      return (await res.json()).result;
    },
    async listRecords() {
      const found = [];
      for (let page = 1; ; page++) {
        const res = await call(`/dns_records?per_page=100&page=${page}`);
        if (!res.ok) await fail('list records', res);
        const body = await res.json();
        found.push(...body.result.map((r) => fromCloudflareRecord(r, domain)));
        if (page >= (body.result_info?.total_pages ?? 1)) return found;
      }
    },
    async createRecord(change) {
      const res = await call('/dns_records', { method: 'POST', body: JSON.stringify(toCloudflareRecord(change, domain)) });
      if (!res.ok) await fail(`create ${change.type} ${change.name}`, res);
      return true;
    },
    async updateRecord(change) {
      const res = await call(`/dns_records/${encodeURIComponent(change.id)}`, { method: 'PUT', body: JSON.stringify(toCloudflareRecord(change, domain)) });
      if (!res.ok) await fail(`update ${change.type} ${change.name}`, res);
      return true;
    },
    async deleteRecord(stale) {
      const res = await call(`/dns_records/${encodeURIComponent(stale.id)}`, { method: 'DELETE' });
      if (res.status === 404) return true; // already gone: desired state holds
      if (!res.ok) await fail(`delete ${stale.type} ${stale.name}`, res);
      return true;
    },
    // plan = reconcileDnsRecords() output; deletes first, as the script does.
    async syncZone({ remove = [], create = [] }) {
      for (const r of remove) await provider.deleteRecord(r);
      for (const c of create) await provider.createRecord(c);
      return true;
    },
    verifyZone: (desired, resolve) => verifyRecords(desired, resolve),
    async healthCheck() {
      try {
        return { ok: Boolean(await provider.getZone()), detail: 'zone reachable' };
      } catch (err) {
        return { ok: false, detail: err.message };
      }
    },
  };
  return provider;
}
