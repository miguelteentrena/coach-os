import Link from 'next/link';
import { CalorieBars, MacroDonut } from '@/components/Charts';
import { Empty, NotConnected, PageHeader } from '@/components/ui';
import { dbReady, getClients, getFatsecretStatus, getNutrition } from '@/lib/data';
import { addDays, fmtES, todayISO } from '@/lib/dates';
import { summarize } from '@/lib/fatsecret';

type Vista = 'dia' | 'semana' | 'mes';
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monday = (iso: string) => addDays(iso, -((new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7));
const monthEnd = (iso: string) => addDays(addDays(iso.slice(0, 8) + '28', 4).slice(0, 8) + '01', -1);
const r0 = (n: number | null | undefined) => (n == null ? '—' : Math.round(Number(n)).toLocaleString('es-ES'));

export default async function Nutricion({ searchParams }: { searchParams: { c?: string; vista?: Vista; fecha?: string } }) {
  const header = <PageHeader title="Nutrición" subtitle="Diario de FatSecret de cada cliente: calorías y macros por día, semana y mes" />;
  if (!dbReady()) return <>{header}<NotConnected /></>;
  const [clients, status] = await Promise.all([getClients(), getFatsecretStatus()]);
  const connected = clients.filter((c) => status.some((s: any) => s.client_id === c.id));
  if (!connected.length) return <>{header}<Empty title="Ningún cliente ha conectado FatSecret todavía">Ve a la ficha de un cliente → «Generar enlace para el cliente» y envíaselo.</Empty></>;

  const sel = connected.find((c) => c.id === searchParams.c) ?? connected[0];
  const vista: Vista = (['dia', 'semana', 'mes'] as const).includes(searchParams.vista as Vista) ? (searchParams.vista as Vista) : 'semana';
  const today = todayISO();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha ?? '') ? searchParams.fecha! : today;
  const target: number | null = (sel as any).calorie_target ?? null;

  // Periodo seleccionado y el anterior (para comparar)
  let from: string, to: string, prevFrom: string, prevTo: string, title: string, step: number;
  if (vista === 'dia') { from = to = fecha; prevFrom = prevTo = addDays(fecha, -1); title = fmtES(fecha); step = 1; }
  else if (vista === 'semana') { from = monday(fecha); to = addDays(from, 6); prevFrom = addDays(from, -7); prevTo = addDays(from, -1); title = `Semana del ${fmtES(from)} al ${fmtES(to)}`; step = 7; }
  else { from = fecha.slice(0, 8) + '01'; to = monthEnd(fecha); prevTo = addDays(from, -1); prevFrom = prevTo.slice(0, 8) + '01'; title = `${MONTHS[+fecha.slice(5, 7) - 1]} ${fecha.slice(0, 4)}`; step = 0; }
  const nav = (dir: 1 | -1) => vista === 'mes' ? addDays(dir === 1 ? addDays(to, 1) : from, dir === 1 ? 0 : -1) : addDays(fecha, dir * step);

  const hist8From = addDays(monday(to), -7 * 7);
  const all = await getNutrition(sel.id, [prevFrom, hist8From].sort()[0], to);
  const inRange = (a: string, b: string) => all.filter((d: any) => d.day >= a && d.day <= b);
  const cur = inRange(from, to), prev = inRange(prevFrom, prevTo);
  const S = summarize(cur.map((d: any) => ({ day: d.day, calories: d.calories, protein: d.protein, carbs: d.carbs, fat: d.fat })));
  const P = summarize(prev.map((d: any) => ({ day: d.day, calories: d.calories, protein: d.protein, carbs: d.carbs, fat: d.fat })));
  const delta = (a: number | null, b: number | null, unit: string) => (a == null || b == null ? null : `${a - b >= 0 ? '+' : '−'}${Math.abs(a - b)} ${unit}`);

  // Datos de las barras
  const byDay = new Map(cur.map((d: any) => [d.day, d]));
  const bars: { label: string; kcal: number | null; avg?: boolean }[] = [];
  if (vista === 'semana') for (let i = 0; i < 7; i++) { const d = addDays(from, i); bars.push({ label: `${DOW[i]} ${d.slice(8)}`, kcal: (byDay.get(d) as any)?.calories ?? null }); }
  if (vista === 'mes') for (let d = from; d <= to; d = addDays(d, 1)) bars.push({ label: d.slice(8), kcal: (byDay.get(d) as any)?.calories ?? null });
  const weekly: { label: string; kcal: number | null; avg: boolean }[] = [];
  const weekRows: { from: string; s: ReturnType<typeof summarize> }[] = [];
  for (let w = 0; w < 8; w++) {
    const a = addDays(hist8From, w * 7), b = addDays(a, 6);
    const s = summarize(inRange(a, b).map((d: any) => ({ day: d.day, calories: d.calories, protein: d.protein, carbs: d.carbs, fat: d.fat })));
    weekRows.push({ from: a, s });
    weekly.push({ label: fmtES(a).slice(0, 5), kcal: s.calories, avg: true });
  }
  const day: any = vista === 'dia' ? byDay.get(fecha) : null;
  const meals: any[] = day?.meals ?? [];
  const mealGroups = ['Desayuno', 'Comida', 'Cena', 'Otros'].map((m) => ({ m, items: meals.filter((x) => x.meal === m) })).filter((g) => g.items.length);
  const q = (p: Record<string, string>) => `/nutricion?${new URLSearchParams({ c: sel.id, vista, fecha, ...p })}`;
  const st: any = status.find((s: any) => s.client_id === sel.id);

  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap gap-2">
        {connected.map((c) => <Link key={c.id} href={`/nutricion?c=${c.id}&vista=${vista}`} className={c.id === sel.id ? 'btn-primary' : 'btn'}>{c.full_name}</Link>)}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-ink-800 p-1">
          {(['dia', 'semana', 'mes'] as const).map((v) => <Link key={v} href={q({ vista: v })} className={`rounded-lg px-3 py-1.5 text-sm ${v === vista ? 'bg-lime text-ink-950' : 'text-ink-300 hover:text-ink-100'}`}>{v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}</Link>)}
        </div>
        <Link href={q({ fecha: nav(-1) })} className="btn">←</Link>
        <span className="min-w-[200px] text-center text-sm font-medium capitalize">{title}</span>
        <Link href={q({ fecha: nav(1) })} className="btn">→</Link>
        <Link href={q({ fecha: today })} className="btn">Hoy</Link>
        <span className="ml-auto text-[11px] text-ink-500">Última lectura de FatSecret: {st?.last_sync_at ? new Date(st.last_sync_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : '—'}{target ? ` · Objetivo ${target} kcal` : ' · Sin objetivo calórico (ponlo en su ficha)'}</span>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label={vista === 'dia' ? 'Calorías' : 'Media de calorías'} value={`${r0(S.calories)} kcal`} hint={delta(S.calories, P.calories, 'kcal') ? `${delta(S.calories, P.calories, 'kcal')} vs ${vista === 'dia' ? 'ayer' : vista === 'semana' ? 'semana anterior' : 'mes anterior'}` : undefined} accent />
        <Kpi label="Proteína" value={`${r0(S.protein)} g`} hint={S.pctProtein != null ? `${S.pctProtein} % de las kcal` : undefined} />
        <Kpi label="Carbohidratos" value={`${r0(S.carbs)} g`} hint={S.pctCarbs != null ? `${S.pctCarbs} % de las kcal` : undefined} />
        <Kpi label="Grasa" value={`${r0(S.fat)} g`} hint={S.pctFat != null ? `${S.pctFat} % de las kcal` : undefined} />
        <Kpi label="Días registrados" value={vista === 'dia' ? (S.loggedDays ? 'Sí' : 'No') : `${S.loggedDays} / ${vista === 'semana' ? 7 : bars.length}`} hint={target && S.calories ? `${S.calories <= target * 1.1 ? 'Dentro' : 'Por encima'} del objetivo` : undefined} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          {vista === 'dia' ? (
            <>
              <div className="label mb-3">Comidas del día</div>
              {!day ? <p className="text-sm text-ink-400">No registró comidas este día.</p> : !mealGroups.length ? <p className="text-sm text-ink-400">Total del día: {r0(day.calories)} kcal. El detalle por comida solo se guarda de los últimos 10 días.</p> : (
                <div className="space-y-4">
                  {mealGroups.map((g) => (
                    <div key={g.m}>
                      <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{g.m}</span><span className="num text-ink-400">{r0(g.items.reduce((s, x) => s + Number(x.calories ?? 0), 0))} kcal</span></div>
                      <ul className="space-y-1 text-xs text-ink-300">
                        {g.items.map((x, i) => <li key={i} className="flex justify-between gap-3 border-t border-ink-800 pt-1"><span>{x.name}</span><span className="num shrink-0 text-ink-500">{r0(x.calories)} kcal · P {r0(x.protein)} · C {r0(x.carbs)} · G {r0(x.fat)}</span></li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="label mb-3">Calorías por día</div>
              <CalorieBars data={bars} target={target} />
              <p className="mt-2 text-[11px] text-ink-500">Verde: dentro del objetivo · Naranja: más de un 10 % por encima · Hueco: día sin registrar (no cuenta como 0).</p>
            </>
          )}
        </div>
        <div className="card p-5">
          <div className="label mb-1">Reparto de macros</div>
          <div className="mb-2 text-[11px] text-ink-500">{vista === 'dia' ? 'Del día' : 'Media de los días registrados'}</div>
          <MacroDonut protein={S.protein} carbs={S.carbs} fat={S.fat} />
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5">
          <div className="label mb-3">Media semanal · últimas 8 semanas</div>
          <CalorieBars data={weekly} target={target} height={200} />
        </div>
        <div className="card overflow-x-auto lg:col-span-2">
          <div className="card-h"><span>Semana a semana</span></div>
          <table className="table w-full min-w-[560px] text-sm">
            <thead><tr><th>Semana</th><th>Días</th><th>Kcal media</th><th>Proteína</th><th>Carbos</th><th>Grasa</th><th>vs anterior</th></tr></thead>
            <tbody>
              {weekRows.slice().reverse().map((w, i, arr) => {
                const prevW = arr[i + 1]?.s;
                const d = prevW ? delta(w.s.calories, prevW.calories, 'kcal') : null;
                return (
                  <tr key={w.from}>
                    <td><Link href={`/nutricion?c=${sel.id}&vista=semana&fecha=${w.from}`} className="hover:text-lime">{fmtES(w.from)}</Link></td>
                    <td className="num">{w.s.loggedDays}/7</td>
                    <td className="num">{r0(w.s.calories)}</td>
                    <td className="num">{r0(w.s.protein)} g</td>
                    <td className="num">{r0(w.s.carbs)} g</td>
                    <td className="num">{r0(w.s.fat)} g</td>
                    <td className="num text-ink-400">{d ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={`num mt-2 text-2xl font-semibold ${accent ? 'text-lime' : ''}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-ink-500">{hint}</div>}
    </div>
  );
}
