'use client';
import { useState, useTransition } from 'react';
import { assignCall } from '@/app/actions';

export default function AssignCall({ callId, clients }: { callId: string; clients: { id: string; full_name: string }[] }) {
  const [v, setV] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <select className="input" value={v} onChange={(e) => setV(e.target.value)}>
        <option value="">Asignar a…</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
      </select>
      <button className="btn-primary" disabled={!v || pending} onClick={() => start(() => assignCall(callId, v))}>{pending ? 'Procesando…' : 'Asignar'}</button>
    </div>
  );
}
