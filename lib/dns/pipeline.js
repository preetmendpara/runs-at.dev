// validate -> diff -> apply to primary -> notify secondaries -> verify every
// target -> report. `ok` is true only when every step, and every target's
// verification, passed: a secondary that never caught up is a failure.
import { Resolver } from 'node:dns/promises';
import { validateDesired } from './records.js';
import { diffRecords } from './diff.js';

const setKey = (records) => [...new Set(records)].sort().join('\n');

// resolve(name, type) -> array of contents in presentation form.
export async function verifyRecords(desired, resolve) {
  const want = new Map();
  for (const r of desired) {
    const key = `${r.name}\t${r.type}`;
    if (!want.has(key)) want.set(key, []);
    want.get(key).push(r.content);
  }
  const mismatches = [];
  for (const [key, contents] of [...want].sort(([a], [b]) => a.localeCompare(b))) {
    const [name, type] = key.split('\t');
    let got;
    try {
      got = await resolve(name, type);
    } catch (err) {
      if (!['ENODATA', 'ENOTFOUND'].includes(err.code)) {
        mismatches.push({ name, type, want: contents, error: err.message });
        continue;
      }
      got = [];
    }
    if (setKey(got) !== setKey(contents)) {
      mismatches.push({ name, type, want: [...new Set(contents)].sort(), got: [...new Set(got)].sort() });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

export async function runPipeline({
  desired, provider, zone, primary, secondaries = [], owned, keep,
  maxDeletes = 25, dryRun = false, verifyAttempts = 5, verifyDelayMs = 5000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const report = { ok: false, stage: 'validate', errors: [], plan: null, applied: false, verification: [] };
  report.errors = validateDesired(desired);
  if (report.errors.length) return report;

  report.stage = 'diff';
  let plan;
  try {
    plan = diffRecords(desired, await provider.listRecords(), { zone, owned, keep });
  } catch (err) {
    report.errors.push(err.message);
    return report;
  }
  report.plan = plan;
  if (plan.deletes.length > maxDeletes) {
    // A short listing or an emptied registry reads as mass deletion; stop.
    report.errors.push(`refusing to delete ${plan.deletes.length} RRsets (limit ${maxDeletes})`);
    return report;
  }
  if (dryRun) return { ...report, ok: true, stage: 'dry-run' };

  try {
    report.stage = 'apply';
    report.applied = await provider.syncZone(plan);
    report.stage = 'notify';
    if (report.applied && secondaries.length) await provider.notify();
  } catch (err) {
    report.errors.push(err.message);
    return report;
  }

  // Verify the full intended state, minus what the diff refused as protected.
  report.stage = 'verify';
  const rejected = new Set(plan.rejected.map((s) => `${s.name}\t${s.type}`));
  const expected = desired.filter((r) => !rejected.has(`${r.name}\t${r.type}`));
  const targets = [primary, ...secondaries].filter(Boolean);
  if (targets.length === 0) {
    report.errors.push('no verification target configured');
    return report;
  }
  for (const target of targets) {
    let result;
    for (let attempt = 1; attempt <= verifyAttempts; attempt++) {
      result = await verifyRecords(expected, target.resolve);
      if (result.ok) break;
      if (attempt < verifyAttempts) await sleep(verifyDelayMs);
    }
    report.verification.push({ target: target.name, ...result });
  }
  report.ok = report.verification.every((v) => v.ok);
  report.stage = 'done';
  return report;
}

// A resolver that asks one server directly (no recursive cache in between)
// and answers in presentation form, for runPipeline targets.
export function serverResolver(ip) {
  const r = new Resolver({ timeout: 3000, tries: 2 });
  r.setServers([ip]);
  const dot = (h) => `${h.replace(/\.$/, '')}.`.toLowerCase();
  const quote = (t) => `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return async (name, type) => {
    const host = name.replace(/\.$/, '');
    switch (type) {
      case 'A': return r.resolve4(host);
      case 'AAAA': return r.resolve6(host);
      case 'CNAME': return (await r.resolveCname(host)).map(dot);
      case 'TXT': return (await r.resolveTxt(host)).map((chunks) => quote(chunks.join('')));
      case 'MX': return (await r.resolveMx(host)).map((m) => `${m.priority} ${dot(m.exchange)}`);
      case 'CAA': return (await r.resolveCaa(host)).map((c) => {
        const tag = ['issue', 'issuewild', 'iodef'].find((t) => t in c);
        return `${c.critical} ${tag} "${c[tag]}"`;
      });
      case 'SRV': return (await r.resolveSrv(host)).map((s) => `${s.priority} ${s.weight} ${s.port} ${dot(s.name)}`);
      default: throw new Error(`cannot verify ${type}`);
    }
  };
}
