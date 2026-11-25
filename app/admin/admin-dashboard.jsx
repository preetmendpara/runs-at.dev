'use client';

import { useMemo, useState } from 'react';
import AdminPanel from './admin-panel.jsx';

const MONO = 'font-(family-name:--font-mono)';
const INPUT = `slit-input w-full bg-transparent px-3 py-2 ${MONO} text-sm text-(--color-ink) placeholder:text-(--color-muted)/70`;
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'names', label: 'Names' },
  { id: 'users', label: 'Users' },
  { id: 'slots', label: 'Slots' },
];
const MODE_LABEL = {
  hosted: 'Hosted', redirect: 'Redirect', card: 'Profile card', 'card+subdomains': 'Card + subdomains',
  'dns-only': 'DNS only', delegated: 'Custom NS',
};
const REPO_URL = 'https://github.com/preetmendpara/runs-at.dev';

export default function AdminDashboard({ rows, users, stats, asOf, commit }) {
  const [tab, setTab] = useState('overview');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('all');
  const [open, setOpen] = useState(null);

  const q = query.trim().toLowerCase();
  const names = useMemo(() => rows.filter((r) =>
    (mode === 'all' || r.mode === mode)
    && (!q || r.name.includes(q) || r.owner.toLowerCase().includes(q) || r.target.toLowerCase().includes(q))), [rows, q, mode]);
  const people = useMemo(() => users.filter((u) =>
    !q || u.login.toLowerCase().includes(q) || u.names.some((n) => n.includes(q))), [users, q]);

  function showOwner(login) { setQuery(login); setMode('all'); setTab('names'); }

  return (
    <div>
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b-2 border-(--line-strong) pb-3 ${MONO} text-xs text-(--color-muted)`}>
        <span>registry @ {commit ? commit.slice(0, 7) : 'deploy'} · {asOf ? asOf.slice(0, 16).replace('T', ' ') + ' UTC' : ''}</span>
        <span>{stats.claims} names · {stats.owners} users</span>
      </div>

      <nav aria-label="Admin sections" className="mt-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`border px-3 py-1.5 ${MONO} text-[12px] tracking-[0.08em] uppercase ${
              tab === t.id ? 'border-(--color-ink) bg-(--color-ink) text-(--color-paper)' : 'border-(--line-strong) text-(--color-ink) hover:bg-(--color-card)'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {(tab === 'names' || tab === 'users') && (
        <div className="mt-5 flex flex-wrap gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, owner or target" className={`min-w-0 flex-1 ${INPUT}`} aria-label="Search" />
          {tab === 'names' && (
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={`w-44 ${INPUT}`} aria-label="Filter by type">
              <option value="all">All types</option>
              {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </div>
      )}

      {tab === 'overview' && <Overview stats={stats} />}

      {tab === 'names' && (
        <div className="mt-4">
          <p className={`${MONO} text-xs text-(--color-muted)`}>{names.length} of {rows.length}</p>
          <div className="mt-2 overflow-x-auto border-2 border-(--line-strong)">
            <table className={`w-full min-w-[720px] text-left ${MONO} text-xs`}>
              <thead className="border-b-2 border-(--line-strong) bg-(--color-card) text-(--color-muted) uppercase">
                <tr>
                  <th className="px-3 py-2 font-normal">Name</th>
                  <th className="px-3 py-2 font-normal">Owner</th>
                  <th className="px-3 py-2 font-normal">Type</th>
                  <th className="px-3 py-2 font-normal">Points to</th>
                  <th className="px-3 py-2 font-normal">Claimed</th>
                </tr>
              </thead>
              <tbody>
                {names.map((r) => (
                  <NameRow key={r.name} row={r} open={open === r.name} onToggle={() => setOpen(open === r.name ? null : r.name)} onOwner={showOwner} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="mt-4">
          <p className={`${MONO} text-xs text-(--color-muted)`}>{people.length} of {users.length}</p>
          <div className="mt-2 overflow-x-auto border-2 border-(--line-strong)">
            <table className={`w-full min-w-[640px] text-left ${MONO} text-xs`}>
              <thead className="border-b-2 border-(--line-strong) bg-(--color-card) text-(--color-muted) uppercase">
                <tr>
                  <th className="px-3 py-2 font-normal">GitHub</th>
                  <th className="px-3 py-2 font-normal">Names</th>
                  <th className="px-3 py-2 font-normal">Country</th>
                  <th className="px-3 py-2 font-normal">Last claim</th>
                </tr>
              </thead>
              <tbody>
                {people.map((u) => (
                  <tr key={u.login} className="border-b border-(--line) align-top last:border-b-0">
                    <td className="px-3 py-2.5">
                      <a className="text-(--color-ink) underline" href={`https://github.com/${u.login}`} target="_blank" rel="noopener noreferrer">@{u.login}</a>
                    </td>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => showOwner(u.login)} className="text-left text-(--color-ink) underline">
                        {u.count} · {u.names.join(', ')}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-(--color-muted)">{u.country || '—'}</td>
                    <td className="px-3 py-2.5 text-(--color-muted)">{u.latest ? u.latest.slice(0, 10) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'slots' && (
        <div className="mt-6 border-2 border-(--line-strong) bg-(--color-card) p-5 sm:p-8">
          <AdminPanel />
        </div>
      )}
    </div>
  );
}

function Overview({ stats }) {
  const tiles = [
    ['Names', stats.claims], ['Users', stats.owners], ['Users with 2+ names', stats.multiNameOwners],
    ['Last 24 h', stats.last24h], ['Last 7 days', stats.last7d], ['Last 30 days', stats.last30d],
  ];
  return (
    <div className="mt-6 space-y-8">
      <dl className="grid grid-cols-2 border-2 border-(--line-strong) sm:grid-cols-3">
        {tiles.map(([k, v]) => (
          <div key={k} className="border-b border-r border-(--line) px-4 py-4">
            <dt className={`${MONO} text-[11px] tracking-[0.08em] text-(--color-muted) uppercase`}>{k}</dt>
            <dd className="mt-2 text-[32px] leading-none text-(--color-ink)">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-6 sm:grid-cols-3">
        <Ledger title="By type" rows={stats.byMode.map(([k, v]) => [MODE_LABEL[k] ?? k, v])} />
        <Ledger title="Hosting" rows={stats.providers} />
        <Ledger title="Countries" rows={stats.countries} />
      </div>
    </div>
  );
}

function Ledger({ title, rows }) {
  return (
    <div className={`border-2 border-(--line-strong) ${MONO} text-xs`}>
      <p className="border-b-2 border-(--line-strong) bg-(--color-card) px-3 py-2 text-(--color-muted) uppercase">{title}</p>
      <ul>
        {rows.length === 0 && <li className="px-3 py-2 text-(--color-muted)">—</li>}
        {rows.map(([k, v]) => (
          <li key={k} className="flex justify-between border-b border-(--line) px-3 py-2 last:border-b-0">
            <span className="text-(--color-ink)">{k}</span>
            <span className="text-(--color-ink) tabular-nums">{v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NameRow({ row, open, onToggle, onOwner }) {
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const [reason, setReason] = useState('');

  async function act(action, confirmText) {
    if (!window.confirm(confirmText)) return;
    setBusy(action);
    setResult(null);
    const res = await fetch('/api/admin/names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: row.name, action, reason }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setBusy(null);
    setResult(res?.ok ? `Done${body.commit ? ` (commit ${body.commit.slice(0, 7)})` : ''}. Reload to see it.` : `Failed: ${body?.error ?? 'network error'}`);
  }

  return (
    <>
      <tr className="cursor-pointer border-b border-(--line) align-top hover:bg-(--color-card)" onClick={onToggle}>
        <td className="px-3 py-2.5 text-(--color-ink)">{open ? '▾ ' : '▸ '}{row.name}</td>
        <td className="px-3 py-2.5">
          <button type="button" onClick={(e) => { e.stopPropagation(); onOwner(row.owner); }} className="text-(--color-ink) underline">@{row.owner}</button>
        </td>
        <td className="px-3 py-2.5 text-(--color-muted)">{MODE_LABEL[row.mode] ?? row.mode}{row.provider ? ` · ${row.provider}` : ''}</td>
        <td className="max-w-[260px] truncate px-3 py-2.5 text-(--color-muted)" title={row.target}>{row.target || '—'}</td>
        <td className="px-3 py-2.5 whitespace-nowrap text-(--color-muted)">{row.claimedAt ? row.claimedAt.slice(0, 10) : '—'}</td>
      </tr>
      {open && (
        <tr className="border-b-2 border-(--line-strong) bg-(--color-card)">
          <td colSpan={5} className="px-3 py-4">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <a className="underline" href={`https://${row.name}.runs-at.dev`} target="_blank" rel="noopener noreferrer">Visit ↗</a>
              <a className="underline" href={`/debug/${row.name}`} target="_blank" rel="noopener noreferrer">DNS check ↗</a>
              <a className="underline" href={`${REPO_URL}/blob/main/domains/${row.name}.json`} target="_blank" rel="noopener noreferrer">Record file ↗</a>
              <a className="underline" href={`${REPO_URL}/commits/main/domains/${row.name}.json`} target="_blank" rel="noopener noreferrer">History ↗</a>
              <a className="underline" href={`https://github.com/${row.owner}`} target="_blank" rel="noopener noreferrer">Owner on GitHub ↗</a>
            </div>
            <p className="mt-3 text-(--color-muted)">
              {row.subdomains} subdomain{row.subdomains === 1 ? '' : 's'} · country {row.country || '—'} · profile card {row.hasProfile ? 'customised' : 'default'}{row.mode === 'delegated' ? ` · DS ${row.ds}` : ''}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (goes in the commit)" className={`w-64 ${INPUT}`} onClick={(e) => e.stopPropagation()} />
              {row.mode === 'delegated' && (
                <button type="button" disabled={Boolean(busy)} onClick={() => act('clear_delegation', `Remove custom nameservers from ${row.name}? It goes back to runs-at.dev DNS.`)} className="btn-ghost px-3 py-1.5 text-xs">
                  {busy === 'clear_delegation' ? 'Working…' : 'Remove custom NS'}
                </button>
              )}
              <button type="button" disabled={Boolean(busy)} onClick={() => act('reset_card', `Remove every record from ${row.name}? It will show the profile card.`)} className="btn-ghost px-3 py-1.5 text-xs">
                {busy === 'reset_card' ? 'Working…' : 'Suspend (reset to card)'}
              </button>
              <button type="button" disabled={Boolean(busy)} onClick={() => act('release', `Delete ${row.name} from the registry? Anyone can claim it after this.`)} className="px-3 py-1.5 text-xs text-(--color-flag) underline">
                {busy === 'release' ? 'Working…' : 'Release name'}
              </button>
            </div>
            {result && <p className="mt-3 text-(--color-ink)">{result}</p>}
          </td>
        </tr>
      )}
    </>
  );
}
