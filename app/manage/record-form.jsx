'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { commitUrl, shortSha } from '../../lib/repo.js';
import {
  modeOf, buildProfile, profileToRows,
  recordsToRows, rowsToRecords, validateRow, ROW_TYPES,
} from '../../lib/record-fields.js';
import { siteStatus, friendlyError, verifyRows, deleteConsequence, CHECK_SCHEDULE_MS } from '../../lib/manage-status.js';

const MAX_LINKS = 8;

// The one input look for the whole form: transparent field inside a slit
// outline, chalk text, the line brightening on focus. Contrast carries the
// state, no fills.
const INPUT =
  'slit-input w-full bg-transparent px-3 py-2 font-(family-name:--font-mono) text-sm text-(--color-ink) placeholder:text-(--color-muted)/70';

// One checker for the whole page: the badge, the panel and the Check now
// button all read it, so a name is never described two different ways at
// once. /api/dns-check allows 10 checks a minute per name and answers 429
// past that; a refusal schedules one retry instead of being swallowed, which
// is what used to leave the old panel showing "checking DNS…" forever.
function useSiteCheck(name) {
  const [state, setState] = useState({ phase: 'checking', check: null, checkedAt: null, note: null });
  const timers = useRef([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const run = useCallback(async () => {
    setState((prev) => ({ ...prev, phase: 'checking', note: null }));
    try {
      const res = await fetch(`/api/dns-check?name=${encodeURIComponent(name)}`);
      if (res.status === 429) {
        const seconds = Math.max(5, Number(res.headers.get('Retry-After')) || 10);
        setState((prev) => ({ ...prev, phase: 'idle', note: `Checked too often. Trying again in ${seconds} seconds.` }));
        timers.current.push(setTimeout(() => { run(); }, seconds * 1000));
        return;
      }
      if (!res.ok) {
        setState((prev) => ({ ...prev, phase: 'idle', note: 'Could not check just now. Press Check now to retry.' }));
        return;
      }
      setState({ phase: 'idle', check: await res.json(), checkedAt: Date.now(), note: null });
    } catch {
      setState((prev) => ({ ...prev, phase: 'idle', note: 'Could not reach the checker. Press Check now to retry.' }));
    }
  }, [name]);

  // One check on arrival, so the page always opens on the truth rather than
  // on whatever the record file implies.
  useEffect(() => {
    run();
    return clearTimers;
  }, [run, clearTimers]);

  // A fixed, finite schedule after a save instead of an interval that never
  // stops: DNS needs the sync workflow to run first, and an open tab must not
  // keep spending the rate limit all day.
  const recheckAfterSave = useCallback(() => {
    clearTimers();
    CHECK_SCHEDULE_MS.forEach((delay) => {
      timers.current.push(setTimeout(() => { run(); }, delay));
    });
  }, [clearTimers, run]);

  return { ...state, run, recheckAfterSave };
}

export default function RecordForm({ name, record }) {
  const [url, setUrl] = useState(record.records?.URL ?? "");
  const [status, setStatus] = useState(null);
  const [errors, setErrors] = useState([]);
  const [commit, setCommit] = useState(null);
  const [displayName, setDisplayName] = useState(record.profile?.name ?? "");
  const [bio, setBio] = useState(record.profile?.bio ?? "");
  const [linkRows, setLinkRows] = useState(() => profileToRows(record.profile));
  const site = useSiteCheck(name);
  // The moment of the last successful save. Inside the publishing window a
  // name still answering with the card is mid-publish, not broken.
  const [savedAt, setSavedAt] = useState(null);
  // One row per published record, the shape a DNS console shows: the name
  // itself and every subdomain under it. Seeded from the committed record and
  // folded back by rowsToRecords on save.
  const [dnsRows, setDnsRows] = useState(() => recordsToRows(record));

  function setLinkRow(i, patch) { setLinkRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r))); setStatus(null); }
  function removeLink(i) { setLinkRows((rows) => rows.filter((_, j) => j !== i)); setStatus(null); }

  // One payload, whatever the owner touched: every DNS row, the redirect
  // (published as records.URL, served by the app), and the profile card.
  function payload() {
    const target = url.trim();
    return {
      ...rowsToRecords(dnsRows, { keep: target ? { URL: target } : {} }),
      profile: buildProfile({ name: displayName, bio, linkRows }) ?? null,
    };
  }

  async function save(event) {
    event.preventDefault();
    setStatus("saving");
    setErrors([]);
    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ...payload() }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setCommit(body.commit ?? null);
      setStatus(body.unchanged ? "unchanged" : "saved");
      // Only a real change needs watching: an unchanged save publishes
      // nothing, so re-checking would spend the rate limit for no reason.
      if (!body.unchanged) { setSavedAt(Date.now()); site.recheckAfterSave(); }
      return;
    }
    setErrors(friendlyError(res.status, body));
    setStatus("error");
  }

  const sha = shortSha(commit);
  // The same reading everywhere on the page, refreshed by every check rather
  // than frozen at page load.
  const statusPill = site.phase === "checking" && !site.check
    ? { label: "Checking…", tone: "checking" }
    : siteStatus(site.check, modeOf(record.records), record.records);

  // What "unsaved changes" means, without a dirty flag on every input.
  const pending = JSON.stringify(payload());
  const committed = JSON.stringify({
    records: record.records ?? {},
    subdomains: record.subdomains ?? {},
    profile: record.profile ?? null,
  });
  const dirty = pending !== committed;

  function discard() {
    setStatus(null);
    setErrors([]);
    setUrl(record.records?.URL ?? "");
    setDnsRows(recordsToRows(record));
    setDisplayName(record.profile?.name ?? "");
    setBio(record.profile?.bio ?? "");
    setLinkRows(profileToRows(record.profile));
  }

  const noRecords = dnsRows.length === 0 && !url.trim();

  // Laid out like a registrar DNS screen: the records table is the page;
  // redirect and profile card are small settings beneath it.
  return (
    <form onSubmit={save} className="slit-frame rounded-lg">
      <NameHeader name={name} site={site} status={statusPill} justSaved={status === "saved"} />

      <div className="px-6 py-6 sm:px-8">
        <RecordTable
          name={name}
          rows={dnsRows}
          setRows={(next) => { setDnsRows(next); setStatus(null); setErrors([]); }}
          verdicts={verifyRows(dnsRows, site.check, { savedAt })}
          onCheck={site.run}
          checking={site.phase === "checking"}
        />
      </div>

      <div className="slit-top px-6 py-5 sm:px-8">
        <label className="block">
          <span className="text-[14px] text-(--color-ink)">URL redirect</span>
          <span className="mt-1.5 block text-xs leading-relaxed text-(--color-muted)">
            Optional. Visitors to {name}.runs-at.dev are forwarded to this address. Leave blank for none.
          </span>
          <input value={url} onChange={(e) => { setUrl(e.target.value); setStatus(null); }} placeholder="https://your-site.com" spellCheck={false} className={`mt-3 ${INPUT}`} />
        </label>
      </div>

      <details className="slit-top px-6 py-5 sm:px-8">
        <summary className="cursor-pointer text-[14px] text-(--color-ink)">
          Profile card <span className="text-xs text-(--color-muted)">{noRecords ? "· showing now" : "· shown only when the name has no records"}</span>
        </summary>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="meta normal-case">display name</span>
            <input value={displayName} onChange={(e) => { setDisplayName(e.target.value); setStatus(null); }} placeholder="GitHub profile name" className={`mt-2 ${INPUT}`} />
          </label>
          <label className="block">
            <span className="meta normal-case">bio</span>
            <textarea value={bio} onChange={(e) => { setBio(e.target.value); setStatus(null); }} placeholder="GitHub profile bio" rows={2} className={`mt-2 ${INPUT} resize-y`} />
          </label>
          {linkRows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input value={row.label} onChange={(e) => setLinkRow(i, { label: e.target.value })} placeholder="My portfolio" aria-label="Link label" className={`w-36 ${INPUT}`} />
              <input value={row.url} onChange={(e) => setLinkRow(i, { url: e.target.value })} placeholder="https://…" aria-label="Link URL" spellCheck={false} className={`min-w-0 flex-1 ${INPUT}`} />
              <button type="button" onClick={() => removeLink(i)} className="font-(family-name:--font-mono) text-xs text-(--color-muted) underline transition-colors hover:text-(--color-ink)">remove</button>
            </div>
          ))}
          {linkRows.length < MAX_LINKS && (
            <button type="button" onClick={() => { setLinkRows((rows) => [...rows, { label: "", url: "" }]); setStatus(null); }} className="slit-frame px-3 py-1.5 font-(family-name:--font-mono) text-xs text-(--color-muted) hover:text-(--color-ink)">+ add a link</button>
          )}
        </div>
      </details>

      {/* Save bar */}
      <div className="flex flex-wrap items-center gap-4 slit-top px-6 py-5 sm:px-8">
        <button type="submit" disabled={status === "saving" || !dirty} className="btn-pill">
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
        {dirty && status !== "saving" && (
          <button type="button" onClick={discard} className="btn-ghost px-4 py-2 text-xs">Discard</button>
        )}
        {!dirty && status === null && <span className="font-(family-name:--font-mono) text-xs text-(--color-muted)">no unsaved changes</span>}
        {status === "unchanged" && <span className="font-(family-name:--font-mono) text-xs text-(--color-muted)">no changes to save</span>}
        {status === "saved" && (
          <span className="font-(family-name:--font-mono) text-xs text-(--color-muted)">
            {sha ? <a className="text-(--color-ink) underline" href={commitUrl(commit)} target="_blank" rel="noopener noreferrer">commit {sha}</a> : "saved"}
          </span>
        )}
        {errors.length > 0 && <ul className="mt-2 space-y-1 font-(family-name:--font-mono) text-xs text-(--color-flag)">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      </div>

      {/* Releasing stays possible, out of the way. */}
      <details className="slit-top px-6 py-4 sm:px-8">
        <summary className="cursor-pointer font-(family-name:--font-mono) text-xs text-(--color-muted)">Remove this name</summary>
        <ReleaseZone name={name} />
      </details>
    </form>
  );
}

// ── Name header ──────────────────────────────────────────────
// Everything an owner arrives wanting: which name this is, what it is doing
// right now, and the three actions that answer "is it working?" -- visiting
// it, checking again, and the full readout at /debug/<name>.
function NameHeader({ name, site, status, justSaved }) {
  const checking = site.phase === 'checking';
  return (
    <div className="slit-bottom px-6 py-5 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[23px] leading-[1.07] font-normal tracking-[-0.004em] text-(--color-ink)">{name}.runs-at.dev</h2>
          <p className="mt-1 font-(family-name:--font-mono) text-xs text-(--color-muted)">domains/{name}.json</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`https://${name}.runs-at.dev`} target="_blank" rel="noopener noreferrer" className="btn-ghost px-4 py-2 text-xs">Visit</a>
          <button type="button" onClick={site.run} disabled={checking} className="btn-ghost px-4 py-2 text-xs">
            {checking ? 'Checking…' : 'Check now'}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full ${status.tone === 'live' ? 'pulse-dot' : ''}`}
          style={{
            background:
              status.tone === 'live' ? 'var(--pulse)'
              : status.tone === 'waiting' ? 'var(--warn)'
              : status.tone === 'down' ? 'var(--flag)'
              : 'var(--muted)',
          }}
        />
        <span className={`text-[14px] ${status.tone === 'down' ? 'text-(--color-flag)' : 'text-(--color-ink)'}`}>{status.label}</span>
      </div>
      {status.detail && <p className="mt-1.5 max-w-[600px] text-xs leading-relaxed text-(--color-muted)">{status.detail}</p>}
      {justSaved && (
        <p className="mt-2 max-w-[600px] text-xs leading-relaxed text-(--color-muted)">
          Saved. DNS usually publishes within a minute or two; this rechecks on its own.
        </p>
      )}
      {site.note && <p className="mt-2 text-xs text-(--color-muted)">{site.note}</p>}
      <p className="mt-3 flex flex-wrap items-center gap-3 font-(family-name:--font-mono) text-xs text-(--color-muted)">
        {site.checkedAt && !checking && <span>{'// last checked '}{new Date(site.checkedAt).toLocaleTimeString()}</span>}
        <a href={`/debug/${name}`} className="underline transition-colors hover:text-(--color-ink)">Detailed check</a>
      </p>
    </div>
  );
}

// ── Feature card ─────────────────────────────────────────────
// One of the four things a name can do. Only the one in use carries a
// verdict; the other three have nothing to be live or broken about.
function ReleaseZone({ name }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [result, setResult] = useState(null);

  const release = async () => {
    if (confirmText.trim().toLowerCase() !== name) return;
    setReleasing(true);
    setResult(null);
    try {
      const res = await fetch('/api/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, confirm: confirmText.trim().toLowerCase() }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setResult({ ok: true, text: body.message });
        // Back to the domain list after a short delay so the user sees the
        // confirmation; with nothing left it offers to claim one.
        setTimeout(() => { window.location.href = '/manage'; }, 2000);
      } else {
        setResult({ ok: false, text: body.detail ?? body.error ?? 'release failed' });
      }
    } catch {
      setResult({ ok: false, text: 'network error' });
    }
    setReleasing(false);
  };

  return (
    <div className="slit-top px-6 py-5 sm:px-8">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-(family-name:--font-mono) text-xs text-(--color-flag) underline hover:opacity-80"
        >
          release this name
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-[14px] text-(--color-flag)">Release {name}.runs-at.dev?</p>
          <p className="max-w-[600px] text-xs leading-relaxed text-(--color-muted)">
            This permanently deletes your claim. The name becomes available for anyone
            to claim immediately. DNS records and your profile card are removed.
            This cannot be undone.
          </p>
          {/* Stacked on mobile: the confirm input is flex-1 in the same row as
              two buttons, which squeezed it to a few characters on a phone --
              exactly the field someone has to type a name into exactly. Inline
              again from sm up, where there is room for all three. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`type "${name}" to confirm`}
              aria-label="Type the name to confirm release"
              spellCheck={false}
              autoCapitalize="off"
              className={`${INPUT} slit-input-flag sm:w-auto sm:flex-1`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={release}
                disabled={releasing || confirmText.trim().toLowerCase() !== name}
                className="slit-frame slit-frame-flag px-4 py-2 font-(family-name:--font-mono) text-xs text-(--color-flag) disabled:opacity-40"
              >
                {releasing ? 'Releasing…' : 'Release permanently'}
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setConfirmText(''); setResult(null); }}
                className="btn-ghost px-4 py-2 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
          {result && (
            <p className={`font-(family-name:--font-mono) text-xs ${result.ok ? 'text-(--color-pulse)' : 'text-(--color-flag)'}`}>
              {result.ok ? '✓ ' : '✗ '}{result.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Subdomain records ────────────────────────────────────────
const TYPE_HELP = {
  A: 'Point your name at a server, using an IPv4 address like 203.0.113.10.',
  AAAA: 'The same as A, but for an IPv6 address like 2606:4700:3037::6815:7eb.',
  CNAME: 'Point your name at another address, like you.github.io. Must be the only record on its name.',
  TXT: 'Plain text, usually a code a service gives you to prove the name is yours.',
  MX: 'Where email for this name is delivered. Lower priority numbers are tried first.',
};

const VERDICT_COLOR = {
  published: 'var(--pulse)',
  publishing: 'var(--warn)',
  missing: 'var(--warn)',
  different: 'var(--flag)',
  unknown: 'var(--muted)',
};

function blankRow() {
  return { id: `new-${Math.random().toString(36).slice(2, 8)}`, label: '', type: 'A', value: '', priority: 10 };
}

function hostOf(label, name) {
  return label ? `${label}.${name}.runs-at.dev` : `${name}.runs-at.dev`;
}

function RecordTable({ name, rows, setRows, verdicts, onCheck, checking }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const verdictFor = (id) => verdicts.find((v) => v.id === id);

  function startAdd() { setError(null); setDraft(blankRow()); }
  function startEdit(row) { setError(null); setDraft({ ...row }); }

  function commitDraft() {
    const others = rows.filter((r) => r.id !== draft.id);
    const problem = validateRow(draft, others);
    if (problem) { setError(problem); return; }
    const cleaned = draft.type === 'MX' ? draft : { ...draft, priority: undefined };
    setRows(rows.some((r) => r.id === draft.id)
      ? rows.map((r) => (r.id === draft.id ? cleaned : r))
      : [...rows, cleaned]);
    setDraft(null);
    setError(null);
  }

  function remove(row) {
    setRows(rows.filter((r) => r.id !== row.id));
    setConfirming(null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[14px] text-(--color-ink)">DNS records</p>
          <p className="mt-1.5 max-w-[560px] text-xs leading-relaxed text-(--color-muted)">
            Everything published for {name}.runs-at.dev. Changes go live within a minute or two of saving.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onCheck} disabled={checking} className="btn-ghost px-4 py-2 text-xs">
            {checking ? 'Checking…' : 'Check DNS'}
          </button>
          <button type="button" onClick={startAdd} className="btn-ghost px-4 py-2 text-xs">+ Add record</button>
        </div>
      </div>

      {rows.length === 0 && !draft && (
        <p className="mt-5 text-xs leading-relaxed text-(--color-muted)">
          No records yet. Add one to point this name at a server, a service, or your email provider.
        </p>
      )}

      {/* Desktop: a table. Phones get the same rows as cards below. */}
      {rows.length > 0 && (
        <div className="mt-5 hidden sm:block">
          <table className="w-full text-left">
            <thead>
              <tr className="meta">
                <th className="py-2 pr-3 font-normal">Type</th>
                <th className="py-2 pr-3 font-normal">Name</th>
                <th className="py-2 pr-3 font-normal">Value</th>
                <th className="py-2 pr-3 font-normal">TTL</th>
                <th className="py-2 pr-3 font-normal">Pri</th>
                <th className="py-2 font-normal" />
              </tr>
            </thead>
            <tbody className="font-(family-name:--font-mono) text-xs">
              {rows.map((row) => {
                const verdict = verdictFor(row.id);
                return (
                  <tr key={row.id} className="slit-top align-top">
                    <td className="py-3 pr-3 text-(--color-ink)">{row.type}</td>
                    <td className="py-3 pr-3 break-all text-(--color-muted)">{hostOf(row.label, name)}</td>
                    <td className="py-3 pr-3 break-all text-(--color-ink)">
                      {row.value}
                      {verdict && (
                        <span className="mt-1 flex items-center gap-1.5 text-(--color-muted)">
                          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: VERDICT_COLOR[verdict.state] }} />
                          {verdict.text}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-(--color-muted)">5 min</td>
                    <td className="py-3 pr-3 text-(--color-muted)">{row.type === 'MX' ? row.priority : '—'}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => startEdit(row)} className="underline text-(--color-muted) hover:text-(--color-ink)">Edit</button>
                      <button type="button" onClick={() => setConfirming(row)} className="ml-3 underline text-(--color-flag) hover:opacity-80">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Phones: one card per record, nothing to scroll sideways. */}
      <div className="mt-5 space-y-3 sm:hidden">
        {rows.map((row) => {
          const verdict = verdictFor(row.id);
          return (
            <div key={row.id} className="slit-frame rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-(family-name:--font-mono) text-xs text-(--color-ink)">{row.type}</span>
                {verdict && (
                  <span className="flex items-center gap-1.5 font-(family-name:--font-mono) text-xs text-(--color-muted)">
                    <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: VERDICT_COLOR[verdict.state] }} />
                    {verdict.text}
                  </span>
                )}
              </div>
              <p className="mt-2 font-(family-name:--font-mono) text-xs break-all text-(--color-muted)">{hostOf(row.label, name)}</p>
              <p className="mt-1 font-(family-name:--font-mono) text-xs break-all text-(--color-ink)">
                {row.value}{row.type === 'MX' ? ` · priority ${row.priority}` : ''}
              </p>
              <p className="mt-1 font-(family-name:--font-mono) text-xs text-(--color-muted)">TTL 5 min</p>
              <div className="mt-3 flex items-center gap-3 font-(family-name:--font-mono) text-xs">
                <button type="button" onClick={() => startEdit(row)} className="underline text-(--color-muted)">Edit</button>
                <button type="button" onClick={() => setConfirming(row)} className="underline text-(--color-flag)">Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      {confirming && (
        <div className="slit-frame slit-frame-flag mt-4 rounded-lg p-4">
          <p className="text-[14px] text-(--color-flag)">Delete this {confirming.type} record?</p>
          <p className="mt-2 max-w-[560px] text-xs leading-relaxed text-(--color-muted)">
            {hostOf(confirming.label, name)} → {confirming.value}
            {'. '}{deleteConsequence(confirming, name)}
            {' '}It is removed when you save.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => remove(confirming)} className="slit-frame slit-frame-flag px-4 py-2 font-(family-name:--font-mono) text-xs text-(--color-flag)">Delete record</button>
            <button type="button" onClick={() => setConfirming(null)} className="btn-ghost px-4 py-2 text-xs">Keep it</button>
          </div>
        </div>
      )}

      {draft && (
        <div className="slit-frame mt-4 rounded-lg p-4">
          <p className="text-[14px] text-(--color-ink)">{rows.some((r) => r.id === draft.id) ? 'Edit record' : 'Add record'}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="meta normal-case">type</span>
              <select
                value={draft.type}
                onChange={(e) => { setDraft({ ...draft, type: e.target.value }); setError(null); }}
                aria-label="Record type"
                className={`mt-2 ${INPUT}`}
              >
                {ROW_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="meta normal-case">name</span>
              <input
                value={draft.label}
                onChange={(e) => { setDraft({ ...draft, label: e.target.value }); setError(null); }}
                placeholder={`blank for ${name}.runs-at.dev`}
                aria-label="Record name"
                spellCheck={false}
                autoCapitalize="off"
                className={`mt-2 ${INPUT}`}
              />
              <span className="mt-1.5 block font-(family-name:--font-mono) text-xs break-all text-(--color-muted)">
                {hostOf(draft.label.trim().toLowerCase(), name)}
              </span>
            </label>
          </div>

          <p className="mt-3 max-w-[560px] text-xs leading-relaxed text-(--color-muted)">{TYPE_HELP[draft.type]}</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px]">
            <label className="block">
              <span className="meta normal-case">{draft.type === 'MX' ? 'mail server' : 'value'}</span>
              <input
                value={draft.value}
                onChange={(e) => { setDraft({ ...draft, value: e.target.value }); setError(null); }}
                placeholder={draft.type === 'A' ? '203.0.113.10' : draft.type === 'AAAA' ? '2606:4700:3037::6815:7eb' : draft.type === 'CNAME' ? 'you.github.io' : draft.type === 'MX' ? 'mx.example.com' : 'v=spf1 -all'}
                aria-label="Record value"
                spellCheck={false}
                autoCapitalize="off"
                className={`mt-2 ${INPUT}`}
              />
            </label>
            {draft.type === 'MX' && (
              <label className="block">
                <span className="meta normal-case">priority</span>
                <input
                  value={draft.priority ?? ''}
                  onChange={(e) => { setDraft({ ...draft, priority: e.target.value === '' ? '' : Number(e.target.value) }); setError(null); }}
                  inputMode="numeric"
                  aria-label="Priority"
                  className={`mt-2 ${INPUT}`}
                />
              </label>
            )}
          </div>

          <p className="mt-3 font-(family-name:--font-mono) text-xs text-(--color-muted)">
            {'// TTL is 5 minutes on every record, set automatically'}
          </p>

          {error && <p className="mt-3 text-xs text-(--color-flag)">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={commitDraft} className="btn-ghost px-4 py-2 text-xs">Done</button>
            <button type="button" onClick={() => { setDraft(null); setError(null); }} className="btn-ghost px-4 py-2 text-xs">Cancel</button>
          </div>
        </div>
      )}

      {(rows.some((r) => r.type === 'MX') || rows.some((r) => r.type === 'TXT')) && (
        <p className="mt-4 max-w-[560px] text-xs leading-relaxed text-(--color-muted)">
          Mail and text records let other services treat this name as yours. Only add values a
          provider gave you.
        </p>
      )}

      <p className="mt-4 max-w-[560px] text-xs leading-relaxed text-(--color-muted)">
        Records are saved with the button below, then published to DNS. A record can take a
        minute or two to appear.
      </p>
    </div>
  );
}
