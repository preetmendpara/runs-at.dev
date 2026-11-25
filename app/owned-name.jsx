import { REPO_URL } from '../lib/repo.js';

// Shown to an owner who has used every slot, so has nothing to claim. Showing
// them the claim form anyway offers an action that can only be refused, and
// the refusal is where a returning owner used to dead-end. This replaces the
// form with the thing they actually came back for: their own names, and a
// way into each one.
//
// One name: that name, what it does, and the way in. Several (an admin grant,
// a raised limit): a heading that says how many, and a dropdown listing every
// one of them with its own Manage link, so none is hidden behind the first.
export default function OwnedName({ names, records }) {
  const list = Array.isArray(names) ? names : [];
  if (list.length === 0) return null;
  const first = list[0];
  const many = list.length > 1;
  const records0 = records?.[first]?.records ?? {};
  const types = Object.keys(records0);
  const pointing = types.length > 0;

  return (
    <div className="w-full max-w-[640px]">
      <p className="font-(family-name:--font-mono) text-xs text-(--color-muted)">
        {many ? `${list.length} names · claimed` : `domains/${first}.json · claimed`}
      </p>

      <h2 className="mt-3 text-[34px] leading-[1.03] tracking-[-0.005em] text-(--color-ink) sm:text-[44px] sm:tracking-[-0.007em]">
        {many ? (
          <>You own {list.length} names</>
        ) : (
          <>
            <span className="underline decoration-(--color-blue) decoration-2 underline-offset-[8px]">{first}.runs-at.dev</span> is yours
          </>
        )}
      </h2>

      {many ? (
        <details open className="mt-6 border-2 border-(--line-strong) bg-(--color-paper) text-left">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-(family-name:--font-mono) text-[13px] tracking-[0.08em] text-(--color-ink) uppercase">
            <span>Your names</span>
            <span aria-hidden="true">▾</span>
          </summary>
          <ul className="border-t-2 border-(--line-strong) font-(family-name:--font-mono) text-[13px]">
            {list.map((n) => (
              <li key={n} className="flex flex-wrap items-center justify-between gap-3 border-b border-(--line) px-4 py-3 last:border-b-0">
                <span className="break-all text-(--color-ink)">
                  {n}<span className="text-(--color-muted)">.runs-at.dev</span>
                  <span className="ml-3 text-xs text-(--color-muted)">{summary(records?.[n])}</span>
                </span>
                <span className="flex gap-4 text-xs">
                  <a className="text-(--color-ink) underline" href={`/manage?name=${encodeURIComponent(n)}`}>Manage</a>
                  <a className="text-(--color-muted) underline hover:text-(--color-ink)" href={`https://${n}.runs-at.dev`} target="_blank" rel="noopener noreferrer">Visit ↗</a>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : pointing ? (
        <dl className="mt-6 space-y-1.5 text-left font-(family-name:--font-mono) text-xs sm:text-[13px]">
          {types.map((type) => (
            <div key={type} className="slit-top slit-dim flex gap-4 pt-1.5">
              <dt className="w-20 shrink-0 text-(--color-muted)">{type}</dt>
              <dd className="break-all text-(--color-ink)">{describe(records0[type])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 max-w-xl text-[16px] leading-[1.5] text-(--color-muted)">
          It isn&rsquo;t pointing anywhere yet, so it serves a profile card built from your
          GitHub account. Add DNS records for your site, or set your own nameservers, whenever you like.
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
        <a href={`/manage?name=${encodeURIComponent(first)}`} className="btn-pill">
          {many ? 'Manage your names' : pointing ? 'Manage DNS' : 'Set up DNS'}
          <span aria-hidden="true">→</span>
        </a>
        {!many && (
          <>
            <a
              className="font-(family-name:--font-mono) text-sm text-(--color-muted) underline hover:text-(--color-ink)"
              href={`https://${first}.runs-at.dev`}
              target="_blank"
              rel="noopener noreferrer"
            >
              your page ↗
            </a>
            <a
              className="font-(family-name:--font-mono) text-sm text-(--color-muted) underline hover:text-(--color-ink)"
              href={`${REPO_URL}/blob/main/domains/${first}.json`}
              target="_blank"
              rel="noopener noreferrer"
            >
              the record ↗
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// One short label per name in the list: what it does right now.
function summary(record) {
  const r = record?.records ?? {};
  if (record?.nameservers?.length) return 'custom nameservers';
  if (r.URL) return 'redirect';
  const types = Object.keys(r);
  const subs = Object.keys(record?.subdomains ?? {}).length;
  if (types.length === 0 && subs === 0) return 'profile card';
  return [types.join(', '), subs ? `${subs} subdomain${subs === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
}

// Records hold a string, a list of strings, or MX objects, so each renders as
// the one line a person would read it as rather than as raw JSON.
function describe(value) {
  if (Array.isArray(value)) {
    return value
      .map((v) => (v && typeof v === 'object' ? `${v.priority} ${v.value}` : v))
      .join(', ');
  }
  return String(value);
}
