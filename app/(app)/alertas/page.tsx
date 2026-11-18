import Link from 'next/link';
import IssueCard from '@/components/IssueCard';
import { Empty, NotConnected, PageHeader } from '@/components/ui';
import { dbReady, getClients, getIssues } from '@/lib/data';
import { todayISO } from '@/lib/dates';
import { bucket, CATEGORY_LABEL, sortIssues } from '@/lib/issues';

export default async function Advertencias({ searchParams }: { searchParams: { ver?: string; c?: string; cat?: string; src?: string } }) {
  const header = <PageHeader title="Advertencias" subtitle="Problemas vivos por cliente y tema. Se ordenan por evidencia reciente y estado, no por fecha de creación." />;
  if (!dbReady()) return <>{header}<NotConnected /></>;
  const today = todayISO();
  const [all, clients] = await Promise.all([getIssues(), getClients()]);
  const history = searchParams.ver === 'historial';
  let list = all.filter((i: any) => (history ? ['resolved', 'dismissed'].includes(i.status) : ['new', 'pending', 'monitoring'].includes(i.status)));
  if (searchParams.c) list = list.filter((i: any) => i.client_id === searchParams.c);
  if (searchParams.cat) list = list.filter((i: any) => i.category === searchParams.cat);
  if (searchParams.src) list = list.filter((i: any) => i.evidence?.some((e: any) => e.source_type === searchParams.src));
  const sorted = history ? list.sort((a: any, b: any) => String(b.resolved_on ?? '').localeCompare(String(a.resolved_on ?? ''))) : sortIssues(list as any[], today);
  const groups = new Map<string, any[]>();
  for (const i of sorted) { const b = history ? 'Histórico' : bucket(i as any, today).label; groups.set(b, [...(groups.get(b) ?? []), i]); }
  const activeCount = all.filter((i: any) => ['new', 'pending', 'monitoring'].includes(i.status)).length;
  const qs = (p: Record<string, string | undefined>) => '?' + new URLSearchParams(Object.entries({ ...searchParams, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  const cats = [...new Set(all.map((i: any) => i.category))];

  return (
    <>
      {header}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={qs({ ver: undefined })} className={history ? 'btn' : 'btn-primary'}>Activas ({activeCount})</Link>
        <Link href={qs({ ver: 'historial' })} className={history ? 'btn-primary' : 'btn'}>Histórico ({all.length - activeCount})</Link>
        <form className="ml-auto flex flex-wrap gap-2" action="/alertas">
          {history && <input type="hidden" name="ver" value="historial" />}
          <select name="c" defaultValue={searchParams.c ?? ''} className="input"><option value="">Todos los clientes</option>{clients.filter((c) => all.some((i: any) => i.client_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select>
          <select name="cat" defaultValue={searchParams.cat ?? ''} className="input"><option value="">Todos los temas</option>{cats.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</option>)}</select>
          <select name="src" defaultValue={searchParams.src ?? ''} className="input"><option value="">Todas las fuentes</option><option value="jotform">Jotform</option><option value="fathom">Llamadas</option><option value="crm">CRM</option><option value="system">Sistema</option></select>
          <button className="btn">Filtrar</button>
        </form>
      </div>
      {!sorted.length ? <Empty title={history ? 'Sin histórico todavía' : 'Sin advertencias activas'}>{history ? '' : 'Todo en orden con la información más reciente.'}</Empty> : (
        <div className="space-y-6">
          {[...groups.entries()].map(([g, items]) => (
            <div key={g} className="card">
              <div className="card-h"><span>{g} · {items.length}</span></div>
              {items.map((i) => <IssueCard key={i.id} i={i} />)}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
