// PowerDNS Authoritative HTTP API adapter (/api/v1). Config from env:
// PDNS_API_URL (e.g. http://10.0.0.5:8081), PDNS_API_KEY, PDNS_ZONE.
// The key is only ever sent as the X-API-Key header; it never appears in an
// error, a log line or a returned value.
import { verifyRecords } from './pipeline.js';

export function createPowerDnsProvider({
  apiUrl = process.env.PDNS_API_URL,
  apiKey = process.env.PDNS_API_KEY,
  zone = process.env.PDNS_ZONE || 'runs-at.dev',
  server = 'localhost',
  fetch = globalThis.fetch,
  retries = 3,
  backoffMs = 250,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  if (!apiUrl || !apiKey) throw new Error('powerdns: PDNS_API_URL and PDNS_API_KEY are required');
  const apex = `${zone.replace(/\.$/, '')}.`;
  const base = `${apiUrl.replace(/\/$/, '')}/api/v1/servers/${server}`;
  const zonePath = `/zones/${encodeURIComponent(apex)}`;

  // Retries network errors and 5xx with exponential backoff; 4xx is final.
  async function request(method, path, body) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
      let res;
      try {
        res = await fetch(`${base}${path}`, {
          method,
          headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (err) {
        lastError = new Error(`powerdns: ${method} ${path}: network error: ${err.message}`);
        continue;
      }
      if (res.ok) {
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      }
      const detail = await res.text().catch(() => '');
      let message = detail.trim();
      try { message = JSON.parse(detail).error ?? message; } catch { /* raw body */ }
      const err = new Error(`powerdns: ${method} ${path}: ${res.status}${message ? ` ${message}` : ''}`);
      err.status = res.status;
      if (res.status < 500) throw err;
      lastError = err;
    }
    throw lastError;
  }

  const patch = (rrsets) => request('PATCH', zonePath, { rrsets });
  const replace = (s) => ({
    name: s.name, type: s.type, ttl: s.ttl, changetype: 'REPLACE',
    records: s.records.map((content) => ({ content, disabled: false })),
  });
  const remove = (s) => ({ name: s.name, type: s.type, changetype: 'DELETE' });

  const provider = {
    zone: apex,
    async createZone({ kind = 'Master', nameservers = [], soaEditApi = 'INCEPTION-INCREMENT' } = {}) {
      return request('POST', '/zones', { name: apex, kind, nameservers, soa_edit_api: soaEditApi });
    },
    deleteZone: () => request('DELETE', zonePath),
    async getZone() {
      try {
        return await request('GET', zonePath);
      } catch (err) {
        if (err.status === 404 || err.status === 422) return null;
        throw err;
      }
    },
    async listRecords() {
      const z = await provider.getZone();
      if (!z) throw new Error(`powerdns: zone ${apex} does not exist`);
      return (z.rrsets ?? []).flatMap((s) =>
        s.records.filter((r) => !r.disabled).map((r) => ({ name: s.name, type: s.type, ttl: s.ttl, content: r.content })));
    },
    // These take RRsets ({ name, type, ttl, records: [content] }).
    createRecord: (s) => patch([replace(s)]),
    updateRecord: (s) => patch([replace(s)]),
    deleteRecord: (s) => patch([remove(s)]),
    rectify: () => request('PUT', `${zonePath}/rectify`),
    notify: () => request('PUT', `${zonePath}/notify`),
    // One PATCH, so PowerDNS applies the whole plan or none of it.
    async syncZone({ creates = [], updates = [], deletes = [] }) {
      const rrsets = [...deletes.map(remove), ...creates.map(replace), ...updates.map(replace)];
      if (rrsets.length === 0) return false;
      await patch(rrsets);
      await provider.rectify();
      return true;
    },
    verifyZone: (desired, resolve) => verifyRecords(desired, resolve),
    async healthCheck() {
      try {
        const info = await request('GET', '');
        return { ok: true, detail: `${info?.daemon_type ?? 'pdns'} ${info?.version ?? ''}`.trim() };
      } catch (err) {
        return { ok: false, detail: err.message };
      }
    },
  };
  return provider;
}
