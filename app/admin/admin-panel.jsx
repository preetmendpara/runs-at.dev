'use client';

import { useState } from 'react';

const INPUT =
  'slit-input w-full bg-transparent px-3 py-2 font-(family-name:--font-mono) text-sm text-(--color-ink) placeholder:text-(--color-muted)/70';

const ERRORS = {
  invalid_login: 'That is not a valid GitHub login.',
  invalid_amount: 'Amount must be a positive whole number.',
  unknown_user: 'No GitHub account with that login.',
  below_required: 'That would take away slots the account is using.',
  busy: 'GitHub is busy. Try again in a moment.',
  forbidden: 'Forbidden.',
  signin_required: 'Sign in again.',
};

export default function AdminPanel() {
  const [query, setQuery] = useState('');
  const [user, setUser] = useState(null);
  const [amount, setAmount] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function load(e) {
    e?.preventDefault();
    setError(null);
    setPending(true);
    const res = await fetch(`/api/admin/entitlements?login=${encodeURIComponent(query.trim())}`).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setPending(false);
    if (!res?.ok) {
      setUser(null);
      setError(ERRORS[body?.error] ?? 'Something went wrong.');
      return;
    }
    setUser(body);
  }

  async function change(action) {
    setError(null);
    setPending(true);
    const res = await fetch('/api/admin/entitlements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: user.login, action, amount, reason }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setPending(false);
    if (!res?.ok) {
      const revocable = body?.error === 'below_required' ? ` At most ${body.revocable} can be revoked.` : '';
      setError((ERRORS[body?.error] ?? 'Something went wrong.') + revocable);
      return;
    }
    setUser(body);
    setReason('');
  }

  return (
    <div className="space-y-10 text-sm">
      <form onSubmit={load} className="flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="github login"
          aria-label="GitHub login"
          spellCheck={false}
          className={INPUT}
        />
        <button type="submit" disabled={pending || !query.trim()} className="btn-pill">Search</button>
      </form>

      {error && <p className="record-field text-(--color-muted)">// {error}</p>}

      {user && (
        <div className="space-y-8">
          <div>
            <p className="meta">User</p>
            <p className="mt-2 text-(--color-ink)">@{user.login}</p>
          </div>

          <div>
            <p className="meta">Domains</p>
            {user.domains.length ? (
              <ul className="mt-2 space-y-1 font-(family-name:--font-mono) text-(--color-ink)">
                {user.domains.map((n) => <li key={n}>{n}.runs-at.dev</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-(--color-muted)">None</p>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5 font-(family-name:--font-mono)">
            {[
              ['Included', user.included],
              ['Admin granted', user.adminGranted],
              ['Total', user.total],
              ['Used', user.used],
              ['Available', user.available],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-(--color-muted)">{label}</dt>
                <dd className="mt-1 text-(--color-ink)">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-3">
            <p className="meta">Grant or revoke slots</p>
            <label className="block">
              <span className="text-xs text-(--color-muted)">Amount</span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`mt-2 ${INPUT}`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-(--color-muted)">Reason</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                placeholder="Beta tester"
                className={`mt-2 ${INPUT}`}
              />
            </label>
            <div className="flex gap-3">
              <button type="button" disabled={pending} onClick={() => change('grant')} className="btn-pill">Grant</button>
              <button type="button" disabled={pending} onClick={() => change('revoke')} className="btn-ghost px-4 py-2 text-xs">
                Revoke unused
              </button>
            </div>
          </div>

          <div>
            <p className="meta">Audit log</p>
            {user.history.length ? (
              <ul className="mt-2 space-y-1 font-(family-name:--font-mono) text-xs text-(--color-muted)">
                {[...user.history].reverse().map((h, i) => (
                  <li key={i}>
                    {h.at} · @{h.by} · {h.action} {h.amount} · granted now {h.adminGranted}
                    {h.reason ? ` · ${h.reason}` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-(--color-muted)">No grants yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
