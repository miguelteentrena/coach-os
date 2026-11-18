'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { issueAction } from '@/app/actions';

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: 'Nueva', cls: 'bg-sig-red/12 text-sig-red ring-1 ring-sig-red/25' },
  pending: { label: 'Pendiente', cls: 'bg-sig-yellow/12 text-sig-yellow ring-1 ring-sig-yellow/25' },
  monitoring: { label: 'En seguimiento', cls: 'bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/25' },
  resolved: { label: 'Resuelta', cls: 'bg-lime/12 text-lime ring-1 ring-lime/25' },
  dismissed: { label: 'Descartada', cls: 'bg-ink-800 text-ink-400 ring-1 ring-ink-700' },
};
const TREND: Record<string, string> = { repeated: '↻ se repite', worsening: '↑ empeora', improving: '↓ mejorando', single: '' };
const SRC: Record<string, string> = { jotform: 'Jotform', fathom: 'Llamada', crm: 'CRM', system: 'Sistema', manual: 'Manual' };
const RES: Record<string, string> = { manual: 'manual', auto_evidence: 'por evidencia', archived_initial: 'archivada al inicio', legacy_done: 'versión anterior' };
const f = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');

export default function IssueCard({ i, showClient = true }: { i: any; showClient?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | 'act' | 'resolve' | 'dismiss'>(null);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const st = STATUS[i.status];
  const closed = i.status === 'resolved' || i.status === 'dismissed';
  const sevDot = i.severity === 'red' ? 'bg-sig-red' : i.severity === 'yellow' ? 'bg-sig-yellow' : 'bg-ink-500';
  const last = i.evidence?.find((e: any) => e.polarity === 'problem') ?? i.evidence?.[0];
  const run = (action: any, n?: string) => start(async () => { await issueAction(i.id, action, n); setMode(null); setNote(''); });

  return (
    <div className={`border-t border-ink-800 px-5 py-4 ${closed ? 'opacity-75' : ''}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${sevDot}`} />
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {showClient && <Link href={`/clientes/${i.client_id}`} className="font-medium hover:text-lime">{i.clients?.full_name}</Link>}
            <span className={showClient ? 'text-ink-300' : 'font-medium'}>{i.title}</span>
            <span className={`pill ${st.cls}`}>{st.label}</span>
            {TREND[i.trend] && !closed && <span className="pill bg-ink-800 text-ink-300">{TREND[i.trend]}</span>}
            {i.reopened_count > 0 && <span className="pill bg-ink-800 text-ink-300">reabierta ×{i.reopened_count}</span>}
          </div>
          {last && <div className="mt-1 text-sm text-ink-300">{last.text} <span className="text-ink-500">· {SRC[last.source_type]} · {last.basis} · {f(last.observed_on)}</span></div>}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-ink-500">
            <span>Detectada {f(i.first_detected_on)}</span>
            <span>Última evidencia {f(i.last_evidence_on)}</span>
            <span>{i.problem_count} {i.problem_count === 1 ? 'aparición' : 'apariciones'}</span>
            {i.reviewed_at && <span>Revisada {f(i.reviewed_at)}</span>}
            {closed && <span>{i.status === 'resolved' ? 'Resuelta' : 'Descartada'} {f(i.resolved_on)}{i.resolution_kind ? ` (${RES[i.resolution_kind]})` : ''}</span>}
          </div>
          {i.action_note && !closed && <div className="mt-1 text-xs text-sky-300">Acción: {i.action_note}</div>}
          {i.resolution_note && closed && <div className="mt-1 text-xs text-ink-400">{i.resolution_note}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {i.status === 'new' && <button className="btn" disabled={pending} onClick={() => run('review')}>Revisada</button>}
          {!closed && <button className="btn" disabled={pending} onClick={() => setMode(mode === 'act' ? null : 'act')}>Acción hecha</button>}
          {!closed && <button className="btn" disabled={pending} onClick={() => setMode(mode === 'resolve' ? null : 'resolve')}>Resolver</button>}
          {!closed && <button className="btn" disabled={pending} onClick={() => setMode(mode === 'dismiss' ? null : 'dismiss')}>Descartar</button>}
          {closed && <button className="btn" disabled={pending} onClick={() => run('reopen')}>Reabrir</button>}
          <button className="btn" onClick={() => setOpen(!open)}>{open ? 'Ocultar' : 'Historial'}</button>
        </div>
      </div>
      {mode && (
        <div className="ml-6 mt-3 flex flex-wrap gap-2">
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} className="input min-w-[260px] flex-1"
            placeholder={mode === 'act' ? '¿Qué has hecho? (p. ej. le envié la tabla nueva)' : mode === 'resolve' ? '¿Cómo se resolvió?' : '¿Por qué no requiere actuación?'} />
          <button className="btn-primary" disabled={pending} onClick={() => run(mode, note)}>{mode === 'act' ? 'Pasar a seguimiento' : mode === 'resolve' ? 'Marcar resuelta' : 'Descartar'}</button>
        </div>
      )}
      {open && (
        <div className="ml-6 mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <div className="label mb-2">Evidencias ({i.evidence?.length ?? 0})</div>
            <ul className="space-y-1.5 text-xs">
              {(i.evidence ?? []).map((e: any) => (
                <li key={e.id} className="flex gap-2">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${e.polarity === 'problem' ? 'bg-sig-red' : 'bg-lime'}`} />
                  <span><span className="num text-ink-500">{f(e.observed_on)}</span> · {SRC[e.source_type]} · <span className="text-ink-500">{e.basis}</span> — {e.text}
                    {e.link && <> · <a className="text-lime hover:underline" href={e.link} target="_blank" rel="noreferrer">ver</a></>}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="label mb-2">Historial de estados</div>
            <ul className="space-y-1.5 text-xs text-ink-300">
              {(i.events ?? []).map((e: any) => (
                <li key={e.id}><span className="num text-ink-500">{f(e.at)}</span> · {e.actor === 'system' ? 'Sistema' : 'Miguel'} · {e.from_status ? `${STATUS[e.from_status]?.label} → ` : ''}{STATUS[e.to_status]?.label}{e.note ? ` — ${e.note}` : ''}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
