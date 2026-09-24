import { cookies } from 'next/headers';
import Reveal from '../motion/reveal.jsx';
import { readSession, SESSION_COOKIE } from '../../lib/session.js';
import { getOwnerIndex } from '../../lib/owners.js';
import { getRecord } from '../../lib/registry.js';
import RecordForm from './record-form.jsx';
import BadgeZone from './badge-zone.jsx';

export const metadata = {
  title: 'Manage your name · runs-at.dev',
  description: 'Point your runs-at.dev name at your own hosting, or show a profile card.',
  robots: { index: false },
};

// Always reflects what is actually committed right now: an owner who just
// saved must not be shown a cached copy of the record they replaced.
export const dynamic = 'force-dynamic';

const TOKEN = () => process.env.REGISTRY_TOKEN;

export default async function Manage() {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = raw ? readSession(raw, process.env.SESSION_SECRET) : null;

  if (!session?.login) {
    return (
      <Shell>
        <p className="text-sm leading-relaxed text-(--color-ash)">
          <a className="text-(--color-ink) underline" href="/api/auth/github">
            Sign in with GitHub
          </a>{' '}
          to edit the record for a name you own.
        </p>
      </Shell>
    );
  }

  const index = await getOwnerIndex(session.login, { token: TOKEN() }).catch(() => null);
  const names = index?.names ?? [];

  if (names.length === 0) {
    return (
      <Shell login={session.login}>
        <p className="text-sm leading-relaxed text-(--color-ash)">
          @{session.login} does not own a name yet.{' '}
          <a className="text-(--color-ink) underline" href="/">
            Claim one
          </a>
          .
        </p>
      </Shell>
    );
  }

  const records = await Promise.all(
    names.map((name) => getRecord(name, { token: TOKEN() }).catch(() => null)),
  );
  const unreadable = names.filter((_, i) => !records[i]);

  return (
    <Shell login={session.login}>
      {records.map((record, i) =>
        record ? (
          // Per name, not per account: the badge is that name's card. Sits
          // under its form so the thing you just edited is the thing the
          // preview shows.
          <div key={names[i]}>
            <RecordForm name={names[i]} record={record} />
            <BadgeZone name={names[i]} />
          </div>
        ) : null,
      )}
      {/* An indexed name whose file cannot be read is skipped rather than
          replacing the whole page with an error: one unreadable record must
          not hide the others, and "reload to try again" was a promise the
          stale-index window after a swap could not keep. */}
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

function Shell({ children, login }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <Reveal immediate stagger>
        <p className="meta">Manage</p>
        <h1 className="mt-3 text-[34px] leading-[1.03] font-normal tracking-[-0.005em] text-(--color-ink) sm:text-[44px] sm:tracking-[-0.007em]">
          Your name
        </h1>
        <p className="mt-4 max-w-[540px] text-[16px] leading-[1.5] text-(--color-muted)">
          Changes save straight to the public registry, and DNS follows within a minute or two. The
          panel under each name tells you whether it is working.
        </p>
        {login && (
          <form
            action="/api/auth/signout"
            method="post"
            className="mt-4 text-sm text-(--color-muted)"
          >
            Signed in as @{login} ·{' '}
            <button type="submit" className="cursor-pointer text-(--color-ink) underline">
              Sign out
            </button>
          </form>
        )}
      </Reveal>
      <Reveal immediate delay={0.2} stagger className="mt-12 space-y-12">
        {children}
      </Reveal>
    </main>
  );
}
