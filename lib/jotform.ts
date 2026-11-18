import { mondayOf } from './dates';
import { levenshtein, nameKey, normEmail } from './normalize';

export const JOTFORM_FORM_ID = '262472622960055'; // «Check-in semanal» (auditado 18/11/2026)

/** Etiquetas reales del formulario → campo interno. Se emparejan por texto normalizado, no por qid,
 *  porque los qid no se han podido leer desde el conector; la API los resuelve en tiempo de ejecución. */
export const FIELD_LABELS: Record<string, string> = {
  'nº de sesiones completadas/sem': 'sessions',
  'grado de cansancio al finalizar la semana': 'fatigue',
  'recuperación entre sesiones': 'recovery',
  'peso en ayunas (kg)': 'weight_kg',
  'hambre': 'hunger',
  'saciedad': 'satiety',
  'hidratación': 'hydration',
  'nivel de seguimiento del plan': 'adherence',
  'horas de sueño': 'sleep_hours',
  'calidad del sueño': 'sleep_quality',
  'nivel de estrés de la semana': 'stress',
  'motivación para la siguiente semana': 'motivation',
  '¿de qué estás más orgulloso esta semana?': 'proud',
  '¿qué crees que puedes mejorar?': 'improve',
  '¿hay algún ejercicio del que me quieras comentar algo?': 'exercise_comment',
  '¿hay algo de la nutrición que me quieras comentar?': 'nutrition_comment',
  '¿crees que hay algo en lo que pueda mejorar para la semana que viene?': 'coach_feedback',
  'nombre y apellido': 'name',
  'email': 'email',
  'correo electrónico': 'email',
};
const LABEL_INDEX = new Map(Object.entries(FIELD_LABELS).map(([k, v]) => [nameKey(k), v]));

export const NUMERIC_FIELDS = ['sessions', 'fatigue', 'recovery', 'weight_kg', 'hunger', 'satiety', 'hydration', 'adherence', 'sleep_hours', 'sleep_quality', 'stress', 'motivation'] as const;
export const TEXT_FIELDS = ['proud', 'improve', 'exercise_comment', 'nutrition_comment', 'coach_feedback'] as const;
export type NumericField = (typeof NUMERIC_FIELDS)[number];
export type TextField = (typeof TEXT_FIELDS)[number];

/** Forma de un envío en la API oficial: GET /submission/{id} o /form/{id}/submissions */
export interface JotformAnswer { name?: string; text?: string; type?: string; answer?: unknown; prettyFormat?: string }
export interface JotformSubmission { id: string; form_id: string; created_at: string; status?: string; answers: Record<string, JotformAnswer> }

export interface ParsedCheckin {
  submissionId: string;
  formId: string;
  submittedAt: string; // ISO con zona
  weekStart: string;
  name: string | null;
  email: string | null;
  values: Partial<Record<NumericField, number | null>>;
  texts: Partial<Record<TextField, string | null>>;
  unmappedLabels: string[];
  missingFields: string[];
}

function toNumber(a: unknown): number | null {
  if (a == null) return null;
  if (typeof a === 'number') return a;
  if (typeof a === 'string') {
    const m = a.replace(',', '.').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  return null;
}
function toText(a: JotformAnswer): string | null {
  if (a.prettyFormat) return a.prettyFormat.trim() || null;
  if (typeof a.answer === 'string') return a.answer.trim() || null;
  if (a.answer && typeof a.answer === 'object') return Object.values(a.answer as Record<string, string>).filter(Boolean).join(' ').trim() || null;
  return null;
}

/** created_at de Jotform viene en la zona horaria de la cuenta, sin offset. */
export function jotformDateToISO(createdAt: string, offset = process.env.JOTFORM_TZ_OFFSET ?? '+01:00'): string {
  return createdAt.replace(' ', 'T') + offset;
}

export function parseSubmission(s: JotformSubmission): ParsedCheckin {
  const values: ParsedCheckin['values'] = {};
  const texts: ParsedCheckin['texts'] = {};
  let name: string | null = null;
  let email: string | null = null;
  const unmapped: string[] = [];
  for (const a of Object.values(s.answers ?? {})) {
    if (!a.text || ['control_head', 'control_button', 'control_text', 'control_pagebreak'].includes(a.type ?? '')) continue;
    const field = LABEL_INDEX.get(nameKey(a.text));
    if (!field) { unmapped.push(a.text); continue; }
    if (field === 'name') name = toText(a);
    else if (field === 'email') email = normEmail(toText(a));
    else if ((NUMERIC_FIELDS as readonly string[]).includes(field)) values[field as NumericField] = toNumber(a.answer ?? a.prettyFormat);
    else texts[field as TextField] = toText(a);
  }
  const missing = NUMERIC_FIELDS.filter((f) => !(f in values));
  const submittedAt = jotformDateToISO(s.created_at);
  return {
    submissionId: s.id, formId: s.form_id, submittedAt, weekStart: mondayOf(submittedAt.slice(0, 10)),
    name, email, values, texts, unmappedLabels: unmapped, missingFields: missing,
  };
}

export interface ClientRef { id: string; email: string | null; full_name: string; aliases: string[] }
export type MatchResult =
  | { kind: 'matched'; clientId: string; by: 'email' | 'name' | 'alias' }
  | { kind: 'review'; candidates: string[]; reason: string };

/** Identifica al cliente. Nunca autocorrige: si no hay coincidencia exacta y única → revisión manual. */
export function matchClient(c: Pick<ParsedCheckin, 'email' | 'name'>, clients: ClientRef[]): MatchResult {
  if (c.email) {
    const hit = clients.find((x) => x.email === c.email);
    if (hit) return { kind: 'matched', clientId: hit.id, by: 'email' };
  }
  const k = nameKey(c.name);
  if (!k) return { kind: 'review', candidates: [], reason: 'Envío sin nombre' };
  const exact = clients.filter((x) => nameKey(x.full_name) === k);
  if (exact.length === 1) return { kind: 'matched', clientId: exact[0].id, by: 'name' };
  if (exact.length > 1) return { kind: 'review', candidates: exact.map((x) => x.id), reason: `Varios clientes se llaman «${c.name}»` };
  const alias = clients.filter((x) => x.aliases.some((a) => nameKey(a) === k));
  if (alias.length === 1) return { kind: 'matched', clientId: alias[0].id, by: 'alias' };
  const near = clients
    .map((x) => ({ x, d: levenshtein(nameKey(x.full_name), k) }))
    .filter(({ x, d }) => d <= 3 || nameKey(x.full_name).split(' ')[0] === k.split(' ')[0])
    .map(({ x }) => x.id);
  return { kind: 'review', candidates: near, reason: `«${c.name}» no coincide exactamente con ningún cliente del CRM` };
}
