import { REPO_URL } from '../lib/repo.js';

// One name per account, so a signed-in owner has nothing to claim. Showing
// them the claim form anyway offers an action that can only be refused, and
// the refusal is where a returning owner used to dead-end. This replaces the
// form with the thing they actually came back for: their own record, and a
// way into it.
export default function OwnedName({ name, record }) {
  const records = record?.records ?? {};
  const types = Object.keys(records);
  const pointing = types.length > 0;

  return (
    <div className="w-full max-w-[640px]">
      <p className="font-(family-name:--font-mono) text-xs text-(--color-muted)">
        domains/{name}.json
      </p>

      <h2 className="mt-3 text-[34px] leading-[1.03] tracking-[-0.005em] text-(--color-ink) sm:text-[44px] sm:tracking-[-0.007em]">
        <span className="underline decoration-(--color-blue) decoration-2 underline-offset-[8px]">{name}.runs-on.dev</span> is yours
      </h2>

      {pointing ? (
        <dl className="mt-6 space-y-1.5 text-left font-(family-name:--font-mono) text-xs sm:text-[13px]">
          {types.map((type) => (
            <div key={type} className="slit-top slit-dim flex gap-4 pt-1.5">
              <dt className="w-20 shrink-0 text-(--color-muted)">{type}</dt>
              <dd className="break-all text-(--color-ink)">{describe(records[type])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 max-w-xl text-[16px] leading-[1.5] text-(--color-muted)">
          It isn&rsquo;t pointing anywhere yet, so it serves a profile card built from your
          GitHub account. Point it at your own site, a redirect, or an email
          forwarder whenever you like.
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
        <a href="/manage" className="btn-pill">
          {pointing ? 'Edit your record' : 'Point it somewhere'}
          <span aria-hidden="true">→</span>
        </a>
        <a
          className="font-(family-name:--font-mono) text-sm text-(--color-muted) underline hover:text-(--color-ink)"
          href={`https://${name}.runs-on.dev`}
          target="_blank"
          rel="noopener noreferrer"
        >
          your page ↗
        </a>
        <a
          className="font-(family-name:--font-mono) text-sm text-(--color-muted) underline hover:text-(--color-ink)"
          href={`${REPO_URL}/blob/main/domains/${name}.json`}
          target="_blank"
          rel="noopener noreferrer"
        >
          the record ↗
        </a>
        <a
          className="font-(family-name:--font-mono) text-sm text-(--color-muted) underline hover:text-(--color-ink)"
          href={`/banner/${name}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          your banner ↗
        </a>
      </div>
    </div>
  );
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
