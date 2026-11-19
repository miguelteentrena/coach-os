'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { createFatsecretInvite, disconnectFatsecret, setCalorieTarget } from '@/app/actions';

const f = (d?: string | null) => (d ? new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function FatsecretCard({ clientId, status, target, enabled }: { clientId: string; status: any | null; target: number | null; enabled: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center justify-between">
        <div className="label">Nutrición · FatSecret</div>
        <span className={`pill ${status ? 'bg-lime/12 text-lime ring-1 ring-lime/25' : 'bg-ink-800 text-ink-400'}`}>{status ? 'Conectado' : 'No conectado'}</span>
      </div>
      {status ? (
        <div className="space-y-1 text-xs text-ink-400">
          <div>Conectado el {f(status.connected_at)} · última lectura {f(status.last_sync_at)}</div>
          {status.last_error && <div className="text-sig-yellow">Último error: {status.last_error}</div>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href={`/nutricion?c=${clientId}`} className="btn-primary">Ver nutrición</Link>
            <button className="btn" disabled={pending} onClick={() => { if (confirm('¿Desconectar FatSecret? Los datos ya importados se conservan.')) start(() => disconnectFatsecret(clientId)); }}>Desconectar</button>
          </div>
        </div>
      ) : !enabled ? (
        <p className="text-xs text-ink-400">Falta configurar las claves de FatSecret en Vercel.</p>
      ) : (
        <div className="space-y-2 text-xs text-ink-400">
          <p>Genera un enlace y envíaselo al cliente. Lo abre, entra en su cuenta de FatSecret y pulsa «Autorizar». Sirve una sola vez y caduca en 14 días.</p>
          {!link ? <button className="btn" disabled={pending} onClick={() => start(async () => setLink(await createFatsecretInvite(clientId)))}>{pending ? 'Generando…' : 'Generar enlace para el cliente'}</button> : (
            <div className="flex gap-2">
              <input readOnly value={link} className="input flex-1 text-xs" onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? '¡Copiado!' : 'Copiar'}</button>
            </div>
          )}
        </div>
      )}
      <form action={(fd) => start(() => setCalorieTarget(clientId, fd))} className="flex items-center gap-2 border-t border-ink-800 pt-3">
        <label className="text-xs text-ink-400">Objetivo diario</label>
        <input name="calorie_target" type="number" min={800} max={6000} defaultValue={target ?? ''} placeholder="kcal" className="input w-24" />
        <button className="btn" disabled={pending}>Guardar</button>
      </form>
    </div>
  );
}
