const KIND: Record<string, string> = {
  problem: 'Problema', goal: 'Objetivo', life_change: 'Situación personal', availability: 'Disponibilidad', adherence: 'Adherencia', doubt: 'Duda',
  client_commitment: 'Compromiso del cliente', coach_commitment: 'Tu compromiso', progress: 'Progreso', achievement: 'Logro', incident: 'Incidencia', health: 'Salud',
};
const SPEAKER: Record<string, string> = { client: 'Dicho por el cliente', coach: 'Dicho por Miguel', unknown: 'Hablante no identificado' };
const BASIS: Record<string, string> = { verbatim_quote: 'cita literal', fathom_summary: 'resumen de Fathom', ai_inference: 'interpretación IA' };
const ORDER = ['achievement', 'progress', 'problem', 'adherence', 'doubt', 'life_change', 'availability', 'incident', 'goal', 'client_commitment', 'coach_commitment', 'health'];

export default function CallCard({ call, showClient = false }: { call: any; showClient?: boolean }) {
  const ins = [...(call.insights ?? [])].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return (
    <details className="group border-t border-ink-800 px-5 py-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
        <span className="num w-24 text-sm">{String(call.recorded_at).slice(0, 10).split('-').reverse().join('/')}</span>
        {showClient && <span className="font-medium">{call.clients?.full_name ?? 'Sin asignar'}</span>}
        <span className="flex-1 truncate text-xs text-ink-400">{ins.filter((i) => i.kind === 'achievement' || i.kind === 'problem').slice(0, 2).map((i) => i.text).join(' · ') || call.title}</span>
        <span className="pill bg-ink-800 text-ink-400">{ins.length} datos</span>
        {call.call_url && <a href={call.call_url} target="_blank" rel="noreferrer" className="text-xs text-lime hover:underline">Fathom ↗</a>}
      </summary>
      <div className="mt-3 space-y-2">
        {ins.map((i) => (
          <div key={i.id} className={`rounded-xl border px-3 py-2 text-sm ${i.sensitive ? 'border-sig-yellow/25 bg-sig-yellow/5' : 'border-ink-800'}`}>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
              <span className="pill bg-ink-800 text-ink-300">{KIND[i.kind]}</span>
              <span>{SPEAKER[i.speaker]}</span>·<span>{BASIS[i.basis]}</span>
              {i.sensitive && <span className="text-sig-yellow">· dato sensible (no se usa en WhatsApp)</span>}
              {i.link && <a href={i.link} target="_blank" rel="noreferrer" className="ml-auto text-lime hover:underline">minuto exacto ↗</a>}
            </div>
            <div className="mt-1 text-ink-200">{i.text}</div>
            {i.quote && <div className="mt-1 text-xs italic text-ink-400">«{i.quote}»</div>}
          </div>
        ))}
        {call.extraction_status === 'not_configured' && <p className="text-xs text-ink-500">Llamada guardada con el resumen de Fathom. La extracción automática de datos requiere configurar la IA (ver Configuración).</p>}
        {call.summary_md && <details className="text-xs text-ink-400"><summary className="cursor-pointer">Resumen de Fathom</summary><pre className="mt-2 whitespace-pre-wrap font-sans">{call.summary_md.replace(/\]\([^)]+\)/g, ']').replace(/[\[\]]/g, '')}</pre></details>}
      </div>
    </details>
  );
}
