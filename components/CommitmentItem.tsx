'use client';
import { useTransition } from 'react';
import { setCommitment } from '@/app/actions';

export default function CommitmentItem({ c, showClient = false }: { c: any; showClient?: boolean }) {
  const [pending, start] = useTransition();
  const done = c.status !== 'open';
  return (
    <li className="flex items-start gap-3 border-t border-ink-800 px-5 py-2.5 text-sm">
      <input type="checkbox" className="mt-1 accent-[#c6f432]" checked={done} disabled={pending}
        onChange={() => start(() => setCommitment(c.id, done ? 'open' : 'done'))} />
      <div className="flex-1">
        <div className={done ? 'text-ink-500 line-through' : ''}>{showClient && <b className="font-medium text-ink-100">{c.clients?.full_name}: </b>}{c.text}</div>
        <div className="text-[11px] text-ink-500">
          {c.made_on.split('-').reverse().join('/')} · {c.source_type === 'fathom' ? 'llamada' : c.source_type}
          {c.source_link && <> · <a href={c.source_link} target="_blank" rel="noreferrer" className="text-lime hover:underline">ver</a></>}
          {c.done_note && <> · {c.done_note}</>}
        </div>
      </div>
    </li>
  );
}
