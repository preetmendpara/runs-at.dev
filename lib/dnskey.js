// Checks a DS record against the DNSKEYs a nameserver actually serves, before
// the DS is published at runs-at.dev. A DS that matches no key makes the name
// SERVFAIL on every validating resolver (Google, Cloudflare, Quad9), which is
// worse than no DNSSEC at all.
//
// Node's resolver has no DNSKEY query, so this sends one raw UDP query
// (RFC 1035 wire format, DO bit off: only the DNSKEY RRset is needed) and
// derives each key's DS (RFC 4034 §5.1.4) to compare.
import dgram from 'node:dgram';
import { createHash } from 'node:crypto';

export function nameToWire(fqdn) {
  const labels = String(fqdn).replace(/\.$/, '').toLowerCase().split('.').filter(Boolean);
  return Buffer.concat([...labels.map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l, 'ascii')])), Buffer.from([0])]);
}

export function buildQuery(fqdn, type = 48, id = Math.floor(Math.random() * 65535)) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0000, 2); // standard query, no recursion
  header.writeUInt16BE(1, 4);
  const q = Buffer.alloc(4);
  q.writeUInt16BE(type, 0);
  q.writeUInt16BE(1, 2);
  return Buffer.concat([header, nameToWire(fqdn), q]);
}

function skipName(buf, off) {
  for (;;) {
    const len = buf[off];
    if (len === 0) return off + 1;
    if ((len & 0xc0) === 0xc0) return off + 2;
    off += len + 1;
  }
}

// DNSKEY RDATAs (flags, protocol, algorithm, key) from a response.
export function parseDnskeys(buf) {
  const qd = buf.readUInt16BE(4);
  const an = buf.readUInt16BE(6);
  let off = 12;
  for (let i = 0; i < qd; i++) off = skipName(buf, off) + 4;
  const keys = [];
  for (let i = 0; i < an; i++) {
    off = skipName(buf, off);
    const type = buf.readUInt16BE(off);
    const rdlen = buf.readUInt16BE(off + 8);
    const rdata = buf.subarray(off + 10, off + 10 + rdlen);
    if (type === 48) keys.push(Buffer.from(rdata));
    off += 10 + rdlen;
  }
  return keys;
}

export function keyTag(rdata) {
  let ac = 0;
  for (let i = 0; i < rdata.length; i++) ac += i & 1 ? rdata[i] : rdata[i] << 8;
  ac += (ac >> 16) & 0xffff;
  return ac & 0xffff;
}

const DIGEST = { 1: 'sha1', 2: 'sha256', 4: 'sha384' };

// The DS strings ("tag alg type DIGEST") each key yields, for every digest type.
export function dsFor(fqdn, rdata) {
  const owner = nameToWire(fqdn);
  const tag = keyTag(rdata);
  const alg = rdata[3];
  return Object.entries(DIGEST).map(([type, algo]) =>
    `${tag} ${alg} ${type} ${createHash(algo).update(Buffer.concat([owner, rdata])).digest('hex').toUpperCase()}`);
}

export function queryDnskeys(fqdn, server, { timeoutMs = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket(server.includes(':') ? 'udp6' : 'udp4');
    const timer = setTimeout(() => { sock.close(); reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })); }, timeoutMs);
    sock.once('message', (msg) => { clearTimeout(timer); sock.close(); try { resolve(parseDnskeys(msg)); } catch (err) { reject(err); } });
    sock.once('error', (err) => { clearTimeout(timer); sock.close(); reject(err); });
    sock.send(buildQuery(fqdn), 53, server);
  });
}

// Every DS the owner entered must match a key their server serves.
// `fetchKeys` is injected for tests.
export async function checkDs(fqdn, dsList, server, { fetchKeys = queryDnskeys } = {}) {
  let keys;
  try {
    keys = await fetchKeys(fqdn, server);
  } catch (err) {
    return { ok: false, problems: [`could not read DNSKEY from ${server} (${err.code ?? err.message})`] };
  }
  if (!keys.length) return { ok: false, problems: ['your nameservers serve no DNSKEY for this name: turn DNSSEC on there first, or leave DS empty'] };
  const valid = new Set(keys.flatMap((k) => dsFor(fqdn, k)));
  const norm = (d) => {
    const [tag, alg, type, digest] = String(d).trim().split(/\s+/);
    return `${Number(tag)} ${Number(alg)} ${Number(type)} ${String(digest ?? '').toUpperCase()}`;
  };
  const problems = dsList.filter((d) => !valid.has(norm(d))).map((d) => `DS "${d}" matches none of the keys your nameservers serve`);
  return { ok: problems.length === 0, problems };
}
