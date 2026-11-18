import { addDays, addMonths, diffDays, ISODate, todayISO } from './dates';

export interface ParsedDuration {
  months: number | null;
  extraRaw: string | null; // lo que sigue a "+": NO se interpreta automáticamente
  issues: string[];
}

/** "6 meses" → 6; "3 meses + 1" → 3 + extra "1" (ambiguo, se marca). */
export function parseDuration(raw: string | null | undefined): ParsedDuration {
  const issues: string[] = [];
  if (!raw || !raw.trim()) return { months: null, extraRaw: null, issues: ['Sin «Tiempo contratado»'] };
  const [base, ...rest] = raw.split('+');
  const extraRaw = rest.length ? rest.join('+').trim() : null;
  let months: number | null = null;
  const m = base.trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*(mes|meses|semana|semanas|d[ií]a|d[ií]as)$/);
  if (m) {
    const n = parseFloat(m[1].replace(',', '.'));
    if (m[2].startsWith('mes')) months = n;
    else if (m[2].startsWith('semana')) months = (n * 7) / 30;
    else months = n / 30;
  } else issues.push(`Duración no reconocida: «${raw}»`);
  if (extraRaw) issues.push(`Duración con extra ambiguo: «${raw}» (el «+ ${extraRaw}» no se interpreta; manda la Fecha final del CRM)`);
  return { months, extraRaw, issues };
}

export interface Adjustment { kind: 'pause' | 'extension' | 'reduction'; days: number }

export interface ProgramInput {
  startDate: ISODate | null;
  contractedRaw: string | null;
  crmEndDate: ISODate | null;
  crmStatusText?: string | null;
  adjustments?: Adjustment[];
}

export interface ProgramStatus {
  months: number | null;
  computedEnd: ISODate | null;
  crmEndValid: ISODate | null;
  effectiveEnd: ISODate | null;
  daysElapsed: number | null;
  daysRemaining: number | null;
  totalDays: number | null;
  progress: number | null; // 0..1
  status: 'upcoming' | 'active' | 'finished' | 'unknown';
  issues: string[];
}

export function computeProgram(p: ProgramInput, today: ISODate = todayISO()): ProgramStatus {
  const d = parseDuration(p.contractedRaw);
  const issues = p.crmStatusText ? [] : [...d.issues];
  const computedEnd = p.startDate && d.months != null ? addMonths(p.startDate, d.months) : null;

  let crmEndValid = p.crmEndDate;
  if (p.crmEndDate && p.startDate && diffDays(p.crmEndDate, p.startDate) <= 0) {
    issues.push(`Fecha final del CRM (${p.crmEndDate}) no es posterior al inicio (${p.startDate}); se usa inicio + duración (${computedEnd ?? '—'})`);
    crmEndValid = null;
  } else if (p.crmEndDate && computedEnd) {
    const delta = diffDays(p.crmEndDate, computedEnd);
    if (Math.abs(delta) > 1)
      issues.push(`Fecha final del CRM (${p.crmEndDate}) difiere ${delta > 0 ? '+' : ''}${delta} días de inicio + duración (${computedEnd}). ¿Pausa, extensión o error?`);
  }
  if (!p.startDate) issues.push('Sin fecha de inicio');

  const adj = (p.adjustments ?? []).reduce((s, a) => s + (a.kind === 'reduction' ? -a.days : a.days), 0);
  const baseEnd = crmEndValid ?? computedEnd;
  const effectiveEnd = baseEnd ? addDays(baseEnd, adj) : null;

  const daysElapsed = p.startDate ? diffDays(today, p.startDate) : null;
  const daysRemaining = effectiveEnd ? diffDays(effectiveEnd, today) : null;
  const totalDays = p.startDate && effectiveEnd ? diffDays(effectiveEnd, p.startDate) : null;
  const progress = totalDays && daysElapsed != null ? Math.max(0, Math.min(1, daysElapsed / totalDays)) : null;

  let status: ProgramStatus['status'] = 'unknown';
  if (p.crmStatusText && /finaliz/i.test(p.crmStatusText)) status = 'finished';
  else if (daysElapsed != null && daysElapsed < 0) status = 'upcoming';
  else if (daysRemaining != null && daysRemaining < 0) status = 'finished';
  else if (daysElapsed != null) status = 'active';

  return { months: d.months, computedEnd, crmEndValid, effectiveEnd, daysElapsed, daysRemaining, totalDays, progress, status, issues };
}
