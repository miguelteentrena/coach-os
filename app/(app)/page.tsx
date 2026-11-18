import Link from 'next/link';
import { DaysLeft, Empty, LevelBadge, NotConnected, PageHeader, Progress, Stat } from '@/components/ui';
import { dbReady, getAchievements, getClients, getCommitments, getIssues, getOps } from '@/lib/data';
import { diffDays, fmtES, todayISO } from '@/lib/dates';
import { bucket, sortIssues } from '@/lib/issues';
import CommitmentItem from '@/components/CommitmentItem';
import { integrationStatus } from '@/lib/supabase';

export default async function Dashboard() {
  const today = todayISO();
  const header = <PageHeader title="Dashboard" subtitle={`Hoy, ${fmtES(today)} · días calculados en tiempo real desde las fechas del CRM`} />;
  if (!dbReady()) return <>{header}<IntegrationStrip /><div className="mt-6"><NotConnected /></div></>;

  const [clients, allIssues, ops, coachCommitments, achievements] = await Promise.all([getClients(), getIssues(), getOps(), getCommitments({ owner: 'coach', status: 'open' }), getAchievements()]);
  const active = clients.filter((c) => c.status === 'active' || c.status === 'upcoming');
  const alerts = sortIssues(allIssues.filter((i: any) => ['new', 'pending', 'monitoring'].includes(i.status)) as any[], today);
  const topIssue = (id: string) => alerts.find((i: any) => i.client_id === id);
  const levelOf = (id: string) => { const t: any = topIssue(id); if (!t) return 'green'; const b = bucket(t, today).n; return t.severity === 'red' && b <= 2 ? 'red' : 'yellow'; };
  const lvl = (l: string) => active.filter((c) => levelOf(c.id) === l).length;
  const renewals = active.filter((c) => c.program?.days_remaining != null && c.program.days_remaining <= 30).sort((a, b) => a.program.days_remaining - b.program.days_remaining);
  const priority = [...active].sort((a, b) => rank(topIssue(a.id), a, today) - rank(topIssue(b.id), b, today));
  const recentAch = achievements.filter((a: any) => diffDays(today, a.last_mentioned_on) <= 14);
  const lastRun = (s: string) => ops.runs.find((r: any) => r.source === s);

  return (
    <>
      {header}
      <IntegrationStrip crm={lastRun('crm')} jotform={lastRun('jotform')} />
      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Clientes activos" value={active.filter((c) => c.status === 'active').length} hint={`${active.filter((c) => c.status === 'upcoming').length} por empezar`} accent="lime" />
        <Stat label="Atención prioritaria" value={lvl('red')} hint="advertencia roja reciente" accent="red" />
        <Stat label="Seguimiento" value={lvl('yellow')} hint={`${lvl('green')} sin advertencias activas`} accent="yellow" />
        <Stat label="Logros · 14 días" value={recentAch.length} hint={`${renewals.length} renovaciones en ≤ 30 d`} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <div className="card-h"><span>Prioridad de la semana</span><Link href="/clientes" className="normal-case tracking-normal text-ink-400 hover:text-lime">Ver todos →</Link></div>
          {priority.length === 0 && <div className="px-5 pb-5 text-sm text-ink-400">Aún no hay clientes importados.</div>}
          {priority.map((c) => (
            <Link key={c.id} href={`/clientes/${c.id}`} className="row-link">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate font-medium">{c.full_name}</span>{c.status === 'upcoming' && <span className="pill bg-ink-800 text-ink-300">Empieza {fmtES(c.program?.start_date)}</span>}</div>
                <div className="mt-1 truncate text-xs text-ink-400">
                  {(() => { const t: any = topIssue(c.id); return t ? `${t.title}: ${t.evidence?.[0]?.text ?? ''}` : c.lastCheckin ? `Sin advertencias activas · check-in ${fmtES(c.lastCheckin.submitted_at.slice(0, 10))}` : 'Sin advertencias activas'; })()}
                </div>
              </div>
              <div className="hidden w-32 sm:block">
                <Progress value={c.program?.days_elapsed != null && c.program?.days_remaining != null ? c.program.days_elapsed / Math.max(1, c.program.days_elapsed + c.program.days_remaining) : null} />
              </div>
              <div className="w-16 text-right text-sm"><DaysLeft days={c.program?.days_remaining} /></div>
              <LevelBadge level={levelOf(c.id) as any} />
            </Link>
          ))}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="card">
            <div className="card-h"><span>Advertencias activas · {alerts.length}</span><Link href="/alertas" className="normal-case tracking-normal text-ink-400 hover:text-lime">Gestionar →</Link></div>
            {alerts.length === 0 ? <div className="px-5 pb-5 text-sm text-ink-400">Sin advertencias activas.</div> :
              alerts.slice(0, 6).map((a: any) => (
                <Link key={a.id} href="/alertas" className="flex gap-3 border-t border-ink-800 px-5 py-3 hover:bg-ink-850/70">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.severity === 'red' ? 'bg-sig-red' : a.severity === 'yellow' ? 'bg-sig-yellow' : 'bg-ink-500'}`} />
                  <div className="text-sm"><b className="font-medium">{a.clients?.full_name}</b> · {a.title}<div className="text-[11px] text-ink-500">{bucket(a, today).label} · última evidencia {fmtES(a.last_evidence_on)}</div></div>
                </Link>
              ))}
          </div>
          <div className="card">
            <div className="card-h"><span>Tus compromisos · {coachCommitments.length}</span></div>
            {coachCommitments.length === 0 ? <div className="px-5 pb-5 text-sm text-ink-400">Nada pendiente.</div> : <ul>{coachCommitments.slice(0, 6).map((c: any) => <CommitmentItem key={c.id} c={c} showClient />)}</ul>}
          </div>
          <div className="card">
            <div className="card-h"><span>Logros recientes</span><Link href="/logros" className="normal-case tracking-normal text-ink-400 hover:text-lime">Ver todos →</Link></div>
            {recentAch.length === 0 ? <div className="px-5 pb-5 text-sm text-ink-400">Ninguno en los últimos 14 días.</div> :
              recentAch.slice(0, 4).map((a: any) => <div key={a.id} className="border-t border-ink-800 px-5 py-2.5 text-sm"><b className="font-medium">{a.clients?.full_name}</b> · {a.title}</div>)}
          </div>
          <div className="card">
            <div className="card-h"><span>Próximas renovaciones</span><Link href="/renovaciones" className="normal-case tracking-normal text-ink-400 hover:text-lime">Ver →</Link></div>
            {renewals.length === 0 ? <div className="px-5 pb-5 text-sm text-ink-400">Ningún programa termina en 30 días.</div> :
              renewals.map((c) => (
                <div key={c.id} className="flex items-center justify-between border-t border-ink-800 px-5 py-3 text-sm">
                  <span>{c.full_name}</span><span className="text-ink-400">{fmtES(c.program.effective_end_date)} · <DaysLeft days={c.program.days_remaining} /></span>
                </div>
              ))}
          </div>
        </div>
      </section>
    </>
  );
}

function rank(top: any, c: any, today: string) {
  const base = top ? bucket(top, today).n * 100 + (top.severity === 'red' ? 0 : 50) : 900;
  return base + Math.min(49, Math.max(0, c.program?.days_remaining ?? 49));
}

function IntegrationStrip({ crm, jotform }: { crm?: any; jotform?: any }) {
  const st = integrationStatus();
  const items: [string, boolean, string][] = [
    ['Base de datos', st.supabase, st.supabase ? 'Conectada' : 'No configurada'],
    ['CRM (Google Sheets)', st.crmPush || st.crmPull, crm ? `${crm.ok ? 'OK' : 'Error'} · ${new Date(crm.started_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}` : st.crmPush || st.crmPull ? 'Sin sincronizaciones aún' : 'No configurado'],
    ['Jotform', st.jotformApi && st.jotformWebhook, jotform ? `${jotform.ok ? 'OK' : 'Error'} · ${new Date(jotform.started_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}` : st.jotformApi ? 'Sin sincronizaciones aún' : 'No configurado'],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(([k, ok, t]) => (
        <Link key={k} href="/configuracion" className="pill border border-ink-700 bg-ink-900 py-1 text-ink-300 hover:border-ink-500">
          <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-lime' : 'bg-sig-yellow'}`} />{k}<span className="text-ink-500">· {t}</span>
        </Link>
      ))}
    </div>
  );
}
