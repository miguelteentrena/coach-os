import Link from 'next/link';
import { MetricChart } from '@/components/Charts';
import { Empty, NotConnected, PageHeader } from '@/components/ui';
import { dbReady, getClient, getClients, getMeasurements } from '@/lib/data';
import { fmtES } from '@/lib/dates';
import { METRICS } from '@/lib/metrics';

const MLABEL: Record<string, string> = {
  weight_kg: 'Peso', waist_cm: 'Cintura', hip_cm: 'Cadera', chest_cm: 'Pecho', arm_cm: 'Brazo (relajado)', arm_flexed_cm: 'Brazo (contraído)', bicep_cm: 'Bíceps', thigh_cm: 'Muslo',
};
const unit = (m: string) => (m === 'weight_kg' ? 'kg' : 'cm');
const num = (n: number) => String(Number(n)).replace('.', ',');

export default async function Evolucion({ searchParams }: { searchParams: { c?: string } }) {
  const header = <PageHeader title="Evolución" subtitle="Peso y medidas en orden cronológico (llamadas y Jotform) y métricas de los check-ins" />;
  if (!dbReady()) return <>{header}<NotConnected /></>;
  const [allClients, allMeas] = await Promise.all([getClients(), getMeasurements()]);
  const withData = new Set(allMeas.map((m: any) => m.client_id));
  const isCurrent = (s: string) => s === 'active' || s === 'upcoming';
  const clients = allClients.filter((c) => isCurrent(c.status) || c.lastCheckin || withData.has(c.id));
  const sel = searchParams.c ?? clients.find((c) => isCurrent(c.status) && (c.lastCheckin || withData.has(c.id)))?.id ?? clients[0]?.id;
  const data = sel ? await getClient(sel) : null;
  const meas = allMeas.filter((m: any) => m.client_id === sel);

  // Línea de tiempo: medidas de llamadas + peso de Jotform
  type Row = { on: string; metric: string; value: number | null; change: number | null; src: 'Llamada' | 'Jotform'; note?: string | null; link?: string | null };
  const rows: Row[] = [
    ...meas.map((m: any) => ({ on: m.measured_on, metric: m.metric, value: m.value, change: m.change, src: 'Llamada' as const, note: m.note, link: m.link })),
    ...(data?.checkins ?? []).filter((c: any) => c.weight_kg != null).map((c: any) => ({ on: c.submitted_at.slice(0, 10), metric: 'weight_kg', value: Number(c.weight_kg), change: null, src: 'Jotform' as const })),
  ].sort((a, b) => a.on.localeCompare(b.on));

  const chartFor = (metric: string) => rows.filter((r) => r.metric === metric && r.value != null)
    .map((r) => ({ label: fmtES(r.on).slice(0, 8), [r.src === 'Llamada' ? 'call' : 'form']: Number(r.value) }));
  const weight = chartFor('weight_kg');
  const waist = chartFor('waist_cm');
  const series = (data?.checkins ?? []).map((c: any) => ({ label: fmtES(c.submitted_at.slice(0, 10)).slice(0, 5), ...c }));
  const groups: [string, typeof clients][] = [['Clientes actuales', clients.filter((c) => isCurrent(c.status))], ['Clientes archivados', clients.filter((c) => !isCurrent(c.status))]];

  return (
    <>
      {header}
      {groups.map(([label, list]) => list.length ? (
        <div key={label} className="mb-4">
          <div className="label mb-2">{label}</div>
          <div className="flex flex-wrap gap-2">{list.map((c) => <Link key={c.id} href={`/evolucion?c=${c.id}`} className={c.id === sel ? 'btn-primary' : 'btn'}>{c.full_name}</Link>)}</div>
        </div>
      ) : null)}

      {!rows.length && !series.length ? <Empty title="Sin medidas ni check-ins para este cliente" /> : (
        <>
          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <div className="label mb-3">Peso</div>
              <MetricChart data={weight} unit=" kg" series={[{ key: 'call', label: 'Dicho en llamada' }, { key: 'form', label: 'Jotform' }]} />
            </div>
            <div className="card p-5">
              <div className="label mb-3">Cintura</div>
              <MetricChart data={waist} unit=" cm" series={[{ key: 'call', label: 'Dicho en llamada' }]} />
              {!waist.length && rows.some((r) => r.metric === 'waist_cm') && <p className="text-[11px] text-ink-500">Solo hay variaciones («−X cm»), sin medida absoluta: ver la cronología.</p>}
            </div>
          </section>

          <section className="card mt-6">
            <div className="card-h"><span>Cronología de medidas · {rows.length}</span></div>
            {!rows.length ? <div className="px-5 pb-5 text-sm text-ink-400">Sin medidas registradas.</div> : (
              <table className="table w-full text-sm">
                <thead><tr><th>Fecha</th><th>Medida</th><th>Valor</th><th>Fuente</th><th>Contexto</th></tr></thead>
                <tbody>
                  {rows.slice().reverse().map((r, i) => (
                    <tr key={i}>
                      <td className="num">{fmtES(r.on)}</td>
                      <td>{MLABEL[r.metric] ?? r.metric}</td>
                      <td className="num">{r.value != null ? `${num(r.value)} ${unit(r.metric)}` : `${r.change! > 0 ? '+' : '−'}${num(Math.abs(r.change!))} ${unit(r.metric)}`}</td>
                      <td>{r.link ? <a href={r.link} target="_blank" rel="noreferrer" className="text-lime hover:underline">{r.src} ↗</a> : r.src}</td>
                      <td className="text-xs text-ink-400">{r.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="px-5 py-3 text-[11px] text-ink-500">Las medidas de llamadas salen del resumen de Fathom: son lo que se comentó en la llamada, no una medición verificada.</p>
          </section>

          {series.length > 0 && (
            <>
              <h2 className="label mb-3 mt-8">Métricas del check-in semanal (Jotform)</h2>
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {METRICS.filter((m) => m.key !== 'weight_kg').map((m) => (
                  <div key={m.key} className="card p-5">
                    <div className="mb-1 flex items-baseline justify-between"><span className="label">{m.label}</span><span className="text-[11px] text-ink-500">{m.polarity === 'higher_better' ? '↑ mejor' : m.polarity === 'lower_better' ? '↓ mejor' : 'neutral'}</span></div>
                    <MetricChart data={series} height={170} domain={m.scale ? [m.scale[0], m.scale[1]] : undefined} series={[{ key: m.key, label: m.label }]} />
                    {m.note && <p className="mt-1 text-[11px] text-ink-500">{m.note}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
