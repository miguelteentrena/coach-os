import Link from 'next/link';
import { Empty, NotConnected, PageHeader } from '@/components/ui';
import { dbReady, getAchievements, getClients } from '@/lib/data';
import { diffDays, fmtES, todayISO } from '@/lib/dates';

const CAT: Record<string, { label: string; icon: string }> = {
  peso: { label: 'Peso', icon: '⚖️' }, medidas: { label: 'Medidas y ropa', icon: '📏' }, fuerza: { label: 'Fuerza', icon: '🏋️' },
  nutricion: { label: 'Nutrición', icon: '🥗' }, actividad: { label: 'Actividad', icon: '🚶' }, habitos: { label: 'Hábitos', icon: '🔁' },
  mentalidad: { label: 'Mentalidad', icon: '🧠' }, otro: { label: 'Otro', icon: '⭐' },
};
const SRC: Record<string, string> = { jotform: 'Jotform', fathom: 'Llamada', manual: 'Manual' };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export default async function Logros({ searchParams }: { searchParams: { c?: string; src?: string; desde?: string; hasta?: string; estado?: string } }) {
  const header = <PageHeader title="Logros" subtitle="Histórico acumulativo de los avances de tus clientes, de los formularios y de las llamadas." />;
  if (!dbReady()) return <>{header}<NotConnected /></>;
  const today = todayISO();
  const [all, clients] = await Promise.all([getAchievements(), getClients()]);
  let list = all;
  const isCurrent = (id: string) => ['active', 'upcoming'].includes(clients.find((c) => c.id === id)?.status ?? '');
  if (searchParams.estado === 'actuales') list = list.filter((a: any) => isCurrent(a.client_id));
  if (searchParams.estado === 'archivados') list = list.filter((a: any) => !isCurrent(a.client_id));
  if (searchParams.c) list = list.filter((a: any) => a.client_id === searchParams.c);
  if (searchParams.src) list = list.filter((a: any) => a.mentions.some((m: any) => m.source_type === searchParams.src));
  if (searchParams.desde) list = list.filter((a: any) => a.last_mentioned_on >= searchParams.desde!);
  if (searchParams.hasta) list = list.filter((a: any) => a.first_mentioned_on <= searchParams.hasta!);
  const recent = all.filter((a: any) => diffDays(today, a.last_mentioned_on) <= 14).length;
  const byMonth = new Map<string, any[]>();
  for (const a of list) { const k = a.last_mentioned_on.slice(0, 7); byMonth.set(k, [...(byMonth.get(k) ?? []), a]); }
  const withLogros = clients.filter((c) => all.some((a: any) => a.client_id === c.id));

  return (
    <>
      {header}
      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-5"><div className="label">Logros registrados</div><div className="num mt-2 text-3xl font-semibold text-lime">{all.length}</div></div>
        <div className="card p-5"><div className="label">Últimos 14 días</div><div className="num mt-2 text-3xl font-semibold">{recent}</div></div>
        <div className="card p-5"><div className="label">Clientes con logros</div><div className="num mt-2 text-3xl font-semibold">{withLogros.length}</div></div>
        <div className="card p-5"><div className="label">Mencionados en 2+ fuentes</div><div className="num mt-2 text-3xl font-semibold">{all.filter((a: any) => new Set(a.mentions.map((m: any) => m.source_type)).size > 1).length}</div></div>
      </section>
      <form className="mb-6 flex flex-wrap items-end gap-2" action="/logros">
        <select name="c" defaultValue={searchParams.c ?? ''} className="input"><option value="">Todos los clientes</option>{withLogros.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select>
        <select name="estado" defaultValue={searchParams.estado ?? ''} className="input"><option value="">Actuales y archivados</option><option value="actuales">Solo clientes actuales</option><option value="archivados">Solo clientes archivados</option></select>
<select name="src" defaultValue={searchParams.src ?? ''} className="input"><option value="">Todas las fuentes</option><option value="jotform">Jotform</option><option value="fathom">Llamadas (Fathom)</option></select>
        <label className="text-xs text-ink-400">Desde <input type="date" name="desde" defaultValue={searchParams.desde} className="input ml-1" /></label>
        <label className="text-xs text-ink-400">Hasta <input type="date" name="hasta" defaultValue={searchParams.hasta} className="input ml-1" /></label>
        <button className="btn-primary">Filtrar</button>
        {(searchParams.c || searchParams.estado || searchParams.src || searchParams.desde || searchParams.hasta) && <Link href="/logros" className="btn">Limpiar</Link>}
      </form>
      {!list.length ? <Empty title="Sin logros para este filtro" /> : (
        <div className="space-y-8">
          {[...byMonth.entries()].map(([month, items]) => (
            <section key={month}>
              <h2 className="label mb-3">{MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((a: any) => {
                  const isRecent = diffDays(today, a.last_mentioned_on) <= 14;
                  const cat = CAT[a.category] ?? CAT.otro;
                  return (
                    <article key={a.id} className={`card p-5 ${isRecent ? 'ring-1 ring-lime/40' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/clientes/${a.client_id}`} className="text-sm font-medium hover:text-lime">{a.clients?.full_name}</Link>
                        <div className="flex gap-1.5">{isRecent && <span className="pill bg-lime/15 text-lime">Reciente</span>}<span className="pill bg-ink-800 text-ink-300">{cat.icon} {cat.label}</span></div>
                      </div>
                      <p className="mt-3 text-[15px] leading-snug text-ink-100">{a.title}</p>
                      <div className="mt-3 text-[11px] text-ink-500">
                        {a.achieved_on && a.achieved_on !== a.first_mentioned_on ? <>Conseguido {fmtES(a.achieved_on)} · mencionado {fmtES(a.first_mentioned_on)}</> : <>Mencionado {fmtES(a.first_mentioned_on)}</>}
                        {a.last_mentioned_on !== a.first_mentioned_on && <> · última mención {fmtES(a.last_mentioned_on)}</>} · registrado {fmtES(String(a.created_at).slice(0, 10))}
                      </div>
                      <ul className="mt-3 space-y-1.5 border-t border-ink-800 pt-3">
                        {a.mentions.map((m: any) => (
                          <li key={m.id} className="text-xs text-ink-400">
                            <span className={`pill mr-1.5 ${m.source_type === 'fathom' ? 'bg-sky-400/10 text-sky-300' : 'bg-lime/10 text-lime'}`}>{SRC[m.source_type]}</span>
                            {fmtES(m.mentioned_on)} · {m.context}{m.basis && m.source_type === 'fathom' ? ` (${m.basis === 'fathom_summary' ? 'resumen de Fathom' : m.basis === 'verbatim_quote' ? 'cita literal' : 'interpretación IA'})` : ''}
                            {m.link && <> · <a href={m.link} target="_blank" rel="noreferrer" className="text-lime hover:underline">ver origen ↗</a></>}
                            {m.quote && m.source_type === 'jotform' && m.quote !== a.title && <div className="mt-0.5 italic text-ink-500">«{m.quote.length > 160 ? m.quote.slice(0, 157) + '…' : m.quote}»</div>}
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
