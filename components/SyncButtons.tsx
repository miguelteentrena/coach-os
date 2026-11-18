'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const ACTIONS = [
  ['crm', 'Sincronizar CRM ahora', 'crmPull'],
  ['jotform_backfill', 'Importar histórico de Jotform', 'jotformApi'],
  ['fathom', 'Sincronizar llamadas de Fathom', 'fathomApi'],
  ['fathom_all', 'Importar todas las llamadas del CRM', 'fathomApi'],
  ['refresh', 'Recalcular advertencias y logros', 'supabase'],
] as const;

export default function SyncButtons({ enabled }: { enabled: Record<string, boolean> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<string>('');
  const router = useRouter();
  async function run(action: string) {
    setBusy(action); setOut('');
    const r = await fetch('/api/admin/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    setOut(JSON.stringify(await r.json(), null, 2)); setBusy(null); router.refresh();
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map(([a, l, req]) => <button key={a} className="btn" disabled={!enabled[req] || !!busy} onClick={() => run(a)} title={enabled[req] ? '' : 'Integración no configurada'}>{busy === a ? 'Ejecutando…' : l}</button>)}
      </div>
      {out && <pre className="mt-3 max-h-60 overflow-auto rounded-xl bg-ink-950 p-3 text-xs text-ink-300">{out}</pre>}
    </div>
  );
}
