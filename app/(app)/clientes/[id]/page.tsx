import Link from 'next/link';
import { notFound } from 'next/navigation';
import { addAdjustment } from '@/app/actions';
import { MetricChart } from '@/components/Charts';
import { DaysLeft, LevelBadge, NotConnected, PageHeader, Progress } from '@/components/ui';
import { dbReady, getAchievements, getCalls, getClient, getCommitments, getIssues } from '@/lib/data';
import IssueCard from '@/components/IssueCard';
import CommitmentItem from '@/components/CommitmentItem';
import CallCard from '@/components/CallCard';
import { todayISO } from '@/lib/dates';
import { sortIssues } from '@/lib/issues';
import { fmtES } from '@/lib/dates';
import { METRICS, METRIC } from '@/lib/metrics';

export default async function Ficha({ params }: { params: { id: string } }) {
  if (!dbReady()) return <NotConnected />;
  const [{ client, programs, checkins, analyses, adjustments }, issues, commitments, achievements, calls] = await Promise.all([
    getClient(params.id), getIssues({ clientId: params.id }), getCommitments({ clientId: params.id }), getAchievements({ clientId: params.id }), getCalls({ clientId: params.id }),
  ]);
  if (!client) notFound();
  const today = todayISO();
  const activeIssues = sortIssues(issues.filter((i: any) => ['new', 'pending', 'monitoring'].includes(i.status)) as any[], today);
  const closedIssues = issues.filter((i: any) => ['resolved', 'dismissed'].includes(i.status));
  const coachOpen = commitments.filter((c: any) => c.owner === 'coach' && c.status === 'open');
  const clientOpen = commitments.filter((c: any) => c.owner === 'client' && c.status === 'open');
  const timeline = [
    ...checkins.map((c: any) => ({ on: c.submitted_at.slice(0, 10), kind: 'Check-in', text: (byCheckinLevel(analyses, c.id)), href: null as string | null })),
    ...calls.map((c: any) => ({ on: String(c.recorded_at).slice(0, 10), kind: 'Llamada', text: c.insights.filter((i: any) => ['achievement', 'progress', 'problem'].includes(i.kind)).slice(0, 2).map((i: any) => i.text).join(' · ') || c.title, href: c.call_url })),
    ...achievements.map((a: any) => ({ on: a.first_mentioned_on, kind: 'Logro', text: a.title, href: null })),
    ...issues.flatMap((i: any) => i.events.filter((e: any) => e.to_status === 'resolved' || e.from_status === null).map((e: any) => ({ on: String(e.at).slice(0, 10), kind: e.to_status === 'resolved' ? 'Resuelta' : 'Advertencia', text: `${i.title}${e.to_status === 'resolved' && e.note ? ' — ' + e.note.slice(0, 120) : ''}`, href: null }))),
  ].sort((a, b) => b.on.localeCompare(a.on)).slice(0, 40);
  const p = programs[programs.length - 1];
  const byCheckin = new Map(analyses.map((a: any) => [a.checkin_id, a]));
  const lastCk = checkins[checkins.length - 1];
  const last = lastCk ? byCheckin.get(lastCk.id) : null;
  const series = checkins.map((c: any) => ({ label: fmtES(c.submitted_at.slice(0, 10)).slice(0, 5), ...c }));
  const prog = p?.days_elapsed != null && p?.days_remaining != null ? p.days_elapsed / Math.max(1, p.days_elapsed + p.days_remaining) : null;

  return (
    <>
      <Link href="/clientes" className="text-sm text-ink-400 hover:text-lime">← Clientes</Link>
      <PageHeader title={client.full_name} subtitle={[client.email ?? 'Sin email en el CRM', client.aliases?.length ? `Alias confirmados: ${client.aliases.join(', ')}` : null].filter(Boolean).join(' · ')}
        right={<LevelBadge level={last?.level} />} />

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="label">Programa actual</div>
          {p ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Info k="Inicio" v={fmtES(p.start_date)} />
                <Info k="Contratado" v={p.contracted_raw ?? '—'} />
                <Info k="Fin efectivo" v={fmtES(p.effective_end_date)} />
                <Info k="Restan" v={<DaysLeft days={p.days_remaining} />} />
              </div>
              <div className="mt-5"><Progress value={prog} /></div>
              <div className="num mt-2 flex justify-between text-xs text-ink-500"><span>día {p.days_elapsed}</span><span>{p.adjustment_days ? `ajustes ${p.adjustment_days > 0 ? '+' : ''}${p.adjustment_days} d` : 'sin pausas ni extensiones'}</span></div>
              {p.data_issues?.length > 0 && (
                <div className="mt-5 rounded-xl border border-sig-yellow/25 bg-sig-yellow/5 p-4 text-sm">
                  <div className="mb-1 font-medium text-sig-yellow">Revisar en el CRM (no se corrige automáticamente)</div>
                  <ul className="list-disc space-y-1 pl-5 text-ink-300">{p.data_issues.map((i: string) => <li key={i}>{i}</li>)}</ul>
                </div>
              )}
            </>
          ) : <p className="mt-3 text-sm text-ink-400">Sin programa en el CRM.</p>}
        </div>

        <div className="card p-5">
          <div className="label">Documentación</div>
          <ul className="mt-4 space-y-2 text-sm">
            {programs.slice().reverse().map((pr: any) => (
              <li key={pr.id} className="rounded-xl border border-ink-800 p-3">
                <div className="text-xs text-ink-500">Programa desde {fmtES(pr.start_date)} · fila {pr.crm_row}</div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {pr.report_url && <a className="btn" target="_blank" rel="noreferrer" href={pr.report_url}>Informe</a>}
                  {pr.onboarding_url && <a className="btn" target="_blank" rel="noreferrer" href={pr.onboarding_url}>Onboarding</a>}
                  {pr.call_urls?.map((u: string, i: number) => <a key={u + i} className="btn" target="_blank" rel="noreferrer" href={u}>Llamada {i + 1}</a>)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {last && (
        <section className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-2">
            <div className="label">Análisis del último check-in · {fmtES(last.reasons?.date ?? lastCk.submitted_at.slice(0, 10))}</div>
            <ul className="mt-4 space-y-2">
              {(last.reasons?.signals ?? []).map((s: any, i: number) => (
                <li key={i} className="flex gap-3 text-sm"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.severity === 'red' ? 'bg-sig-red' : 'bg-sig-yellow'}`} /><span>{s.text}{s.ref && <span className="text-ink-500"> · ref. {s.ref}</span>}</span></li>
              ))}
              {(last.positives ?? []).map((s: any, i: number) => (
                <li key={'p' + i} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lime" /><span>{s.metric === 'Orgullo' ? <>Orgullo: <em className="text-ink-300">“{s.text}”</em></> : s.text}</span></li>
              ))}
              {!last.needs_action && <li className="text-sm text-ink-400">Evolución positiva: check-in registrado sin generar tarea.</li>}
            </ul>
            {(last.reasons?.dataNotes ?? []).map((n: string) => <p key={n} className="mt-3 text-xs text-ink-500">{n}</p>)}
          </div>
          <div className="card overflow-hidden">
            <div className="card-h"><span>Comparativa</span></div>
            <table className="table w-full text-xs">
              <thead><tr><th>Métrica</th><th>Ahora</th><th>Ant.</th><th>4 sem</th><th>3 m</th></tr></thead>
              <tbody>
                {(last.reasons?.comparisons ?? []).map((c: any) => {
                  const d = c.deltaGoodPrev;
                  return (
                    <tr key={c.metric}>
                      <td className="!py-2 text-ink-300">{c.label}</td>
                      <td className={`num !py-2 ${d == null || d === 0 ? '' : d > 0 ? 'text-lime' : 'text-sig-red'}`}>{c.current ?? '—'}</td>
                      <td className="num !py-2 text-ink-400">{c.previous ?? '—'}</td>
                      <td className="num !py-2 text-ink-400">{c.avg4 ?? '—'}</td>
                      <td className="num !py-2 text-ink-400">{c.avg3m ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 py-3 text-[11px] text-ink-500">Verde = mejora según el sentido de cada métrica (p. ej. menos cansancio o estrés es mejor).</p>
          </div>
        </section>
      )}

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="card-h"><span>Advertencias activas · {activeIssues.length}</span><Link href={`/alertas?c=${client.id}`} className="normal-case tracking-normal text-ink-400 hover:text-lime">Ver todas →</Link></div>
          {activeIssues.length === 0 ? <div className="px-5 pb-5 text-sm text-ink-400">Ninguna con la información más reciente.</div> : activeIssues.map((i: any) => <IssueCard key={i.id} i={i} showClient={false} />)}
          {closedIssues.length > 0 && (
            <details className="border-t border-ink-800 px-5 py-3"><summary className="cursor-pointer text-xs text-ink-400">Resueltas y descartadas ({closedIssues.length})</summary>
              <div className="-mx-5 mt-2">{closedIssues.map((i: any) => <IssueCard key={i.id} i={i} showClient={false} />)}</div></details>
          )}
        </div>
        <div className="card">
          <div className="card-h"><span>Logros · {achievements.length}</span><Link href={`/logros?c=${client.id}`} className="normal-case tracking-normal text-ink-400 hover:text-lime">Ver →</Link></div>
          {achievements.length === 0 ? <div className="px-5 pb-5 text-sm text-ink-400">Sin logros registrados.</div> :
            <ul>{achievements.slice(0, 8).map((a: any) => (
              <li key={a.id} className="border-t border-ink-800 px-5 py-2.5 text-sm">
                <div>{a.title}</div>
                <div className="text-[11px] text-ink-500">{fmtES(a.first_mentioned_on)} · {[...new Set(a.mentions.map((m: any) => m.source_type === 'fathom' ? 'llamada' : 'Jotform'))].join(' + ')}</div>
              </li>))}</ul>}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="card-h"><span>Llamadas · {calls.length}</span></div>
          {calls.length === 0 ? <div className="px-5 pb-5 text-sm text-ink-400">Sin llamadas asociadas. Se asocian al pegar el enlace de Fathom en el CRM.</div> : calls.map((c: any) => <CallCard key={c.id} call={c} />)}
        </div>
        <div className="card">
          <div className="card-h"><span>Cronología</span></div>
          <ol className="relative ml-5 border-l border-ink-800 pb-4">
            {timeline.map((t, k) => (
              <li key={k} className="ml-4 py-2 text-sm">
                <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${t.kind === 'Logro' ? 'bg-lime' : t.kind === 'Llamada' ? 'bg-sky-400' : t.kind === 'Advertencia' ? 'bg-sig-yellow' : t.kind === 'Resuelta' ? 'bg-lime/50' : 'bg-ink-500'}`} />
                <div className="text-[11px] text-ink-500">{fmtES(t.on)} · {t.kind}</div>
                <div className="text-ink-200">{t.href ? <a href={t.href} target="_blank" rel="noreferrer" className="hover:text-lime">{t.text}</a> : t.text}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5"><div className="label mb-3">Adherencia y motivación</div><MetricChart data={series} domain={[0, 10]} series={[{ key: 'adherence', label: 'Seguimiento' }, { key: 'motivation', label: 'Motivación' }]} /></div>
        <div className="card p-5"><div className="label mb-3">Carga y recuperación</div><MetricChart data={series} domain={[0, 10]} series={[{ key: 'fatigue', label: 'Cansancio' }, { key: 'recovery', label: 'Recuperación' }, { key: 'stress', label: 'Estrés' }]} /></div>
        <div className="card p-5"><div className="label mb-3">Peso en ayunas</div><MetricChart data={series} unit=" kg" series={[{ key: 'weight_kg', label: 'Peso' }]} /><p className="mt-2 text-[11px] text-ink-500">{METRIC.weight_kg.note}</p></div>
        <div className="card p-5"><div className="label mb-3">Sesiones y sueño</div><MetricChart data={series} domain={[0, 10]} series={[{ key: 'sessions', label: 'Sesiones (0-5)' }, { key: 'sleep_quality', label: 'Calidad sueño' }, { key: 'sleep_hours', label: 'Horas sueño*' }]} /><p className="mt-2 text-[11px] text-ink-500">* {METRIC.sleep_hours.note}</p></div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="card-h"><span>Historial de check-ins ({checkins.length})</span></div>
          {checkins.length === 0 && <div className="px-5 pb-5 text-sm text-ink-400">Sin check-ins vinculados todavía.</div>}
          {checkins.slice().reverse().map((c: any) => {
            const a: any = byCheckin.get(c.id);
            return (
              <details key={c.id} className="border-t border-ink-800 px-5 py-3">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="num w-24 text-sm">{fmtES(c.submitted_at.slice(0, 10))}</span>
                  <span className="flex-1 truncate text-xs text-ink-400">{a?.reasons?.signals?.slice(0, 2).map((s: any) => s.text).join(' · ') || 'Sin incidencias'}</span>
                  <LevelBadge level={a?.level} />
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                  {METRICS.map((m) => <div key={m.key} className="flex justify-between"><span className="text-ink-500">{m.label}</span><span className="num">{c[m.key] ?? '—'}</span></div>)}
                </div>
                <dl className="mt-3 space-y-2 text-sm">
                  {[['proud', '¿De qué estás más orgulloso?'], ['improve', '¿Qué puedes mejorar?'], ['exercise_comment', 'Ejercicios'], ['nutrition_comment', 'Nutrición'], ['coach_feedback', '¿Algo que pueda mejorar yo?']].map(([k, l]) => c[k] ? <div key={k}><dt className="text-xs text-ink-500">{l}</dt><dd className="text-ink-200">{c[k]}</dd></div> : null)}
                </dl>
              </details>
            );
          })}
        </div>

        <div className="space-y-6">
          {p && (
            <form action={addAdjustment} className="card space-y-3 p-5">
              <div className="label">Pausa / extensión</div>
              <input type="hidden" name="program_id" value={p.id} />
              <select name="kind" className="input w-full"><option value="pause">Pausa</option><option value="extension">Extensión</option><option value="reduction">Reducción</option></select>
              <div className="flex gap-2"><input name="days" type="number" min={1} max={365} required placeholder="Días" className="input w-24" /><input name="starts_on" type="date" className="input flex-1" /></div>
              <input name="note" placeholder="Nota (opcional)" className="input w-full" />
              <button className="btn-primary w-full">Añadir ajuste</button>
              {adjustments.length > 0 && <ul className="space-y-1 pt-2 text-xs text-ink-400">{adjustments.map((a: any) => <li key={a.id}>{a.kind === 'pause' ? 'Pausa' : a.kind === 'extension' ? 'Extensión' : 'Reducción'} · {a.days} d {a.note ? `· ${a.note}` : ''}</li>)}</ul>}
            </form>
          )}
          <div className="card">
            <div className="card-h"><span>Tus compromisos ({coachOpen.length})</span></div>
            {coachOpen.length === 0 ? <div className="px-5 pb-4 text-sm text-ink-400">Nada pendiente.</div> : <ul>{coachOpen.map((c: any) => <CommitmentItem key={c.id} c={c} />)}</ul>}
          </div>
          <div className="card">
            <div className="card-h"><span>Compromisos del cliente ({clientOpen.length})</span></div>
            {clientOpen.length === 0 ? <div className="px-5 pb-4 text-sm text-ink-400">Nada pendiente.</div> : <ul>{clientOpen.slice(0, 8).map((c: any) => <CommitmentItem key={c.id} c={c} />)}</ul>}
          </div>
        </div>
      </section>
    </>
  );
}

function byCheckinLevel(analyses: any[], id: string) {
  const a = analyses.find((x: any) => x.checkin_id === id);
  const lv = a?.level === 'red' ? 'rojo' : a?.level === 'yellow' ? 'amarillo' : a?.level === 'green' ? 'verde' : '—';
  return `Formulario semanal (${lv})${a?.reasons?.signals?.[0] ? ' · ' + a.reasons.signals[0].text : ''}`;
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><div className="text-xs text-ink-500">{k}</div><div className="num mt-1 text-lg">{v}</div></div>;
}
