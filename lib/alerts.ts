import { diffDays, fmtES, ISODate } from './dates';
import type { Analysis } from './analysis';

export interface AlertDraft {
  kind: string;
  severity: 'red' | 'yellow' | 'info';
  title: string;
  detail: string;
  dedupeKey: string;
}

export const RENEWAL_MILESTONES = [30, 15, 7, 0] as const;

/** Hito de renovación vigente (el más cercano ya alcanzado). */
export function renewalMilestone(daysRemaining: number | null): (typeof RENEWAL_MILESTONES)[number] | null {
  if (daysRemaining == null || daysRemaining > 30) return null;
  if (daysRemaining <= 0) return 0;
  if (daysRemaining <= 7) return 7;
  if (daysRemaining <= 15) return 15;
  return 30;
}

export interface RenewalInput {
  clientId: string; clientName: string; programId: string; effectiveEnd: ISODate | null; daysRemaining: number | null;
  lastLevel: Analysis['level'] | null; redsLast4: number; checkinsLast4: number;
}

export function renewalAlert(r: RenewalInput): AlertDraft | null {
  const m = renewalMilestone(r.daysRemaining);
  if (m == null || !r.effectiveEnd) return null;
  const review = r.lastLevel === 'red' || r.redsLast4 >= 2 || r.checkinsLast4 < 2;
  const why = r.checkinsLast4 < 2 ? `solo ${r.checkinsLast4} check-in(s) en las últimas 4 semanas`
    : r.redsLast4 >= 2 ? `${r.redsLast4} semanas en rojo en el último mes`
    : r.lastLevel === 'red' ? 'último check-in en rojo' : 'evolución estable';
  return {
    kind: `renewal_${m}`,
    severity: m <= 7 || review ? 'red' : 'yellow',
    title: m === 0 ? `${r.clientName}: el programa termina hoy o ya ha terminado` : `${r.clientName}: quedan ${r.daysRemaining} días (aviso ${m} d)`,
    detail: `Fin: ${fmtES(r.effectiveEnd)}. ${review ? 'Revisar antes de proponer renovación: ' : 'Lista para conversación de renovación: '}${why}.`,
    dedupeKey: `renewal:${r.programId}:${m}`,
  };
}

export function missingCheckinAlert(clientId: string, name: string, lastCheckin: ISODate | null, programStart: ISODate | null, today: ISODate): AlertDraft | null {
  const ref = lastCheckin ?? programStart;
  if (!ref) return null;
  const gap = diffDays(today, ref);
  if (gap < 10) return null;
  return {
    kind: 'checkin_missing', severity: gap >= 17 ? 'red' : 'yellow',
    title: `${name}: ${gap} días sin check-in`,
    detail: lastCheckin ? `Último check-in: ${fmtES(lastCheckin)}` : `Sin check-ins desde el inicio (${fmtES(programStart)})`,
    dedupeKey: `missing:${clientId}:${ref}`,
  };
}

export function checkinAlert(clientId: string, name: string, a: Analysis): AlertDraft | null {
  if (!a.needsAction) return null; // verde: se registra sin generar tarea
  return {
    kind: `checkin_${a.level}`, severity: a.level === 'red' ? 'red' : 'yellow',
    title: `${name}: check-in del ${fmtES(a.date)} en ${a.level === 'red' ? 'rojo' : 'amarillo'}`,
    detail: a.signals.filter((s) => s.severity !== 'positive').map((s) => `• ${s.text}`).join('\n'),
    dedupeKey: `checkin:${a.checkinId}`,
  };
}
