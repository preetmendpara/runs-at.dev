import { cookies } from 'next/headers';
import { readSession, SESSION_COOKIE } from '../../lib/session.js';
import { isAdmin } from '../../lib/admin.js';
import AdminPanel from './admin-panel.jsx';

export const metadata = {
  title: 'Admin · runs-at.dev',
  robots: { index: false },
};

export const dynamic = 'force-dynamic';

export default async function Admin() {
  // proxy.js already answered 403 to anyone else; this is the second check,
  // so the panel never renders even if the proxy matcher ever misses.
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = raw ? readSession(raw, process.env.SESSION_SECRET) : null;
  if (!isAdmin(session)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm text-(--color-muted)">Forbidden.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <p className="meta">Admin</p>
      <h1 className="mt-3 text-[34px] leading-[1.03] font-normal tracking-[-0.005em] text-(--color-ink) sm:text-[44px] sm:tracking-[-0.007em]">
        Domain slots
      </h1>
      <p className="mt-4 max-w-[540px] text-[16px] leading-[1.5] text-(--color-muted)">
        Every account gets one name. Extra slots granted here let an account claim more
        through the normal flow.
      </p>
      <div className="mt-12">
        <AdminPanel />
      </div>
    </main>
  );
}
