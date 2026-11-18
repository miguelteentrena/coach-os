import { headers } from 'next/headers';
import SyncButtons from '@/components/SyncButtons';
import { PageHeader } from '@/components/ui';
import { dbReady, getOps } from '@/lib/data';
import { integrationStatus } from '@/lib/supabase';

function State({ ok, label }: { ok: boolean; label?: string }) {
  return <span className={`pill ${ok ? 'bg-lime/12 text-lime ring-1 ring-lime/25' : 'bg-sig-yellow/10 text-sig-yellow ring-1 ring-sig-yellow/25'}`}>{label ?? (ok ? 'Configurado' : 'Pendiente')}</span>;
}

export default async function Configuracion() {
  const st = integrationStatus();
  const host = headers().get('host') ?? '<tu-app>';
  const base = `https://${host}`;
  const ops = dbReady() ? await getOps() : { runs: [], errors: [] };
  const rows: [string, string, boolean, string][] = [
    ['Base de datos y acceso', 'Supabase (Postgres + Auth + RLS), región UE', st.supabase, 'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'],
    ['CRM · envío automático', 'Apps Script en la hoja → webhook firmado (al editar + cada hora)', st.crmPush, `CRM_WEBHOOK_SECRET · URL: ${base}/api/webhooks/crm`],
    ['CRM · respaldo diario', 'Sheets API con cuenta de servicio de solo lectura', st.crmPull, 'GOOGLE_SERVICE_ACCOUNT_JSON, CRM_SPREADSHEET_ID'],
    ['Jotform · API', 'Histórico y reconciliación diaria (21 días)', st.jotformApi, 'JOTFORM_API_KEY, JOTFORM_API_BASE'],
    ['Jotform · webhook', 'Recepción inmediata de cada check-in', st.jotformWebhook, `JOTFORM_WEBHOOK_TOKEN · URL: ${base}/api/webhooks/jotform?token=…`],
    ['Fathom · API', 'Reconciliación diaria de llamadas (30 días) y asignación por enlaces del CRM', st.fathomApi, 'FATHOM_API_KEY (y FATHOM_API_KEY_2 para una segunda cuenta)'],
    ['Fathom · webhook', 'Recepción de cada llamada al terminar de procesarse (firma Standard Webhooks)', st.fathomWebhook, `FATHOM_WEBHOOK_SECRET · URL: ${base}/api/webhooks/fathom`],
    ['Extracción con IA (opcional)', 'Lee la transcripción y extrae problemas, logros y compromisos con cita literal verificada. Sin ella se guarda el resumen de Fathom.', st.aiExtraction, 'ANTHROPIC_API_KEY'],
    ['Tarea diaria', 'Vercel Cron 05:17 UTC: recalcula días, renovaciones y ausencias', st.cron, 'CRON_SECRET'],
  ];
  return (
    <>
      <PageHeader title="Configuración e integraciones" subtitle="Estado real de cada conexión. Lo que no está configurado se indica como pendiente." />
      <div className="card overflow-x-auto">
        <table className="table w-full min-w-[760px]">
          <thead><tr><th>Integración</th><th>Cómo funciona</th><th>Estado</th><th>Variables / endpoint</th></tr></thead>
          <tbody>{rows.map(([n, d, ok, v]) => <tr key={n}><td className="font-medium">{n}</td><td className="text-ink-300">{d}</td><td><State ok={ok} /></td><td className="font-mono text-[11px] text-ink-400">{v}</td></tr>)}</tbody>
        </table>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="label mb-3">Acciones manuales</div>
          <SyncButtons enabled={{ crmPull: st.supabase && st.crmPull, jotformApi: st.supabase && st.jotformApi, fathomApi: st.supabase && st.fathomApi, supabase: st.supabase }} />
        </div>
        <div className="card p-5 text-sm text-ink-300">
          <div className="label mb-3">Fuera del alcance de la app</div>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Harbiz y FatSecret: sin integración (no hay datos conectados). Se mantienen como herramientas propias.</li>
            <li>Fathom: no se guardan transcripciones completas, solo el resumen, citas breves y enlaces. Las llamadas que no son de clientes no se guardan con contenido.</li>
            <li>WhatsApp: no se envía nada automáticamente. Ningún cliente activo tiene teléfono en el CRM.</li>
            <li>Los análisis se calculan con reglas dentro de la app: los datos de salud no salen a servicios de IA externos.</li>
          </ul>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="card-h"><span>Últimas sincronizaciones</span></div>
          {ops.runs.length === 0 ? <div className="px-5 pb-5 text-sm text-ink-400">Ninguna todavía.</div> : ops.runs.map((r: any) => (
            <div key={r.id} className="flex items-center gap-3 border-t border-ink-800 px-5 py-2.5 text-xs">
              <span className={`h-2 w-2 rounded-full ${r.ok ? 'bg-lime' : r.ok === false ? 'bg-sig-red' : 'bg-ink-500'}`} />
              <span className="w-16 uppercase text-ink-400">{r.source}</span><span className="w-24 text-ink-400">{r.trigger}</span>
              <span className="num text-ink-300">{new Date(r.started_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</span>
              <span className="ml-auto truncate text-ink-500">{r.error ?? JSON.stringify(r.stats)}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-h"><span>Registro de errores</span></div>
          {ops.errors.length === 0 ? <div className="px-5 pb-5 text-sm text-ink-400">Sin errores.</div> : ops.errors.map((e: any) => (
            <div key={e.id} className="border-t border-ink-800 px-5 py-2.5 text-xs"><span className="text-sig-red">{e.scope}</span> · <span className="text-ink-300">{e.message}</span><div className="text-ink-500">{new Date(e.at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</div></div>
          ))}
        </div>
      </section>
    </>
  );
}
