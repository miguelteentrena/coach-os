import type { CheckinRecord } from './analysis';
import { addDays, diffDays, fmtES, ISODate } from './dates';
import { CATEGORY_LABEL, Evidence, Severity } from './issues';
import { METRIC, zone } from './metrics';
import type { NumericField } from './jotform';

const SEV: Record<'alarm' | 'warn', Severity> = { alarm: 'red', warn: 'yellow' };
const worst = (a: Severity, b: Severity): Severity => (a === 'red' || b === 'red' ? 'red' : a === 'yellow' || b === 'yellow' ? 'yellow' : 'info');

/** Grupos de métricas → categoría de advertencia. Respeta la polaridad (cansancio/hambre/estrés altos = malo). */
const GROUPS: { category: string; metrics: NumericField[] }[] = [
  { category: 'training_adherence', metrics: ['sessions'] },
  { category: 'fatigue_recovery', metrics: ['fatigue', 'recovery'] },
  { category: 'hunger', metrics: ['hunger', 'satiety'] },
  { category: 'hydration', metrics: ['hydration'] },
  { category: 'nutrition_adherence', metrics: ['adherence'] },
  { category: 'sleep', metrics: ['sleep_hours', 'sleep_quality'] },
  { category: 'stress', metrics: ['stress'] },
  { category: 'motivation', metrics: ['motivation'] },
];

export const ATTENTION_WORDS = /\b(dolor|duele|molestia|lesi[oó]n|mare[oa]|ansiedad|atrac[oó]n|agobi|no puedo|dej(ar|o) el|abandon|baja|enferm)/i;
/** «¿Hay algo en lo que pueda mejorar?» → solo es petición si pide algo (no «Todo perfecto» ni metas propias). */
export const REQUEST_RE = /\?|\b(podr[ií]as|puedes|me gustar[ií]a que|quiero que|necesito|ayuda|enviar|mandar|explica|cambiar|ajustar|tips)\b|^m[aá]s\b/i;

export function checkinEvidence(clientId: string, c: CheckinRecord, prev: CheckinRecord | null, link?: string | null): Evidence[] {
  const on = c.submittedAt.slice(0, 10);
  const out: Evidence[] = [];
  const base = { clientId, observedOn: on, sourceType: 'jotform' as const, sourceRef: c.id, basis: 'dato del formulario', link: link ?? null };
  for (const g of GROUPS) {
    const parts: string[] = []; let sev: Severity | null = null; let anyValue = false;
    for (const k of g.metrics) {
      const v = c.values[k]; if (v == null) continue; anyValue = true;
      const z = zone(METRIC[k], v);
      if (z === 'alarm' || z === 'warn') { sev = worst(sev ?? 'info', SEV[z]); parts.push(`${METRIC[k].label} ${v}${METRIC[k].scale ? '/' + METRIC[k].scale![1] : ''}`); }
    }
    if (!anyValue) continue;
    const scopeKey = `${clientId}:${g.category}`;
    if (sev) out.push({ ...base, key: `jotform:${c.id}:${g.category}:p`, scopeKey, category: g.category, title: CATEGORY_LABEL[g.category],
      polarity: 'problem', severity: sev, text: parts.join(' · ') });
    else out.push({ ...base, key: `jotform:${c.id}:${g.category}:i`, scopeKey, category: g.category, title: CATEGORY_LABEL[g.category],
      polarity: 'improvement', severity: 'info', text: `${g.metrics.map((k) => `${METRIC[k].label} ${c.values[k] ?? '—'}`).join(' · ')} (en rango)` });
  }
  // Peso: solo cambios bruscos (no se juzga la dirección sin objetivo registrado)
  const w = c.values.weight_kg, pw = prev?.values.weight_kg;
  if (w != null && pw != null) {
    const d = w - pw;
    const scopeKey = `${clientId}:weight_change`;
    if (Math.abs(d) >= Math.max(1.5, pw * 0.02))
      out.push({ ...base, key: `jotform:${c.id}:weight:p`, scopeKey, category: 'weight_change', title: CATEGORY_LABEL.weight_change, polarity: 'problem', severity: 'yellow', text: `${pw} → ${w} kg en una semana` });
    else out.push({ ...base, key: `jotform:${c.id}:weight:i`, scopeKey, category: 'weight_change', title: CATEGORY_LABEL.weight_change, polarity: 'improvement', severity: 'info', text: `Peso estable (${pw} → ${w} kg)` });
  }
  // Textos
  for (const [field, label] of [['exercise_comment', 'Ejercicios'], ['nutrition_comment', 'Nutrición'], ['improve', 'A mejorar'], ['coach_feedback', 'Petición al coach'], ['proud', 'Orgullo']] as const) {
    const t = c.texts[field]?.trim(); if (!t) continue;
    if (ATTENTION_WORDS.test(t))
      out.push({ ...base, key: `jotform:${c.id}:health:${field}`, scopeKey: `${clientId}:health_comment`, category: 'health_comment', title: CATEGORY_LABEL.health_comment,
        polarity: 'problem', severity: 'red', text: `Comentario en «${label}» para leer personalmente` });
  }
  const fb = c.texts.coach_feedback?.trim();
  if (fb && REQUEST_RE.test(fb))
    out.push({ ...base, key: `jotform:${c.id}:request`, scopeKey: `${clientId}:client_request`, category: 'client_request', title: CATEGORY_LABEL.client_request,
      polarity: 'problem', severity: 'yellow', text: `Pide: «${fb.length > 90 ? fb.slice(0, 87) + '…' : fb}»` });
  // La llegada de un check-in resuelve "sin check-in"
  out.push({ ...base, key: `jotform:${c.id}:no_checkin:i`, scopeKey: `${clientId}:no_checkin`, category: 'no_checkin', title: CATEGORY_LABEL.no_checkin,
    polarity: 'improvement', severity: 'info', text: `Check-in recibido el ${fmtES(on)}` });
  return out;
}

export interface InsightRow {
  id: string; client_id: string; call_id: string; kind: string; speaker: string; basis: string; text: string;
  issue_category: string | null; polarity: string; occurred_on: ISODate; link: string | null;
}
const BASIS_LABEL: Record<string, string> = { verbatim_quote: 'cita literal', fathom_summary: 'resumen de Fathom', ai_inference: 'inferencia IA' };

export function insightEvidence(i: InsightRow): Evidence | null {
  if (!i.issue_category || i.polarity === 'neutral' || !CATEGORY_LABEL[i.issue_category]) return null;
  const problem = i.polarity === 'problem';
  return {
    key: `fathom:${i.id}`, clientId: i.client_id, scopeKey: `${i.client_id}:${i.issue_category}`, category: i.issue_category,
    title: CATEGORY_LABEL[i.issue_category], polarity: problem ? 'problem' : 'improvement',
    severity: problem ? (i.issue_category === 'health_comment' ? 'red' : 'yellow') : 'info',
    observedOn: i.occurred_on, sourceType: 'fathom', sourceRef: i.call_id, basis: BASIS_LABEL[i.basis] ?? i.basis,
    text: i.text, link: i.link, canResolve: i.basis !== 'ai_inference' && i.speaker !== 'coach',
  };
}

/** Evidencias del sistema: check-in ausente, renovación y datos del CRM. */
export function systemEvidence(p: {
  clientId: string; today: ISODate; lastCheckinOn: ISODate | null; programStart: ISODate | null; lastCallOn: ISODate | null;
  program: { id: string; days_remaining: number | null; effective_end_date: ISODate | null; data_issues: string[]; crm_row_hash: string } | null;
  newerProgramId: string | null; status: string;
}): Evidence[] {
  const out: Evidence[] = [];
  const { clientId, today } = p;
  const ref = p.lastCheckinOn ?? p.programStart;
  if (p.status === 'active' && ref && diffDays(today, ref) >= 10) {
    const gap = diffDays(today, ref);
    const week = Math.floor(gap / 7);
    const recentCall = p.lastCallOn && diffDays(today, p.lastCallOn) <= 14;
    out.push({ key: `system:no_checkin:${clientId}:${ref}:${week}`, clientId, scopeKey: `${clientId}:no_checkin`, category: 'no_checkin',
      title: CATEGORY_LABEL.no_checkin, polarity: 'problem', severity: recentCall ? 'info' : gap >= 17 ? 'red' : 'yellow',
      observedOn: addDays(ref, week * 7), sourceType: 'system', sourceRef: `${ref}:${week}`, basis: 'sistema',
      text: `${gap} días sin formulario semanal${p.lastCheckinOn ? ` (último: ${fmtES(p.lastCheckinOn)})` : ' (ninguno desde el inicio)'}${recentCall ? ` · contacto por llamada el ${fmtES(p.lastCallOn!)}` : ''}` });
  }
  const pr = p.program;
  if (pr && p.status === 'active' && pr.days_remaining != null && pr.days_remaining <= 30) {
    const m = pr.days_remaining <= 0 ? 0 : pr.days_remaining <= 7 ? 7 : pr.days_remaining <= 15 ? 15 : 30;
    out.push({ key: `system:renewal:${pr.id}:${m}`, clientId, programId: pr.id, scopeKey: `${clientId}:renewal:${pr.id}`, category: 'renewal',
      title: CATEGORY_LABEL.renewal, polarity: 'problem', severity: m <= 7 ? 'red' : 'yellow', observedOn: pr.effective_end_date ? addDays(pr.effective_end_date, -m) : today,
      sourceType: 'system', sourceRef: `${pr.id}:${m}`, basis: 'sistema',
      text: m === 0 ? `El programa terminó el ${fmtES(pr.effective_end_date)}` : `Aviso ${m} días: termina el ${fmtES(pr.effective_end_date)}` });
  }
  if (pr && p.newerProgramId)
    out.push({ key: `crm:newprogram:${p.newerProgramId}`, clientId, programId: pr.id, scopeKey: `${clientId}:renewal:${pr.id}`, category: 'renewal',
      title: CATEGORY_LABEL.renewal, polarity: 'improvement', severity: 'info', observedOn: today, sourceType: 'crm', sourceRef: p.newerProgramId, basis: 'CRM', text: 'Nuevo programa registrado en el CRM' });
  if (pr && (p.status === 'active' || p.status === 'upcoming')) {
    const sk = `${clientId}:crm_data:${pr.id}`;
    if (pr.data_issues?.length)
      out.push({ key: `crm:data:${pr.id}:${pr.crm_row_hash}`, clientId, programId: pr.id, scopeKey: sk, category: 'crm_data', title: CATEGORY_LABEL.crm_data,
        polarity: 'problem', severity: 'info', observedOn: today, sourceType: 'crm', sourceRef: pr.crm_row_hash, basis: 'CRM', text: pr.data_issues.join(' · ') });
    else out.push({ key: `crm:dataok:${pr.id}:${pr.crm_row_hash}`, clientId, programId: pr.id, scopeKey: sk, category: 'crm_data', title: CATEGORY_LABEL.crm_data,
      polarity: 'improvement', severity: 'info', observedOn: today, sourceType: 'crm', sourceRef: pr.crm_row_hash, basis: 'CRM', text: 'Datos del CRM corregidos' });
  }
  return out;
}
