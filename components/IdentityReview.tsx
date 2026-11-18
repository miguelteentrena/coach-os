'use client';
import { useState, useTransition } from 'react';
import { resolveIdentity } from '@/app/actions';

export default function IdentityReview({ review, clients, submittedAt }: { review: any; clients: { id: string; full_name: string }[]; submittedAt?: string }) {
  const [clientId, setClientId] = useState<string>(review.candidates?.[0] ?? '');
  const [alias, setAlias] = useState(true);
  const [pending, start] = useTransition();
  const sorted = [...clients].sort((a, b) => Number(review.candidates?.includes(b.id)) - Number(review.candidates?.includes(a.id)));
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-ink-800 px-5 py-3 text-sm">
      <div className="min-w-[220px] flex-1">
        <div>Envío de <b>«{review.submitted_name ?? 'sin nombre'}»</b> {submittedAt && <span className="text-ink-500">· {submittedAt}</span>}</div>
        <div className="text-xs text-ink-500">{review.reason}</div>
      </div>
      <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
        <option value="">Elegir cliente…</option>
        {sorted.map((c) => <option key={c.id} value={c.id}>{review.candidates?.includes(c.id) ? '★ ' : ''}{c.full_name}</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs text-ink-400"><input type="checkbox" checked={alias} onChange={(e) => setAlias(e.target.checked)} /> Recordar como alias</label>
      <button className="btn-primary" disabled={!clientId || pending} onClick={() => start(() => resolveIdentity(review.id, clientId, alias))}>{pending ? 'Guardando…' : 'Confirmar identidad'}</button>
    </div>
  );
}
