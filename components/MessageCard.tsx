'use client';
import { useState, useTransition } from 'react';
import { saveMessage, setMessageStatus } from '@/app/actions';

export default function MessageCard({ m }: { m: any }) {
  const [text, setText] = useState<string>(m.edited ?? m.draft);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const dirty = text !== (m.edited ?? m.draft);
  const phone = m.clients?.phone?.replace(/\D/g, '');
  const level = m.analyses?.level;
  return (
    <div className="card flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">{m.clients?.full_name}</div>
        <span className={`pill ${level === 'red' ? 'bg-sig-red/12 text-sig-red' : 'bg-sig-yellow/12 text-sig-yellow'}`}>{level === 'red' ? 'Prioritario' : 'Seguimiento'}</span>
      </div>
      <ul className="mb-3 space-y-1 text-xs text-ink-400">
        {(m.analyses?.reasons?.signals ?? []).filter((s: any) => s.severity !== 'positive').slice(0, 3).map((s: any, i: number) => <li key={i}>• {s.text}</li>)}
      </ul>
      {(m.context_notes ?? []).length > 0 && (
        <ul className="mb-3 space-y-1 rounded-xl border border-sky-400/20 bg-sky-400/5 p-3 text-xs text-sky-200">
          {(m.context_notes as string[]).map((n, i) => <li key={i}>ⓘ {n}</li>)}
        </ul>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} disabled={m.status !== 'draft'}
        className="input min-h-[180px] flex-1 resize-y rounded-2xl bg-[#0f1a10] leading-relaxed text-[#e5f5d8]" />
      <div className="mt-3 flex flex-wrap gap-2">
        {m.status === 'draft' ? (
          <>
            <button className="btn" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? '¡Copiado!' : 'Copiar'}</button>
            {phone && <a className="btn" target="_blank" rel="noreferrer" href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`}>Abrir en WhatsApp</a>}
            {dirty && <button className="btn" disabled={pending} onClick={() => start(() => saveMessage(m.id, text))}>Guardar cambios</button>}
            <button className="btn-primary ml-auto" disabled={pending} onClick={() => start(async () => { if (dirty) await saveMessage(m.id, text); await setMessageStatus(m.id, 'sent'); })}>Marcar como enviado</button>
            <button className="btn" disabled={pending} onClick={() => start(() => setMessageStatus(m.id, 'discarded'))}>Descartar</button>
          </>
        ) : (
          <div className="flex w-full items-center justify-between text-xs text-ink-400">
            <span>{m.status === 'sent' ? `Marcado como enviado · ${new Date(m.sent_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}` : 'Descartado'}</span>
            <button className="btn" onClick={() => start(() => setMessageStatus(m.id, 'draft'))}>Reabrir</button>
          </div>
        )}
      </div>
    </div>
  );
}
