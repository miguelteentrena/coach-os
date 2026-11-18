import { diffDays, ISODate } from './dates';

/** Motor de ADVERTENCIAS: un problema vivo por cliente y tema, con estados e historial.
 *  Reglas clave:
 *  - Dejar de mencionarse NO resuelve nada.
 *  - Resolución automática: 2 pruebas de mejora independientes POSTERIORES al último problema
 *    (o 1 si la categoría es "definitiva", p. ej. llegó el check-in que faltaba).
 *  - Una prueba con fecha ≤ fecha de resolución NUNCA reabre; una posterior sí, conservando historial. */

export type IssueStatus = 'new' | 'pending' | 'monitoring' | 'resolved' | 'dismissed';
export type Severity = 'red' | 'yellow' | 'info';
export type Trend = 'single' | 'repeated' | 'worsening' | 'improving';
export const ACTIVE: IssueStatus[] = ['new', 'pending', 'monitoring'];

export const CATEGORY_LABEL: Record<string, string> = {
  training_adherence: 'Adherencia al entrenamiento',
  nutrition_adherence: 'Adherencia nutricional',
  fatigue_recovery: 'Cansancio y recuperación',
  hunger: 'Hambre y saciedad',
  hydration: 'Hidratación',
  sleep: 'Descanso',
  stress: 'Estrés',
  motivation: 'Motivación',
  weight_change: 'Cambio brusco de peso',
  stagnation: 'Estancamiento',
  health_comment: 'Salud o dolor (leer personalmente)',
  client_request: 'Petición del cliente',
  no_checkin: 'Sin check-in de Jotform',
  renewal: 'Renovación',
  crm_data: 'Datos del CRM',
  availability: 'Disponibilidad y agenda',
  life_situation: 'Situación personal',
};
/** Categorías en las que una sola prueba de mejora basta (el hecho es objetivo). */
export const SINGLE_PROOF = new Set(['no_checkin', 'renewal', 'crm_data', 'client_request', 'weight_change']);
/** Categorías que nunca se resuelven solas (requieren al coach). */
export const MANUAL_ONLY = new Set(['health_comment']);

export interface Evidence {
  key: string;                // único global (idempotencia)
  scopeKey: string;           // client:category[:program]
  clientId: string;
  programId?: string | null;
  category: string;
  title: string;
  polarity: 'problem' | 'improvement';
  severity: Severity;
  observedOn: ISODate;
  sourceType: 'jotform' | 'fathom' | 'crm' | 'system' | 'manual';
  sourceRef: string;
  basis: string;              // 'dato del formulario' | 'cita literal' | 'resumen de Fathom' | 'inferencia IA' | 'sistema'
  text: string;
  link?: string | null;
  canResolve?: boolean;       // false para inferencias de IA
}

export interface IssueState {
  id?: string;
  clientId: string;
  programId?: string | null;
  scopeKey: string;
  category: string;
  title: string;
  status: IssueStatus;
  severity: Severity;
  trend: Trend;
  firstDetectedOn: ISODate;
  lastEvidenceOn: ISODate;
  lastProblemOn: ISODate;
  problemCount: number;
  reopenedCount: number;
  statusChangedOn: ISODate;
  resolvedOn?: ISODate | null;
  resolutionKind?: 'manual' | 'auto_evidence' | 'archived_initial' | 'legacy_done' | null;
  resolutionNote?: string | null;
  actionNote?: string | null;
  improvementRefs: { ref: string; on: ISODate }[]; // mejoras posteriores al último problema
}

export interface Transition { from: IssueStatus | null; to: IssueStatus; note: string }
export interface ApplyResult { state: IssueState | null; attached: boolean; created: boolean; transition?: Transition }

const SEV_RANK: Record<Severity, number> = { info: 0, yellow: 1, red: 2 };
const maxDate = (a: ISODate, b: ISODate) => (a > b ? a : b);
const fmt = (d: ISODate) => d.split('-').reverse().join('/');

export function applyEvidence(prev: IssueState | null, ev: Evidence): ApplyResult {
  if (ev.polarity === 'improvement') return applyImprovement(prev, ev);
  return applyProblem(prev, ev);
}

function applyProblem(prev: IssueState | null, ev: Evidence): ApplyResult {
  if (!prev) {
    const state: IssueState = {
      clientId: ev.clientId, programId: ev.programId ?? null, scopeKey: ev.scopeKey, category: ev.category, title: ev.title,
      status: 'new', severity: ev.severity, trend: 'single', firstDetectedOn: ev.observedOn, lastEvidenceOn: ev.observedOn,
      lastProblemOn: ev.observedOn, problemCount: 1, reopenedCount: 0, statusChangedOn: ev.observedOn, improvementRefs: [],
    };
    return { state, attached: true, created: true, transition: { from: null, to: 'new', note: `Detectada: ${ev.text} (${sourceLabel(ev)}, ${fmt(ev.observedOn)})` } };
  }
  const s: IssueState = { ...prev, improvementRefs: [...prev.improvementRefs] };
  s.lastEvidenceOn = maxDate(s.lastEvidenceOn, ev.observedOn);

  // Cerrada: solo una prueba POSTERIOR a la resolución la reabre
  if (s.status === 'resolved' || s.status === 'dismissed') {
    const ref = s.resolvedOn ?? s.statusChangedOn;
    if (ev.observedOn > ref) {
      const from = s.status;
      Object.assign(s, {
        status: 'new', reopenedCount: s.reopenedCount + 1, problemCount: s.problemCount + 1, lastProblemOn: ev.observedOn,
        severity: ev.severity, trend: 'repeated', statusChangedOn: ev.observedOn, improvementRefs: [], title: ev.title,
      });
      return { state: s, attached: true, created: false, transition: { from, to: 'new', note: `Reaparece el ${fmt(ev.observedOn)} (${sourceLabel(ev)}); estaba ${from === 'resolved' ? 'resuelta' : 'descartada'} desde el ${fmt(ref)}: ${ev.text}` } };
    }
    return { state: s, attached: true, created: false }; // prueba antigua: solo histórico
  }

  // Activa
  let transition: Transition | undefined;
  if (ev.observedOn > s.lastProblemOn) {
    const gap = diffDays(ev.observedOn, s.lastProblemOn);
    s.problemCount += 1;
    if (SEV_RANK[ev.severity] > SEV_RANK[s.severity]) { s.severity = ev.severity; s.trend = 'worsening'; }
    else if (gap <= 28) s.trend = 'repeated';
    s.lastProblemOn = ev.observedOn;
    s.title = ev.title;
    s.improvementRefs = s.improvementRefs.filter((i) => i.on > ev.observedOn);
    if (s.status === 'monitoring' && ev.observedOn > s.statusChangedOn) {
      transition = { from: 'monitoring', to: 'pending', note: `Vuelve a aparecer el ${fmt(ev.observedOn)} después de la actuación (${sourceLabel(ev)}): ${ev.text}` };
      s.status = 'pending'; s.statusChangedOn = ev.observedOn;
    }
  } else {
    s.problemCount += 1; // prueba tardía con fecha anterior: suma historial, no cambia tendencia
  }
  return { state: s, attached: true, created: false, transition };
}

function applyImprovement(prev: IssueState | null, ev: Evidence): ApplyResult {
  if (!prev || !ACTIVE.includes(prev.status)) return { state: prev, attached: false, created: false };
  if (ev.observedOn < prev.lastProblemOn) return { state: prev, attached: true, created: false }; // no cuenta: es anterior al último problema
  const s: IssueState = { ...prev, improvementRefs: [...prev.improvementRefs] };
  s.lastEvidenceOn = maxDate(s.lastEvidenceOn, ev.observedOn);
  if (ev.canResolve === false || MANUAL_ONLY.has(s.category)) {
    return { state: s, attached: true, created: false };
  }
  if (!s.improvementRefs.some((i) => i.ref === ev.sourceRef)) s.improvementRefs.push({ ref: ev.sourceRef, on: ev.observedOn });
  s.trend = 'improving';
  const needed = SINGLE_PROOF.has(s.category) ? 1 : 2;
  const from = s.status;
  if (s.improvementRefs.length >= needed) {
    Object.assign(s, { status: 'resolved', resolvedOn: ev.observedOn, resolutionKind: 'auto_evidence', statusChangedOn: ev.observedOn,
      resolutionNote: `Resuelta por evidencia: ${s.improvementRefs.length} prueba(s) de mejora posteriores al último problema (${fmt(s.lastProblemOn)}). Última: ${ev.text} (${sourceLabel(ev)}, ${fmt(ev.observedOn)})` });
    return { state: s, attached: true, created: false, transition: { from, to: 'resolved', note: s.resolutionNote! } };
  }
  if (from === 'new' || from === 'pending') {
    s.status = 'monitoring'; s.statusChangedOn = ev.observedOn;
    return { state: s, attached: true, created: false, transition: { from, to: 'monitoring', note: `Mejora detectada el ${fmt(ev.observedOn)} (${sourceLabel(ev)}): ${ev.text}. Falta otra prueba para darla por resuelta.` } };
  }
  return { state: s, attached: true, created: false };
}

function sourceLabel(ev: Evidence) {
  const src = ev.sourceType === 'jotform' ? 'Jotform' : ev.sourceType === 'fathom' ? 'llamada' : ev.sourceType === 'crm' ? 'CRM' : ev.sourceType === 'manual' ? 'manual' : 'sistema';
  return `${src} · ${ev.basis}`;
}

// ───────── Acciones manuales del coach ─────────
export type ManualAction = 'review' | 'act' | 'resolve' | 'dismiss' | 'reopen';
export function manualTransition(s: IssueState, action: ManualAction, today: ISODate, note?: string): { state: IssueState; transition: Transition } {
  const from = s.status;
  const n: IssueState = { ...s, statusChangedOn: today };
  switch (action) {
    case 'review': n.status = 'pending'; break;
    case 'act': n.status = 'monitoring'; n.actionNote = note ?? null; n.improvementRefs = []; break;
    case 'resolve': Object.assign(n, { status: 'resolved', resolvedOn: today, resolutionKind: 'manual', resolutionNote: note ?? null }); break;
    case 'dismiss': Object.assign(n, { status: 'dismissed', resolvedOn: today, resolutionKind: 'manual', resolutionNote: note ?? null }); break;
    case 'reopen': Object.assign(n, { status: 'pending', resolvedOn: null, resolutionKind: null }); break;
  }
  const label = { review: 'Revisada', act: 'Acción realizada', resolve: 'Resuelta manualmente', dismiss: 'Descartada', reopen: 'Reabierta manualmente' }[action];
  return { state: n, transition: { from, to: n.status, note: note ? `${label}: ${note}` : label } };
}

/** Puesta en marcha: problemas sin evidencia en las 2 semanas previas se archivan (no son "pendientes"). */
export function archiveIfStale(s: IssueState, cutoff: ISODate): Transition | null {
  if (s.status !== 'new' || s.lastProblemOn >= cutoff) return null;
  Object.assign(s, { status: 'resolved', resolvedOn: s.lastProblemOn, resolutionKind: 'archived_initial', statusChangedOn: s.lastProblemOn,
    resolutionNote: `Archivada al poner en marcha COACH OS: última evidencia del ${fmt(s.lastProblemOn)}, anterior al ${fmt(cutoff)}. Se reabrirá si aparece una prueba nueva.` });
  return { from: 'new', to: 'resolved', note: s.resolutionNote! };
}

// ───────── Orden de visualización ─────────
export interface Sortable { status: IssueStatus; severity: Severity; trend: Trend; lastEvidenceOn: ISODate; lastProblemOn: ISODate }
export function bucket(i: Sortable, today: ISODate): { n: 1 | 2 | 3 | 4 | 5; label: string } {
  if (i.status === 'resolved' || i.status === 'dismissed') return { n: 5, label: 'Histórico' };
  const recent = diffDays(today, i.lastProblemOn) <= 14;
  if (i.status === 'new' && recent && i.trend === 'single') return { n: 1, label: 'Nuevas y recientes' };
  if ((i.trend === 'repeated' || i.trend === 'worsening') && recent && i.status !== 'monitoring') return { n: 2, label: 'Se repiten o empeoran' };
  if (i.status === 'monitoring') return { n: 3, label: 'En seguimiento' };
  return { n: 4, label: 'Pendientes' };
}
export function sortIssues<T extends Sortable>(list: T[], today: ISODate): T[] {
  return [...list].sort((a, b) =>
    bucket(a, today).n - bucket(b, today).n ||
    SEV_RANK[b.severity] - SEV_RANK[a.severity] ||
    b.lastEvidenceOn.localeCompare(a.lastEvidenceOn));
}
