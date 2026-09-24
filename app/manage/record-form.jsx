'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { commitUrl, shortSha } from '../../lib/repo.js';
import {
  modeOf, mxToLines, buildRecords,
  SUBDOMAIN_TYPES, buildSubdomains, subdomainsToRows,
  buildProfile, profileToRows,
  recordsToRows, rowsToRecords, validateRow, ROW_TYPES,
} from '../../lib/record-fields.js';
import { siteStatus, friendlyError, featureCards, verifyRows, deleteConsequence, CHECK_SCHEDULE_MS } from '../../lib/manage-status.js';

const MAX_SUBDOMAINS = 10;
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

const PROVIDERS = [
  { id: 'card', label: 'Profile card', hint: 'Show a card built from your GitHub profile. Nothing to set up.', icon: 'M3 10h18M7 15h.01M11 15h.01M15 15h.01M7 19h10a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v7a4 4 0 0 0 4 4Z' },
  { id: 'cname', label: 'Point to my hosting', hint: 'Send visitors to a site you host somewhere else, like GitHub Pages.', icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
  { id: 'url', label: 'Redirect visitors', hint: 'Forward anyone who opens your name to another web address.', icon: 'M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' },
  { id: 'advanced', label: 'DNS records', hint: 'Add A, AAAA, CNAME, TXT and MX records yourself.', icon: 'M4 6h16M4 12h16M4 18h16' },
];

// Provider presets for CNAME mode. Each one knows the target shape the
// provider actually needs and the steps that provider requires beyond DNS —
// which is exactly where the health check's stuck names come from: pointing
// at a deployment URL instead of a custom-domain target, or attaching the
// domain on the provider's side never happening at all. The preset fills the
// half DNS can do and walks the user through the half it can't.
const PRESETS = [
  {
    id: 'github-pages',
    label: 'GitHub Pages',
    placeholder: 'yourusername.github.io',
    prefillFor: (login) => (login ? `${String(login).toLowerCase()}.github.io` : ''),
    guide: null,
    steps: (name, login) => [
      `Target ${login ? `${String(login).toLowerCase()}.github.io` : 'yourusername.github.io'} (or <project>.github.io if the site lives in a project repo)`,
      `In that repo: Settings → Pages → Custom domain, enter ${name}.runs-at.dev, save`,
      "Save here. The zone publishes within a minute, HTTPS follows on GitHub's side",
    ],
  },
  {
    id: 'netlify',
    label: 'Netlify',
    placeholder: 'your-site.netlify.app',
    prefillFor: null,
    guide: null,
    steps: (name) => [
      "Target your site's netlify.app address (Domain settings shows it)",
      `In Netlify: Domain settings → Add a domain → ${name}.runs-at.dev`,
      'Save here, then let Netlify provision the certificate',
    ],
  },
  {
    id: 'cloudflare-pages',
    label: 'Cloudflare Pages',
    placeholder: 'your-project.pages.dev',
    prefillFor: null,
    guide: null,
    steps: (name) => [
      "Target your project's pages.dev address",
      `In Cloudflare: your Pages project → Custom domains → Set up a custom domain → ${name}.runs-at.dev`,
      'Save here. Cloudflare issues the certificate once the CNAME is live',
    ],
  },
  {
    id: 'vercel',
    label: 'Vercel',
    placeholder: 'cname.vercel-dns.com',
    prefillFor: () => 'cname.vercel-dns.com',
    guide: '/docs/guides/vercel',
    steps: (name) => [
      `In your Vercel project: Settings → Domains → Add, enter ${name}.runs-at.dev`,
      'It will show a verification TXT starting with vc-domain-verify= — copy the whole value',
      'Add it below as a subdomain record: label _vercel, type TXT',
      'Save here. Vercel needs one re-check after the TXT is live, so give it a minute',
    ],
  },
  {
    id: 'render',
    label: 'Render',
    placeholder: 'your-service.onrender.com',
    prefillFor: null,
    guide: null,
    steps: (name) => [
      "Target your service's onrender.com address",
      `In Render: your service → Settings → Custom Domains → Add ${name}.runs-at.dev`,
      'Save here; Render validates the CNAME and issues the certificate',
    ],
  },
];

export default function RecordForm({ name, record }) {
  const [mode, setMode] = useState(() => modeOf(record.records));
  const [cname, setCname] = useState(record.records?.CNAME ?? '');
  // Highlight the preset the loaded CNAME already matches (a Vercel user
  // returning to their record sees the Vercel steps, not bare fields). Only
  // derivable values match; anything hand-typed leaves no chip active.
  const [selectedPreset, setSelectedPreset] = useState(() => {
    const initial = record.records?.CNAME ?? '';
    if (!initial) return null;
    const ownerLogin = record.owner?.github;
    return PRESETS.find((p) => p.prefillFor?.(ownerLogin) === initial)?.id ?? null;
  });
  const [url, setUrl] = useState(record.records?.URL ?? '');
  const [a, setA] = useState((record.records?.A ?? []).join('\n'));
  const [txt, setTxt] = useState((record.records?.TXT ?? []).join('\n'));
  const [mx, setMx] = useState(mxToLines(record.records?.MX));
  const [status, setStatus] = useState(null);
  const [errors, setErrors] = useState([]);
  const [commit, setCommit] = useState(null);
  const [subRows, setSubRows] = useState(() => subdomainsToRows(record.subdomains));
  const [displayName, setDisplayName] = useState(record.profile?.name ?? '');
  const [bio, setBio] = useState(record.profile?.bio ?? '');
  const [linkRows, setLinkRows] = useState(() => profileToRows(record.profile));
  const site = useSiteCheck(name);
  // Which option's editor is open. Null on arrival: the page opens on a
  // status summary, not on a wall of inputs.
  const [editing, setEditing] = useState(null);
  // The moment of the last successful save. Inside the publishing window a
  // name still answering with the card is mid-publish, not broken.
  const [savedAt, setSavedAt] = useState(null);
  // One row per published record, the shape a DNS console shows. Seeded from
  // the committed record and folded back by rowsToRecords on save.
  const [dnsRows, setDnsRows] = useState(() => recordsToRows(record));

  // What the record held when the page loaded, not what the form currently
  // builds: the point is to warn that saving in a mode that drops records the
  // file already has — card wipes everything, redirect drops a CNAME, cname
  // drops A/TXT/MX — before the user hits Save.
  const existingTypes = Object.keys(record.records ?? {});
  const MODE_LABEL = { card: 'Profile card', cname: 'Point to my hosting', url: 'Redirect visitors', advanced: 'DNS records' };
  // buildRecords(mode) returns exactly the types that mode can express, so
  // any record type the file holds that the mode cannot keep is one that
  // save would remove.
  const kept = new Set(Object.keys(
    mode === 'advanced'
      ? rowsToRecords(dnsRows, { keep: record.records ?? {} }).records
      : buildRecords(mode, { cname, url, a, txt, mx }),
  ));
  const dropped = existingTypes.filter((t) => !kept.has(t));
  const willDropRecords = dropped.length > 0;

  function selectProvider(id) {
    setMode(id);
    setStatus(null);
    setErrors([]);
  }

  // Picking a preset swaps the placeholder and, when the preset can derive a
  // target (GitHub Pages from the owner's login, Vercel's generic), prefills
  // the field — but never over something the user typed themselves: only an
  // empty field or another preset's own prefill is replaced.
  function selectPreset(preset) {
    const deselecting = selectedPreset === preset.id;
    setSelectedPreset(deselecting ? null : preset.id);
    setStatus(null);
    if (deselecting) return;
    const prefill = preset.prefillFor?.(record.owner?.github);
    if (!prefill) return;
    const presetValues = PRESETS.map((p) => p.prefillFor?.(record.owner?.github)).filter(Boolean);
    if (!cname.trim() || presetValues.includes(cname.trim())) setCname(prefill);
  }

  function setRow(i, patch) {
    setSubRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setStatus(null);
    setErrors([]);
  }
  function addRow() { setSubRows((rows) => [...rows, { label: '', type: 'TXT', value: '' }]); setStatus(null); }
  function removeRow(i) { setSubRows((rows) => rows.filter((_, j) => j !== i)); setStatus(null); }
  function setLinkRow(i, patch) { setLinkRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r))); setStatus(null); }
  function removeLink(i) { setLinkRows((rows) => rows.filter((_, j) => j !== i)); setStatus(null); }

  async function save(event) {
    event.preventDefault();
    setStatus('saving');
    setErrors([]);
    const res = await fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        ...(mode === 'advanced'
          ? rowsToRecords(dnsRows, { keep: record.records ?? {} })
          : { records: buildRecords(mode, { cname, url, a, txt, mx }), subdomains: buildSubdomains(subRows) }),
        profile: buildProfile({ name: displayName, bio, linkRows }) ?? null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setCommit(body.commit ?? null);
      setStatus(body.unchanged ? 'unchanged' : 'saved');
      // Only a real change needs watching: an unchanged save publishes
      // nothing, so re-checking would spend the rate limit for no reason.
      if (!body.unchanged) { setSavedAt(Date.now()); site.recheckAfterSave(); }
      return;
    }
    setErrors(friendlyError(res.status, body));
    setStatus('error');
  }

  const sha = shortSha(commit);
  // The same reading everywhere on the page, refreshed by every check rather
  // than frozen at page load. The saved mode, not the unsaved form, decides
  // whether a profile-card answer is the point or the problem.
  const statusPill = site.phase === 'checking' && !site.check
    ? { label: 'Checking…', tone: 'checking' }
    : siteStatus(site.check, modeOf(record.records), record.records);

  const savedMode = modeOf(record.records);
  const cards = featureCards({
    savedMode,
    records: record.records ?? {},
    check: site.check,
    savedAt,
  });

  // The payload the form would send, against the record as committed: what
  // "unsaved changes" means, without a dirty flag on every input.
  const pending = JSON.stringify({
    ...(mode === 'advanced'
      ? rowsToRecords(dnsRows, { keep: record.records ?? {} })
      : { records: buildRecords(mode, { cname, url, a, txt, mx }), subdomains: buildSubdomains(subRows) }),
    profile: buildProfile({ name: displayName, bio, linkRows }) ?? null,
  });
  const committed = JSON.stringify({
    records: record.records ?? {},
    subdomains: record.subdomains ?? {},
    profile: record.profile ?? null,
  });
  const dirty = pending !== committed;

  function openEditor(id) {
    if (dirty && editing && id !== editing) {
      const leave = window.confirm('You have unsaved changes. Discard them and switch?');
      if (!leave) return;
    }
    setEditing(id);
    selectProvider(id);
  }

  // Cancel returns the form to the committed record, so closing an editor
  // never leaves values on screen that the registry does not hold.
  function closeEditor() {
    setEditing(null);
    setStatus(null);
    setErrors([]);
    setMode(savedMode);
    setCname(record.records?.CNAME ?? '');
    setUrl(record.records?.URL ?? '');
    setA((record.records?.A ?? []).join('\n'));
    setTxt((record.records?.TXT ?? []).join('\n'));
    setMx(mxToLines(record.records?.MX));
    setSubRows(subdomainsToRows(record.subdomains));
    setDnsRows(recordsToRows(record));
  }

  return (
    <form onSubmit={save} className="slit-frame rounded-lg">
      <NameHeader name={name} site={site} status={statusPill} justSaved={status === 'saved'} />

      <div className="px-6 py-6 sm:px-8">
        <p className="text-[14px] text-(--color-ink)">What this name does</p>
        <p className="mt-1.5 text-xs leading-relaxed text-(--color-muted)">
          One of these at a time. Picking another replaces what this name does now.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <FeatureCard key={card.id} card={card} open={editing === card.id} onSelect={() => openEditor(card.id)} />
          ))}
        </div>
      </div>

      {editing && (
        <div className="slit-top">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 sm:px-8">
            <p className="text-[14px] text-(--color-ink)">
              Editing: {cards.find((c) => c.id === editing)?.title}
            </p>
            <button type="button" onClick={closeEditor} className="btn-ghost px-4 py-2 text-xs">Cancel</button>
          </div>
      {mode === 'card' && (
        <div className="slit-top px-6 py-5 sm:px-8">
          <p className="text-[14px] text-(--color-ink)">Profile card</p>
          <p className="mt-1.5 text-xs leading-relaxed text-(--color-muted)">
            Your name serves a card built from your GitHub profile. No DNS records are published.
          </p>
        </div>
      )}

      {/* Warn when a save in this mode would remove records the file
          currently holds. The WYSIWYG model makes switching mode drop
          anything the new mode can't express; the banner makes that
          visible rather than silent, for every destructive transition
          (card, redirect, and cname each drop whatever the record had). */}
      {willDropRecords && (
        <div className="slit-top px-6 py-3 sm:px-8">
          <p className="slit-bar-l rounded-r-lg bg-(--color-card) px-3 py-2.5 pl-5 font-(family-name:--font-mono) text-xs leading-relaxed text-(--color-flag)">
            Saving in {MODE_LABEL[mode]} mode removes the {dropped.join(', ')} record(s)
            on this name. To edit your card or redirect without changing where the name points,
            edit the profile section below or keep your current mode.
          </p>
        </div>
      )}

      {/* Custom Domain mode */}
      {mode === 'cname' && (
        <>
          <div className="slit-top px-6 py-5 sm:px-8">
            <span className="text-[14px] text-(--color-ink)">CNAME target</span>

            {/* Provider presets: fill the target shape and walk the steps
                that provider needs beyond DNS. Optional — a plain hostname
                typed below works exactly as before. */}
            <div className="mt-3 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPreset(p)}
                  aria-pressed={selectedPreset === p.id}
                  className={`border px-3 py-1.5 font-(family-name:--font-mono) text-xs transition-colors ${
                    selectedPreset === p.id
                      ? 'border-(--color-signal) bg-(--color-signal)/10 text-(--color-signal)'
                      : 'border-(--color-rule) text-(--color-muted) hover:border-(--color-muted) hover:text-(--color-ink)'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <label className="block">
              <input
                value={cname}
                onChange={(e) => { setCname(e.target.value); setStatus(null); }}
                placeholder={PRESETS.find((p) => p.id === selectedPreset)?.placeholder ?? 'your-provider.example.com'}
                aria-label="CNAME target"
                spellCheck={false}
                autoCapitalize="off"
                className={`mt-3 ${INPUT}`}
              />
            </label>
            <p className="mt-2 text-xs text-(--color-muted)">Copy the exact value from your provider.</p>

            {(() => {
              const preset = PRESETS.find((p) => p.id === selectedPreset);
              if (!preset) return null;
              return (
                <div className="mt-4 border border-(--color-rule) bg-(--color-card) px-4 py-3">
                  <p className="font-(family-name:--font-mono) text-xs text-(--color-muted)">{'// '}{preset.label} setup</p>
                  <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-(--color-ink)">
                    {preset.steps(name, record.owner?.github).map((step, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="font-(family-name:--font-mono) text-(--color-muted)">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  {preset.guide && (
                    <a href={preset.guide} className="mt-3 inline-block font-(family-name:--font-mono) text-xs text-(--color-signal) underline">
                      full guide →
                    </a>
                  )}
                </div>
              );
            })()}
          </div>
          <SubdomainRecords name={name} subRows={subRows} setRow={setRow} addRow={addRow} removeRow={removeRow} />
        </>
      )}

      {/* Redirect mode */}
      {mode === 'url' && (
        <div className="slit-top px-6 py-5 sm:px-8">
          <label className="block">
            <span className="text-[14px] text-(--color-ink)">Redirect URL</span>
            <input value={url} onChange={(e) => { setUrl(e.target.value); setStatus(null); }} placeholder="https://your-site.com" spellCheck={false} className={`mt-2 ${INPUT}`} />
          </label>
        </div>
      )}

      {/* Advanced DNS mode */}
      {mode === 'advanced' && (
        <div className="slit-top px-6 py-5 sm:px-8">
          <RecordTable
            name={name}
            rows={dnsRows}
            setRows={(next) => { setDnsRows(next); setStatus(null); setErrors([]); }}
            verdicts={verifyRows(dnsRows, site.check, { savedAt })}
            onCheck={site.run}
            checking={site.phase === 'checking'}
          />
        </div>
      )}
        </div>
      )}

      {/* Profile card fields. Always available, whatever the records mode:
          `profile` is its own key on the record and is served by the card, so
          editing a bio must never require touching where the name points. */}
      <div className="slit-top px-6 py-5 sm:px-8">
        <p className="text-[14px] text-(--color-ink)">Profile card details</p>
        <p className="mt-1.5 text-xs leading-relaxed text-(--color-muted)">
          {mode === 'card'
            ? 'Override any field below. Blank falls back to your GitHub profile.'
            : 'Saved with your name and shown if you ever switch to the profile card. Editing these does not change your DNS.'}
        </p>
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
            <button type="button" onClick={() => { setLinkRows((rows) => [...rows, { label: '', url: '' }]); setStatus(null); }} className="press slit-frame rounded-[4px] px-3 py-1.5 font-(family-name:--font-mono) text-xs text-(--color-muted) hover:text-(--color-ink)">+ add a link</button>
          )}
        </div>
      </div>


      {/* Save */}
      <div className="flex flex-wrap items-center gap-4 slit-top px-6 py-5 sm:px-8">
        <button type="submit" disabled={status === 'saving'} className="btn-pill">
          {status === 'saving' ? 'Saving…' : 'Save changes'}
        </button>
        {status === 'unchanged' && <span className="font-(family-name:--font-mono) text-xs text-(--color-muted)">no changes to save</span>}
        {status === 'saved' && (
          <span className="font-(family-name:--font-mono) text-xs text-(--color-muted)">
            {sha ? <a className="text-(--color-ink) underline" href={commitUrl(commit)} target="_blank" rel="noopener noreferrer">commit {sha}</a> : 'saved'}
          </span>
        )}
        {errors.length > 0 && <ul className="mt-2 space-y-1 font-(family-name:--font-mono) text-xs text-(--color-flag)">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      </div>


      {/* Danger zone: release the name back to the pool */}
      <SwapZone name={name} />
      <ReleaseZone name={name} />
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
          <h2 className="font-(family-name:--font-mono) text-[23px] leading-[1.07] font-normal text-(--color-ink)">{name}.runs-at.dev</h2>
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
              : status.tone === 'waiting' ? 'var(--blue)'
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
function FeatureCard({ card, open, onSelect }) {
  const { status } = card;
  const dot =
    status.tone === 'live' ? 'var(--pulse)'
    : status.tone === 'waiting' ? 'var(--blue)'
    : status.tone === 'attention' ? 'var(--flag)'
    : 'var(--iron)';
  return (
    <div className={`slit-frame rounded-lg p-4 ${open ? 'slit-frame-bright' : ''}`}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
        <p className="text-[14px] text-(--color-ink)">{card.title}</p>
      </div>
      <p className={`mt-2 text-xs ${status.tone === 'attention' ? 'text-(--color-flag)' : 'text-(--color-muted)'}`}>
        {status.label}{card.summary ? ` · ${card.summary}` : ''}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-(--color-muted)">{status.detail ?? card.description}</p>
      <button type="button" onClick={onSelect} className="btn-ghost mt-3 px-3 py-1.5 text-xs">
        {open ? 'Editing…' : card.action}
      </button>
    </div>
  );
}

// ── Swap zone (trade this name for a different one) ─────────
function SwapZone({ name }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [swapping, setSwapping] = useState(false);
  const [result, setResult] = useState(null);

  const validateNewName = (v) => {
    const trimmed = v.trim().toLowerCase();
    return /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(trimmed) && trimmed.length >= 2 && trimmed !== name;
  };

  const canSwap = validateNewName(newName) && confirmText.trim().toLowerCase() === newName.trim().toLowerCase();

  const swap = async () => {
    if (!canSwap) return;
    setSwapping(true);
    setResult(null);
    try {
      const res = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: name,
          to: newName.trim().toLowerCase(),
          confirm: confirmText.trim().toLowerCase(),
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.ok && body.ok) {
        setResult({ ok: true, text: body.message });
        setTimeout(() => { window.location.href = '/manage'; }, 2000);
      } else {
        setResult({ ok: false, text: body.detail ?? body.error ?? 'swap failed' });
      }
    } catch {
      setResult({ ok: false, text: 'network error' });
    }
    setSwapping(false);
  };

  const nameAvailable = validateNewName(newName);

  return (
    <div className="slit-top px-6 py-5 sm:px-8">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-(family-name:--font-mono) text-xs text-(--color-muted) underline transition-colors hover:text-(--color-ink)"
        >
          swap this name for a different one
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-[14px] text-(--color-ink)">Swap {name}.runs-at.dev</p>
          <p className="max-w-[600px] text-xs leading-relaxed text-(--color-muted)">
            Trade this name for a new one. All your settings (CNAME, profile, subdomains)
            carry over. The old name is released immediately and becomes available to anyone.
          </p>

          <div className="space-y-2">
            <input
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setResult(null); }}
              placeholder="new-name"
              aria-label="New name to swap to"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className={`${INPUT} ${nameAvailable || !newName ? '' : 'slit-input-flag'}`}
            />
            {newName && !nameAvailable && (
              <p className="text-xs text-(--color-flag)">
                {newName.trim().toLowerCase() === name ? "that's your current name" : 'invalid name (2-32 chars, a-z 0-9 hyphens)'}
              </p>
            )}
            {nameAvailable && (
              <p className="font-(family-name:--font-mono) text-xs text-(--color-muted)">
                → {newName.trim().toLowerCase()}.runs-at.dev
              </p>
            )}
          </div>

          {nameAvailable && (
            <div>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={`type "${newName.trim().toLowerCase()}" to confirm`}
                aria-label="Type the new name to confirm swap"
                spellCheck={false}
                autoCapitalize="off"
                className={INPUT}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={swap}
              disabled={swapping || !canSwap}
              className="btn-pill px-4 py-2 text-xs"
            >
              {swapping ? 'Swapping…' : `Swap to ${newName.trim().toLowerCase() || '…'}`}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setNewName(''); setConfirmText(''); setResult(null); }}
              className="btn-ghost px-4 py-2 text-xs"
            >
              Cancel
            </button>
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

// ── Release zone (give the name back to the pool) ───────────
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
        // Redirect to homepage after a short delay so the user sees the confirmation
        setTimeout(() => { window.location.href = '/'; }, 2000);
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
                className="slit-frame slit-frame-flag rounded-[4px] px-4 py-2 font-(family-name:--font-mono) text-xs text-(--color-flag) disabled:opacity-40"
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
function SubdomainRecords({ name, subRows, setRow, addRow, removeRow }) {
  return (
    <div className="slit-top px-6 py-5 sm:px-8">
      <p className="text-[14px] text-(--color-ink)">Subdomain records</p>
      <p className="mt-1.5 text-xs leading-relaxed text-(--color-muted)">
        Records a provider asks for at a different name, like <code className="font-(family-name:--font-mono)">_vercel</code> for verification.
      </p>
      {subRows.map((row, i) => (
        <div key={i} className="slit-frame mt-4 rounded-lg p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input value={row.label} onChange={(e) => setRow(i, { label: e.target.value })} placeholder="_vercel" aria-label="Subdomain label" spellCheck={false} className={`w-full sm:w-32 ${INPUT}`} />
            <span className="font-(family-name:--font-mono) text-xs break-all text-(--color-muted)">.{name}.runs-at.dev</span>
            <select value={row.type} onChange={(e) => setRow(i, { type: e.target.value })} aria-label="Record type" className={`w-auto ${INPUT}`}>
              {SUBDOMAIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="button" onClick={() => removeRow(i)} className="ml-auto font-(family-name:--font-mono) text-xs text-(--color-muted) underline transition-colors hover:text-(--color-ink)">remove</button>
          </div>
          <textarea value={row.value} onChange={(e) => setRow(i, { value: e.target.value })} rows={2} aria-label="Record value" spellCheck={false} className={`mt-2 ${INPUT} resize-y`} />
        </div>
      ))}
      {subRows.length < MAX_SUBDOMAINS && (
        <button type="button" onClick={addRow} className="press mt-4 slit-frame rounded-[4px] px-3 py-1.5 font-(family-name:--font-mono) text-xs text-(--color-muted) hover:text-(--color-ink)">+ add a subdomain record</button>
      )}
    </div>
  );
}

// ── TextArea helper ──────────────────────────────────────────
function TextArea({ label, value, onChange, placeholder, hint }) {
  return (
    <label className="block">
      <span className="meta normal-case">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} spellCheck={false} className={`mt-2 ${INPUT} resize-y`} />
      {hint && <span className="mt-1.5 block text-xs text-(--color-muted)">{hint}</span>}
    </label>
  );
}

// ── DNS record table ─────────────────────────────────────────
// What a DNS console shows: one row per published record, with the same five
// types the registry can publish. Rows live in the form until Save, which
// commits them through the one records API like every other change.
const TYPE_HELP = {
  A: 'Point your name at a server, using an IPv4 address like 203.0.113.10.',
  AAAA: 'The same as A, but for an IPv6 address like 2606:4700:3037::6815:7eb.',
  CNAME: 'Point your name at another address, like you.github.io. Must be the only record on its name.',
  TXT: 'Plain text, usually a code a service gives you to prove the name is yours.',
  MX: 'Where email for this name is delivered. Lower priority numbers are tried first.',
};

// Tokens, not hexes: the same four meanings the status badges use. Waiting
// states (publishing, missing) are informational blue rather than yellow,
// which sat too close to the amber accent to read as a status.
const VERDICT_COLOR = {
  published: 'var(--pulse)',
  publishing: 'var(--blue)',
  missing: 'var(--blue)',
  different: 'var(--flag)',
  unknown: 'var(--iron)',
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
          <table className="dns-table w-full text-left">
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
                  <tr key={row.id} className="row-in slit-top align-top">
                    <td className="py-2.5 pr-3"><span className="dns-type">{row.type}</span></td>
                    <td className="py-2.5 pr-3 break-all text-(--color-muted)">{hostOf(row.label, name)}</td>
                    <td className="py-2.5 pr-3 break-all text-(--color-ink)">
                      {row.value}
                      {verdict && (
                        <span className="mt-1 flex items-center gap-1.5 text-(--color-muted)">
                          <span aria-hidden="true" className="verdict-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: VERDICT_COLOR[verdict.state] }} />
                          {verdict.text}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-(--color-muted)">5 min</td>
                    <td className="py-2.5 pr-3 text-(--color-muted)">{row.type === 'MX' ? row.priority : '—'}</td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button type="button" onClick={() => startEdit(row)} className="underline text-(--color-muted) hover:text-(--color-ink)">Edit</button>
                      <button type="button" onClick={() => setConfirming(row)} className="ml-3 underline text-(--color-muted) transition-colors hover:text-(--color-flag)">Delete</button>
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
            <div key={row.id} className="row-in slit-frame rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-(family-name:--font-mono) text-xs text-(--color-ink)">{row.type}</span>
                {verdict && (
                  <span className="flex items-center gap-1.5 font-(family-name:--font-mono) text-xs text-(--color-muted)">
                    <span aria-hidden="true" className="verdict-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: VERDICT_COLOR[verdict.state] }} />
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
                <button type="button" onClick={() => setConfirming(row)} className="underline text-(--color-muted)">Delete</button>
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
            <button type="button" onClick={() => remove(confirming)} className="press slit-frame slit-frame-flag rounded-[4px] px-4 py-2 font-(family-name:--font-mono) text-xs text-(--color-flag)">Delete record</button>
            <button type="button" onClick={() => setConfirming(null)} className="btn-ghost px-4 py-2 text-xs">Keep it</button>
          </div>
        </div>
      )}

      {draft && (
        <div className="panel-in slit-frame mt-4 rounded-lg p-4">
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
