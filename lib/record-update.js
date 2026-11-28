// The one implementation of "an owner changes their name's record". Both the
// browser path (/api/records, session cookie) and the REST API
// (/api/v1/names/<name>, API token) call this, so a rule added here holds for
// both and neither can drift into a weaker copy.
//
// `actor` is the signed-in identity: { login, createdAt, publicRepos }. The
// result is { status, body, headers? } for the route to turn into a Response.
import { validateEdit, isUnchanged } from './edit.js';
import { getContentsMeta, putRecordUpdate } from './registry.js';
import { validateName } from './name.js';
import { normalizeNameserver } from './schema.js';
import { mayDelegate, checkNameservers } from './delegation.js';
import { checkDs } from './dnskey.js';

const BUSY = { status: 503, body: { error: 'busy', retryInMs: 4000 }, headers: { 'Retry-After': '4' } };

export async function updateRecord({ actor, name: rawName, body = {}, token, deps = {} }) {
  const {
    readMeta = (path) => getContentsMeta(path, { token }),
    writeRecord = (head, opts) => putRecordUpdate(head, { token, ...opts }),
    probeNameservers = checkNameservers,
    probeDs = checkDs,
  } = deps;

  const name = typeof rawName === 'string' ? rawName.trim().toLowerCase() : '';
  if (!validateName(name).ok) return { status: 400, body: { error: 'invalid_name' } };

  let meta;
  try {
    meta = await readMeta(`domains/${name}.json`);
  } catch {
    // Fail closed: a read that could not run is never "no such record".
    return BUSY;
  }
  if (!meta) return { status: 404, body: { error: 'not_found' } };

  // Replace only what the request actually sent; `null` means "remove it".
  const head = { ...meta.data };
  if ('records' in body) head.records = body.records;
  if ('subdomains' in body) {
    const subs = body.subdomains;
    const empty = subs === null || (typeof subs === 'object' && Object.keys(subs).length === 0);
    if (empty) delete head.subdomains;
    else head.subdomains = subs;
  }
  if ('profile' in body) {
    if (body.profile === null) delete head.profile;
    else head.profile = body.profile;
  }
  let delegating = false;
  if ('nameservers' in body) {
    const ns = Array.isArray(body.nameservers) ? body.nameservers.map(normalizeNameserver).filter(Boolean) : [];
    if (ns.length === 0) {
      delete head.nameservers;
      delete head.ds;
    } else {
      head.nameservers = ns;
      delegating = JSON.stringify(ns) !== JSON.stringify(meta.data.nameservers ?? []);
    }
  }
  if ('ds' in body && head.nameservers) {
    const ds = Array.isArray(body.ds) ? body.ds.map((d) => String(d).trim().replace(/\s+/g, ' ')).filter(Boolean) : [];
    if (ds.length === 0) delete head.ds;
    else head.ds = ds;
  }

  // Ownership first, before anything that probes the network or answers
  // differently depending on the record's contents.
  const owns = validateEdit({ base: meta.data, head: meta.data, editor: actor.login });
  if (!owns.ok) return { status: 403, body: { error: 'not_owner', details: owns.errors } };

  const dsChanged = JSON.stringify(head.ds ?? []) !== JSON.stringify(meta.data.ds ?? []);
  if (head.nameservers && (delegating || dsChanged)) {
    const gate = mayDelegate(actor);
    if (!gate.ok) return { status: 403, body: { error: 'delegation_not_allowed', details: [gate.reason] } };
    const probe = await probeNameservers(`${name}.runs-at.dev`, head.nameservers);
    if (!probe.ok) {
      return {
        status: 400,
        body: {
          error: 'nameservers_not_ready',
          details: probe.results.filter((r) => !r.ok).map((r) => `${r.host} ${r.detail}. Add ${name}.runs-at.dev as a zone there first.`),
          results: probe.results,
        },
      };
    }
    // A DS that matches no served key would break DNSSEC for the name everywhere.
    if (head.ds?.length) {
      const server = probe.results.find((r) => r.ok && r.address)?.address;
      const ds = server
        ? await probeDs(`${name}.runs-at.dev`, head.ds, server)
        : { ok: false, problems: ['could not reach your nameservers to check the DS'] };
      if (!ds.ok) return { status: 400, body: { error: 'nameservers_not_ready', details: ds.problems } };
    }
  }

  if (isUnchanged(meta.data, head)) return { status: 200, body: { updated: name, unchanged: true, commit: null } };

  const decision = validateEdit({ base: meta.data, head, editor: actor.login });
  if (!decision.ok) {
    const forbidden = decision.errors.some((e) => e.startsWith('only the owner'));
    return { status: forbidden ? 403 : 400, body: { error: forbidden ? 'not_owner' : 'invalid_record', details: decision.errors } };
  }

  const result = await writeRecord(head, { sha: meta.sha, editor: actor.login });
  if (result.ok) return { status: 200, body: { updated: name, commit: result.commit ?? null, record: head } };
  if (result.reason === 'stale') return { status: 409, body: { error: 'stale' } };
  if (result.reason === 'ratelimited') return BUSY;
  return { status: 500, body: { error: 'server_error' } };
}
