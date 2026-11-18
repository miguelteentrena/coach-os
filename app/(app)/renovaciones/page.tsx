import Link from 'next/link';
import { DaysLeft, Empty, LevelBadge, NotConnected, PageHeader, Progress } from '@/components/ui';
import { renewalMilestone } from '@/lib/alerts';
import { dbReady, getClients } from '@/lib/data';
import { fmtES } from '@/lib/dates';

export default async function Renovaciones() {
  const header = <PageHeader title="Renovaciones" subtitle="Avisos a 30, 15 y 7 días y en la fecha de fin, cruzados con la evolución del cliente" />;
  if (!dbReady()) return <>{header}<NotConnected /></>;
  const list = (await getClients()).filter((c) => c.status === 'active' && c.program?.days_remaining != null).sort((a, b) => a.program.days_remaining - b.program.days_remaining);
  if (!list.length) return <>{header}<Empty title="Sin programas activos" /></>;
  return (
    <>
      {header}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => {
          const p = c.program; const m = renewalMilestone(p.days_remaining);
          const review = c.lastAnalysis?.level === 'red' || !c.lastCheckin;
          return (
            <Link key={c.id} href={`/clientes/${c.id}`} className={`card block p-5 transition hover:border-ink-500 ${m != null && m <= 7 ? 'ring-1 ring-sig-red/40' : ''}`}>
              <div className="flex items-start justify-between"><div className="font-medium">{c.full_name}</div><LevelBadge level={c.lastAnalysis?.level} /></div>
              <div className="mt-4 flex items-end justify-between">
                <div><div className="text-xs text-ink-500">Termina</div><div className="num text-lg">{fmtES(p.effective_end_date)}</div></div>
                <div className="text-right"><div className="text-xs text-ink-500">Restan</div><div className="text-3xl font-semibold"><DaysLeft days={p.days_remaining} /></div></div>
              </div>
              <div className="mt-4"><Progress value={p.days_elapsed / Math.max(1, p.days_elapsed + p.days_remaining)} /></div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {[30, 15, 7, 0].map((d) => <span key={d} className={`pill ${p.days_remaining <= d ? 'bg-lime/15 text-lime' : 'bg-ink-800 text-ink-500'}`}>{d === 0 ? 'Fin' : `${d} d`}</span>)}
              </div>
              {m != null && <p className={`mt-3 text-xs ${review ? 'text-sig-yellow' : 'text-ink-300'}`}>{review ? 'Revisar evolución antes de proponer la renovación.' : 'Evolución estable: buen momento para hablar de renovación.'}</p>}
              {p.data_issues?.length > 0 && <p className="mt-2 text-xs text-sig-yellow">⚠ Fecha de fin con discrepancias en el CRM</p>}
            </Link>
          );
        })}
      </div>
    </>
  );
}
