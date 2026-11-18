import Link from 'next/link';
import { DaysLeft, LevelBadge, NotConnected, PageHeader, Progress } from '@/components/ui';
import { dbReady, getClients } from '@/lib/data';
import { fmtES } from '@/lib/dates';

const STATUS: Record<string, string> = { active: 'Activo', upcoming: 'Por empezar', finished: 'Finalizado', abandoned: 'Abandono' };

export default async function Clientes({ searchParams }: { searchParams: { ver?: string } }) {
  const header = <PageHeader title="Clientes" subtitle="Fuente de verdad administrativa: tu CRM de Google Sheets" />;
  if (!dbReady()) return <>{header}<NotConnected /></>;
  const all = await getClients();
  const showAll = searchParams.ver === 'todos';
  const list = showAll ? all : all.filter((c) => c.status === 'active' || c.status === 'upcoming');
  return (
    <>
      <PageHeader title="Clientes" subtitle="Fuente de verdad administrativa: tu CRM de Google Sheets"
        right={<div className="flex gap-2"><Link className={showAll ? 'btn' : 'btn-primary'} href="/clientes">Activos</Link><Link className={showAll ? 'btn-primary' : 'btn'} href="/clientes?ver=todos">Todos ({all.length})</Link></div>} />
      <div className="card overflow-x-auto">
        <table className="table w-full min-w-[820px]">
          <thead><tr><th>Cliente</th><th>Estado</th><th>Inicio</th><th>Progreso</th><th>Restan</th><th>Fin</th><th>Último check-in</th><th></th></tr></thead>
          <tbody>
            {list.map((c) => {
              const p = c.program;
              const prog = p?.days_elapsed != null && p?.days_remaining != null ? p.days_elapsed / Math.max(1, p.days_elapsed + p.days_remaining) : null;
              return (
                <tr key={c.id} className="hover:bg-ink-850/60">
                  <td><Link href={`/clientes/${c.id}`} className="font-medium hover:text-lime">{c.full_name}</Link><div className="text-xs text-ink-500">{c.email ?? 'sin email en el CRM'}</div></td>
                  <td className="text-ink-300">{STATUS[c.status] ?? c.status}{p?.data_issues?.length ? <span className="ml-2 pill bg-sig-yellow/10 text-sig-yellow">datos</span> : null}</td>
                  <td className="num text-ink-300">{fmtES(p?.start_date)}</td>
                  <td className="w-40"><Progress value={prog} /><div className="num mt-1 text-[11px] text-ink-500">{p?.days_elapsed != null ? `día ${p.days_elapsed}` : '—'}</div></td>
                  <td><DaysLeft days={c.status === 'finished' ? null : p?.days_remaining} /></td>
                  <td className="num text-ink-300">{fmtES(p?.effective_end_date)}</td>
                  <td className="num text-ink-300">{c.lastCheckin ? fmtES(c.lastCheckin.submitted_at.slice(0, 10)) : '—'}</td>
                  <td><LevelBadge level={c.lastAnalysis?.level} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
