'use client';

import { useState } from 'react';

const MINI = 'slit-frame px-2.5 py-1.5 font-(family-name:--font-mono) text-xs text-(--color-muted) hover:text-(--color-ink)';

// The REST API token card. Account-scoped: one token manages every name the
// account owns, through the same rules as this page (lib/record-update.js).
export default function ApiZone({ login }) {
  const [state, setState] = useState('idle'); // idle | minting | minted | revoking | revoked | error
  const [token, setToken] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [copied, setCopied] = useState(false);

  async function call(method, next) {
    setState(method === 'POST' ? 'minting' : 'revoking');
    try {
      const res = await fetch('/api/v1/tokens', { method });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setState('error');
      next(body);
    } catch {
      setState('error');
    }
  }

  const mint = () => call('POST', (b) => { setToken(b.token); setExpiresAt(b.expiresAt); setCopied(false); setState('minted'); });
  const revoke = () => {
    if (!window.confirm('Revoke every API token for this account? Scripts using them stop working at once.')) return;
    call('DELETE', () => { setToken(''); setState('revoked'); });
  };

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <details className="border-2 border-(--line-strong) bg-(--color-card)">
      <summary className="cursor-pointer px-4 py-3 font-(family-name:--font-mono) text-sm text-(--color-ink)">
        API access <span className="ml-2 text-xs text-(--color-muted)">manage your names from scripts · @{login}</span>
      </summary>
      <div className="border-t-2 border-(--line-strong) px-4 py-4 text-sm">
        <p className="max-w-[560px] leading-relaxed text-(--color-muted)">
          A personal token for the REST API: read and change records, subdomains, nameservers and DS
          for every name you own, with the same checks as this page. See the{' '}
          <a className="underline text-(--color-ink)" href="/docs/api">API docs</a>.
        </p>
        <pre className="mt-3 rounded-lg bg-(--color-bg) px-3 py-2.5 font-(family-name:--font-mono) text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:break-word] text-(--color-ash)">
{`curl -H "Authorization: Bearer <token>" https://runs-at.dev/api/v1/names`}
        </pre>

        {state === 'minted' ? (
          <div className="mt-4 space-y-2">
            <p className="font-(family-name:--font-mono) text-xs text-(--color-muted)">shown once · copy it now</p>
            <div className="flex items-start gap-3">
              <code className="min-w-0 flex-1 break-all font-(family-name:--font-mono) text-xs text-(--color-ink)">{token}</code>
              <button type="button" onClick={copy} className={`shrink-0 ${MINI}`}>{copied ? 'copied' : 'copy'}</button>
            </div>
            <p className="text-xs leading-relaxed text-(--color-muted)">
              Expires {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'in 90 days'}. Treat it like a password.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={mint} disabled={state === 'minting'} className="btn-pill px-4 py-2 text-xs">
              {state === 'minting' ? 'Generating…' : 'Generate API token'}
            </button>
            {state === 'revoked' && <span className="font-(family-name:--font-mono) text-xs text-(--color-muted)">all tokens revoked</span>}
            {state === 'error' && <span className="font-(family-name:--font-mono) text-xs text-(--color-flag)">could not do that just now, try again</span>}
          </div>
        )}
        <button type="button" onClick={revoke} disabled={state === 'revoking'} className={`mt-4 ${MINI}`}>
          {state === 'revoking' ? 'revoking…' : 'revoke all tokens'}
        </button>
      </div>
    </details>
  );
}
