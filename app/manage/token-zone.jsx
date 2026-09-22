'use client';

import { useState } from 'react';

// The whole deploy workflow as a paste-and-go prompt for a coding agent. The
// token rides inside it (or a placeholder before one exists), because the
// one thing an agent cannot do for itself is mint a browser-session
// credential — everything after that is three curl-able endpoints.
function agentPrompt(token, expiresNote) {
  return `You are deploying a static site to runs-on.dev for me.

AUTH
Bearer token (publishes only to my claimed runs-on.dev name, ${expiresNote}):
${token}
Send it as an Authorization: Bearer header on every request below. Never
commit it to git, log it, or send it anywhere except runs-on.dev.

BASE URL: https://runs-on.dev

1) DEPLOY
- Build the site first. The upload is the BUILT static output (HTML, CSS,
  JS, assets), never the source project.
- Zip the output so index.html sits at the ROOT of the zip, not inside a
  dist/ or public/ folder:
    cd <output-directory> && zip -r site.zip .
- Upload:
    curl -X POST https://runs-on.dev/api/sites/deploy \\
      -H "Authorization: Bearer ${token}" \\
      -F "site=@site.zip"
- Success is 200 with { url, deploymentId, files, bytes }. Tell me the url
  and the deploymentId.

ZIP RULES (enforced server-side; a bad zip is rejected with a reason)
- index.html is required at the zip root
- zip at most 10 MB, uncompressed total at most 100 MB, at most 500 entries
- relative paths only: no leading /, no .., no drive letters, no backslashes
- no encrypted entries, standard stored/deflate compression only, no
  duplicate file names

2) LIST DEPLOYMENTS
    curl -H "Authorization: Bearer ${token}" \\
      https://runs-on.dev/api/sites/deployments
Returns { active, deployments: [{ id, at, files, bytes }] }, newest last.

3) ROLL BACK (instant, no re-upload)
    curl -X POST https://runs-on.dev/api/sites/rollback \\
      -H "Authorization: Bearer ${token}" \\
      -H "Content-Type: application/json" \\
      -d '{"deploymentId":"<8-hex id from the list>"}'

ERRORS: fix per code, never blind-retry
- 400 no_index_html: re-zip with index.html at the root
- 400 invalid_zip plus a reason: fix the zip per the reason
- 413 too_big: shrink assets, then redeploy
- 409 stale: a newer deploy landed mid-flight. List deployments, decide,
  then redeploy
- 429 rate_limited: wait the Retry-After seconds, retry once
- 503: runs-on.dev is busy or its storage is not configured. Tell me and
  stop retrying

NOTES
- The last 5 deployments are kept; older ones are deleted and cannot be
  rolled back to.
- If the url still shows a profile card, serving is not enabled on
  runs-on.dev yet; the deployment itself succeeded.
- Deploying never touches DNS records or the profile card settings.`;
}

// Small outlined action in the system's voice: a fading slit frame that
// brightens on hover. Used for the secondary copy/regenerate controls.
const MINI = 'slit-frame rounded-[4px] px-2.5 py-1.5 font-(family-name:--font-mono) text-xs text-(--color-muted) hover:text-(--color-ink)';

// The deploy-token card. Account-scoped, unlike the record forms above it,
// which are per-name: one login mints one kind of credential, and the
// deployment it unlocks is always that account's own name.
export default function TokenZone({ login }) {
  const [state, setState] = useState('idle'); // idle | minting | minted | error
  const [token, setToken] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [errorCode, setErrorCode] = useState(null);

  async function mint() {
    setState('minting');
    setCopied(false);
    try {
      const res = await fetch('/api/tokens', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.token) {
        setToken(body.token);
        setExpiresAt(body.expiresAt);
        setState('minted');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function copyPrompt(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {}
  }

  return (
    <section className="slit-frame rounded-lg">
      <div className="slit-bottom px-6 py-5 sm:px-8">
        <p className="font-(family-name:--font-mono) text-xs text-(--color-muted)">@{login}</p>
        <h2 className="mt-1.5 text-[23px] leading-[1.07] font-normal tracking-[-0.004em] text-(--color-ink)">Deploy token</h2>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <p className="max-w-[540px] text-sm leading-relaxed text-(--color-muted)">
          Publish a static site to your name from a terminal or a coding agent, no browser
          needed. Generate a token, then:
        </p>
        <pre className="slit-frame mt-4 rounded-lg bg-(--color-card) px-3 py-2.5 font-(family-name:--font-mono) text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:break-word] text-(--color-ash)">
{`curl -X POST https://runs-on.dev/api/sites/deploy \\
  -H "Authorization: Bearer <token>" \\
  -F "site=@dist.zip"`}
        </pre>

        {state !== 'minted' && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={mint}
              disabled={state === 'minting'}
              className="btn-pill px-4 py-2 text-xs"
            >
              {state === 'minting' ? 'Generating…' : 'Generate token'}
            </button>
            {state === 'error' && (
              <span className="font-(family-name:--font-mono) text-xs text-(--color-flag)">
                could not generate just now, try again
              </span>
            )}
          </div>
        )}

        {state === 'minted' && (
          <div className="mt-5 space-y-3">
            {/* Shown exactly once: the server stores nothing, so there is no
                list to come back to and no way to show it again later. */}
            <div className="slit-bar-l rounded-r-lg bg-(--color-card) p-3 pl-4">
              <p className="font-(family-name:--font-mono) text-xs text-(--color-muted)">
                shown once · copy it now
              </p>
              <div className="mt-2 flex items-start gap-3">
                <code className="min-w-0 flex-1 break-all font-(family-name:--font-mono) text-xs text-(--color-ink)">
                  {token}
                </code>
                <button type="button" onClick={copy} className={`shrink-0 ${MINI}`}>
                  {copied ? 'copied' : 'copy'}
                </button>
              </div>
            </div>
            <p className="max-w-[540px] text-xs leading-relaxed text-(--color-muted)">
              Expires {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'in 30 days'}.
              Treat it like a password: it can publish to your name and nothing else.
              Generating another does not revoke this one; old tokens simply expire.
            </p>
            <button type="button" onClick={mint} className={MINI}>
              generate another
            </button>
          </div>
        )}

        {/* The paste-and-go agent prompt. Embeds the real token only while
            this render has one (the mint response is shown once); after a
            reload it falls back to the placeholder, because stateless tokens
            cannot be listed or shown again. The runbook panel is a plain
            carbon fill (no frame) so its vertical scroll never clips a tail. */}
        {(() => {
          const live = state === 'minted';
          const expiresNote = live
            ? `expires ${expiresAt ? new Date(expiresAt).toLocaleDateString() : 'in 30 days'}`
            : 'expires 30 days after you generate it';
          const text = agentPrompt(
            live ? token : 'rod1.YOUR_TOKEN (generate one above first)',
            expiresNote,
          );
          return (
            <details className="slit-frame mt-6 rounded-lg" open={live}>
              <summary className="cursor-pointer px-4 py-3 font-(family-name:--font-mono) text-xs text-(--color-ink)">
                {'// '}hand this to your AI agent
              </summary>
              <div className="slit-top px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="max-w-[420px] text-xs leading-relaxed text-(--color-muted)">
                    A complete deploy-runbook prompt. {live
                      ? 'Your token is already embedded.'
                      : 'Generate a token first and it will embed itself.'}
                  </p>
                  <button type="button" onClick={() => copyPrompt(text)} className={`shrink-0 ${MINI}`}>
                    {copiedPrompt ? 'copied' : 'copy prompt'}
                  </button>
                </div>
                <pre className="mt-3 max-h-96 overflow-y-auto rounded-lg bg-(--color-card) px-3 py-2.5 font-(family-name:--font-mono) text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:break-word] text-(--color-ash)">
{text}
                </pre>
              </div>
            </details>
          );
        })()}
      </div>
    </section>
  );
}
