import { cookies } from 'next/headers';
import { readSession, SESSION_COOKIE } from '../../lib/session.js';
import { isAdmin } from '../../lib/admin.js';
import AdminPanel from './admin-panel.jsx';
import PageHeader from '../components/page-header.jsx';

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
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <PageHeader label="admin" crumb="Admin" title="Domain slots">
        Every account has 1 free domain included. Extra slots granted here let an account
        claim more through the normal flow.
      </PageHeader>
      <div className="mt-12 border-2 border-(--line-strong) bg-(--color-card) p-5 sm:p-8">
        <AdminPanel />
      </div>
    </main>
  );
}
