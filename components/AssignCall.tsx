'use client';
import { useState, useTransition } from 'react';
import { assignCall } from '@/app/actions';

export default function AssignCall({ callId, clients }: { callId: string; clients: { id: string; full_name: string; status?: string }[] }) {
  const [v, setV] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <select className="input" value={v} onChange={(e) => setV(e.target.value)}>
        <option value="">Asignar a…</option>
        {[['Clientes actuales', clients.filter((c) => c.status === 'active' || c.status === 'upcoming')], ['Clientes archivados', clients.filter((c) => !(c.status === 'active' || c.status === 'upcoming'))]].map(([label, list]: any) => list.length ? (
<optgroup key={label} label={label}>{list.map((c: any) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</optgroup>) : null)}
      </select>
      <button className="btn-primary" disabled={!v || pending} onClick={() => start(() => assignCall(callId, v))}>{pending ? 'Procesando…' : 'Asignar'}</button>
    </div>
  );
}
