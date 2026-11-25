import { cookies } from 'next/headers';
import { readSession, SESSION_COOKIE } from '../../lib/session.js';
import { isAdmin } from '../../lib/admin.js';
import { getRegistrySnapshot } from '../../lib/registry-cache.js';
import { nameRows, userRows, overview } from '../../lib/admin-data.js';
import AdminDashboard from './admin-dashboard.jsx';
import PageHeader from '../components/page-header.jsx';

export const metadata = {
  title: 'Admin',
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

  // The same live registry snapshot the homepage and /stats count from.
  const snapshot = await getRegistrySnapshot();
  const rows = nameRows(snapshot.records);
  const users = userRows(rows);
  const stats = overview(rows);

  return (
    <main className="mx-auto max-w-[1200px] px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <PageHeader label="admin" crumb="Admin" title="Admin">
        Every name and every user in the registry. Search, inspect, and act on any name; grant extra slots under Slots.
      </PageHeader>
      <div className="mt-10">
        <AdminDashboard rows={rows} users={users} stats={stats} asOf={snapshot.asOf} commit={snapshot.commit} />
      </div>
    </main>
  );
}
