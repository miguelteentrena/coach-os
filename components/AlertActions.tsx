'use client';
import { useTransition } from 'react';
import { setAlertStatus } from '@/app/actions';

export default function AlertActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button className="btn" disabled={pending} onClick={() => start(() => setAlertStatus(id, 'done'))}>Hecho</button>
      <button className="btn" disabled={pending} onClick={() => start(() => setAlertStatus(id, 'dismissed'))}>Descartar</button>
    </div>
  );
}
