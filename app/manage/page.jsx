import { cookies } from 'next/headers';
import { readSession, SESSION_COOKIE } from '../../lib/session.js';
import { getOwnerIndex } from '../../lib/owners.js';
import { getRecord } from '../../lib/registry.js';
import { getEntitlement, heldNames, slotSummary } from '../../lib/entitlements.js';
import RecordForm from './record-form.jsx';
import BadgeZone from './badge-zone.jsx';
import { resolveManagedNames } from '../../lib/manage-select.js';

export const metadata = {
  title: 'Manage your domains · runs-at.dev',
  description: 'Point each of your runs-at.dev domains at your own hosting, or show a profile card.',
  robots: { index: false },
};

// Always reflects what is actually committed right now: an owner who just
// saved must not be shown a cached copy of the record they replaced.
export const dynamic = 'force-dynamic';

const TOKEN = () => process.env.REGISTRY_TOKEN;

export default async function Manage({ searchParams }) {
  const requested = (await searchParams)?.name;
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = raw ? readSession(raw, process.env.SESSION_SECRET) : null;

  if (!session?.login) {
    return (
      <Shell>
        <p className="text-sm leading-relaxed text-(--color-ash)">
          <a className="text-(--color-ink) underline" href="/api/auth/github">
            Sign in with GitHub
          </a>{' '}
          to manage the domains you own.
        </p>
      </Shell>
    );
  }

  const [index, entitlement] = await Promise.all([
    getOwnerIndex(session.login, { token: TOKEN() }).catch(() => null),
    getEntitlement(session.login, { token: TOKEN() }).catch(() => null),
  ]);
  // Candidates only: resolveManagedNames reads each domain file and keeps
  // the names this login actually owns, so a stale index or entitlement can
  // never open someone else's name here.
  const { owned, unreadable, selected, refused } = await resolveManagedNames({
    login: session.login,
    candidates: [...(index?.names ?? []), ...(entitlement?.names ?? [])],
    requested,
    readRecord: (name) => getRecord(name, { token: TOKEN() }),
  });
  // Display only: /api/claim re-reads both before it lets a claim through.
  // Counted from names verified above plus the authoritative record (which
  // also holds reservations), never from unverified index entries.
  const slots = entitlement
    ? slotSummary(entitlement, heldNames(entitlement, owned.map((o) => o.name)).length)
    : null;

  if (owned.length === 0 && unreadable.length === 0) {
    return (
      <Shell login={session.login}>
        <p className="text-sm leading-relaxed text-(--color-ash)">
          @{session.login} does not own a domain yet.{' '}
          <a className="text-(--color-ink) underline" href="/">
            Claim one
          </a>
          .
        </p>
      </Shell>
    );
  }

  const current = owned.find((o) => o.name === selected);

  return (
    <Shell login={session.login}>
      <Domains names={owned.map((o) => o.name)} selected={selected} slots={slots} />
      {refused && (
        // Same answer whether the name is someone else's, free or made up, so
        // this page never reveals who owns what.
        <p className="font-(family-name:--font-mono) text-xs text-(--color-muted)">
          {'// that name is not one of your domains. Pick one above.'}
        </p>
      )}
      {current && (
        // Only the selected name's controls are on the page, so every save,
        // swap and release here acts on that one name. The badge is that
        // name's card, under its form so the preview shows what was edited.
        <div key={current.name}>
          <RecordForm name={current.name} record={current.record} />
          <BadgeZone name={current.name} />
        </div>
      )}
      {/* A name whose file cannot be read is listed here rather than hiding
          the others: one unreadable record must not take the page down. */}
      {unreadable.length > 0 && (
        <p className="font-(family-name:--font-mono) text-xs text-(--color-muted)">
          {'// not shown just now: '}
          {unreadable.map((name) => `domains/${name}.json`).join(', ')}
        </p>
      )}
      {/* The deploy-token panel (token-zone.jsx) is deliberately not rendered.
          Its endpoints work, but nothing in the request path ever serves an
          uploaded site: app/sites/[name]/page.jsx renders from the record
          alone and never reads getSite. Offering tokens and upload commands
          for hosting that cannot answer is worse than offering nothing, so
          the panel stays out until the serving path exists. */}
    </Shell>
  );
}

// Every domain the signed-in account owns, the one being managed marked, and
// how many more it may claim. Switching is a plain link: the session cookie
// rides along, so there is no second sign-in.
function Domains({ names, selected, slots }) {
  return (
    <section>
      <p className="meta">Your domains</p>
      <ul className="mt-3 space-y-1.5 font-(family-name:--font-mono) text-sm">
        {names.map((n) => (
          <li key={n} className="flex flex-wrap items-baseline gap-x-3">
            <span aria-hidden="true" className={n === selected ? 'text-(--color-ink)' : 'text-(--color-muted)'}>
              {n === selected ? '●' : '○'}
            </span>
            <span aria-current={n === selected ? "page" : undefined} className={n === selected ? "text-(--color-ink)" : "text-(--color-muted)"}>{n}.runs-at.dev</span>
            {n === selected ? (
              <span className="text-xs text-(--color-muted)">managing</span>
            ) : (
              <a className="text-xs text-(--color-ink) underline" href={`/manage?name=${encodeURIComponent(n)}`}>
                Manage
              </a>
            )}
          </li>
        ))}
      </ul>
      {slots && (
        <p className="mt-3 text-sm text-(--color-muted)">
          {slots.used} of {slots.total} domain{slots.total === 1 ? '' : 's'} used
          {slots.available > 0 ? (
            <>
              {' · '}{slots.available} domain{slots.available === 1 ? '' : 's'} available{' · '}
              <a className="text-(--color-ink) underline" href="/">Claim another domain</a>
            </>
          ) : (
            <>{' · '}You've used all your domain slots.</>
          )}
        </p>
      )}
    </section>
  );
}

function Shell({ children, login }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <p className="meta">Manage</p>
      <h1 className="mt-3 text-[34px] leading-[1.03] font-normal tracking-[-0.005em] text-(--color-ink) sm:text-[44px] sm:tracking-[-0.007em]">
        Your domains
      </h1>
      <p className="mt-4 max-w-[540px] text-[16px] leading-[1.5] text-(--color-muted)">
        Changes save straight to the public registry, and DNS follows within a minute
        or two. The panel under each name tells you whether it is working.
      </p>
      {login && (
        <form action="/api/auth/signout" method="post" className="mt-4 text-sm text-(--color-muted)">
          Signed in as @{login} ·{' '}
          <button type="submit" className="cursor-pointer text-(--color-ink) underline">
            Sign out
          </button>
        </form>
      )}
      <div className="mt-12 space-y-12">{children}</div>
    </main>
  );
}
