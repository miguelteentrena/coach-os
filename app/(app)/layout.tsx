import Sidebar from '@/components/Sidebar';
import { dbReady } from '@/lib/data';
import { userDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function counts(): Promise<Record<string, number>> {
  if (!dbReady()) return {};
  try {
    const db = userDb();
    const [a, w, r, l] = await Promise.all([
      db.from('issues').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      db.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      db.from('identity_reviews').select('id', { count: 'exact', head: true }).is('resolved_at', null),
      db.from('calls').select('id', { count: 'exact', head: true }).is('client_id', null),
    ]);
    return { '/alertas': a.count ?? 0, '/whatsapp': w.count ?? 0, '/checkins': r.count ?? 0, '/llamadas': l.count ?? 0 };
  } catch { return {}; }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar counts={await counts()} />
      <main className="relative z-10 px-4 py-6 sm:px-8 lg:ml-64 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </>
  );
}
