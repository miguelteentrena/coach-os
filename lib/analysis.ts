import { diffDays } from './dates';
import type { NumericField, TextField } from './jotform';
import { goodDelta, METRICS, zone } from './metrics';
import { REQUEST_RE } from './evidence';

export interface CheckinRecord {
  id: string;
  submittedAt: string; // ISO
  values: Partial<Record<NumericField, number | null>>;
  texts: Partial<Record<TextField, string | null>>;
}

export interface Signal {
  severity: 'red' | 'yellow' | 'positive';
  metric: string;
  text: string;
  date: string;          // fecha del check-in que lo origina (YYYY-MM-DD)
  value?: number | null;
  ref?: string;          // comparación usada
}

export interface Comparison {
  metric: NumericField;
  label: string;
  current: number | null;
  previous: number | null;
  avg4: number | null;
  avg3m: number | null;
  deltaGoodPrev: number | null;
  deltaGoodAvg4: number | null;
}

export interface Analysis {
  checkinId: string;
  date: string;
  level: 'red' | 'yellow' | 'green';
  needsAction: boolean;
  signals: Signal[];
  positives: Signal[];
  comparisons: Comparison[];
  textsToReview: { field: TextField; text: string; why: string }[];
  dataNotes: string[];
}

const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

// Respuestas que no piden nada
const EMPTY_RE = /^(no|nop|nada|ninguno|ninguna|ok|perfecto|todo (bien|ok|perfecto|genial|correcto)|de momento no|por ahora no|-|n\/a|na)\b/i;
const isEmptyAnswer = (t: string) => {
  const s = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return s.length <= 40 && !s.includes('?') && EMPTY_RE.test(s);
};
// Palabras que merecen que el coach lo lea (NO es un diagnóstico)
const ATTENTION_WORDS = /\b(dolor|duele|molestia|lesi[oó]n|mare[oa]|ansiedad|atrac[oó]n|agobi|no puedo|dej(ar|o) el|abandon|baja|enferm)/i;

export function analyzeCheckin(current: CheckinRecord, historyDesc: CheckinRecord[]): Analysis {
  // historyDesc: check-ins anteriores del cliente, más reciente primero, SIN incluir current
  const date = current.submittedAt.slice(0, 10);
  const prev = historyDesc[0];
  const last4 = historyDesc.slice(0, 4);
  const last3m = historyDesc.filter((h) => diffDays(date, h.submittedAt.slice(0, 10)) <= 92);
  const has3m = last3m.length >= 6 && diffDays(date, last3m[last3m.length - 1].submittedAt.slice(0, 10)) >= 56;

  const signals: Signal[] = [];
  const positives: Signal[] = [];
  const comparisons: Comparison[] = [];
  const dataNotes: string[] = [];

  for (const m of METRICS) {
    const v = current.values[m.key] ?? null;
    const p = prev?.values[m.key] ?? null;
    const a4 = avg(last4.map((h) => h.values[m.key]));
    const a3 = has3m ? avg(last3m.map((h) => h.values[m.key])) : null;
    comparisons.push({
      metric: m.key, label: m.label, current: v, previous: p, avg4: a4, avg3m: a3,
      deltaGoodPrev: v != null && p != null ? goodDelta(m, p, v) : null,
      deltaGoodAvg4: v != null && a4 != null ? goodDelta(m, a4, v) : null,
    });
    if (v == null) continue;

    if (m.key === 'weight_kg') {
      if (p != null && Math.abs(v - p) >= Math.max(1.5, p * 0.02))
        signals.push({ severity: 'yellow', metric: m.label, value: v, date, ref: `semana anterior ${p} kg`,
          text: `Cambio de peso de ${(v - p > 0 ? '+' : '') + (v - p).toFixed(1)} kg en una semana (${p} → ${v} kg)` });
      continue;
    }

    const z = zone(m, v);
    const pz = zone(m, p);
    if (z === 'alarm')
      signals.push({ severity: 'red', metric: m.label, value: v, date, text: `${m.label} en ${v}${m.scale ? '/' + m.scale[1] : ''} (zona crítica)` });
    else if (z === 'warn') {
      const repeated = pz === 'warn' || pz === 'alarm';
      signals.push({ severity: 'yellow', metric: m.label, value: v, date,
        ref: repeated ? `semana anterior ${p}` : undefined,
        text: repeated ? `${m.label} en zona de aviso dos semanas seguidas (${p} → ${v})` : `${m.label} en ${v} (zona de aviso)` });
    }
    // Caída brusca respecto a la semana anterior o a la media de 4 semanas
    if (p != null && m.scale) {
      const d = goodDelta(m, p, v);
      if (d <= -3) signals.push({ severity: 'red', metric: m.label, value: v, date, ref: `semana anterior ${p}`, text: `${m.label} empeora ${Math.abs(d)} puntos respecto a la semana anterior (${p} → ${v})` });
      else if (d <= -2 && z !== 'ok') signals.push({ severity: 'yellow', metric: m.label, value: v, date, ref: `semana anterior ${p}`, text: `${m.label} empeora ${Math.abs(d)} puntos (${p} → ${v})` });
      else if (d >= 2 && z === 'ok') positives.push({ severity: 'positive', metric: m.label, value: v, date, ref: `semana anterior ${p}`, text: `${m.label} mejora ${d} puntos (${p} → ${v})` });
    }
    if (a4 != null && last4.length >= 3 && m.scale) {
      const d4 = goodDelta(m, a4, v);
      if (d4 <= -2.5 && !signals.some((s) => s.metric === m.label))
        signals.push({ severity: 'yellow', metric: m.label, value: v, date, ref: `media 4 semanas ${a4}`, text: `${m.label} por debajo de su media de 4 semanas (${a4} → ${v})` });
    }
  }

  // Tendencia sostenida de adherencia (3 semanas bajando)
  const adh = [current, ...historyDesc.slice(0, 2)].map((h) => h.values.adherence);
  if (adh.every((x) => typeof x === 'number') && (adh[0] as number) < (adh[1] as number) && (adh[1] as number) < (adh[2] as number))
    signals.push({ severity: 'yellow', metric: 'Seguimiento del plan', date, value: adh[0] as number,
      ref: 'últimas 3 semanas', text: `Seguimiento del plan baja 3 semanas seguidas (${[...adh].reverse().join(' → ')})` });

  // Combinación cansancio alto + recuperación baja
  const f = current.values.fatigue, r = current.values.recovery;
  if (f != null && r != null && f >= 7 && r <= 4)
    signals.push({ severity: 'red', metric: 'Cansancio/Recuperación', date, text: `Cansancio alto (${f}) con recuperación baja (${r}): revisar carga` });

  // Textos
  const textsToReview: Analysis['textsToReview'] = [];
  const labels: Record<TextField, string> = { proud: 'Orgullo', improve: 'A mejorar', exercise_comment: 'Ejercicios', nutrition_comment: 'Nutrición', coach_feedback: 'Petición al coach' };
  for (const k of Object.keys(labels) as TextField[]) {
    const t = current.texts[k]?.trim();
    if (!t || (isEmptyAnswer(t) && !ATTENTION_WORDS.test(t))) continue;
    if (ATTENTION_WORDS.test(t)) {
      textsToReview.push({ field: k, text: t, why: 'Menciona algo que conviene leer personalmente' });
      signals.push({ severity: 'red', metric: labels[k], date, text: `Comentario en «${labels[k]}» que conviene leer personalmente` });
    } else if ((k === 'coach_feedback' && REQUEST_RE.test(t)) || ((k === 'exercise_comment' || k === 'nutrition_comment') && /\?|duda|c[oó]mo|puedo|deber[ií]a|tips/i.test(t))) {
      textsToReview.push({ field: k, text: t, why: 'Pregunta o petición directa' });
      signals.push({ severity: 'yellow', metric: labels[k], date, text: `Hace una pregunta o petición en «${labels[k]}»` });
    }
    if (k === 'proud') positives.push({ severity: 'positive', metric: 'Orgullo', date, text: t.length > 120 ? t.slice(0, 117) + '…' : t });
  }

  if (current.values.sleep_hours != null) dataNotes.push('«Horas de sueño» es un campo 0-10: pendiente confirmar si son horas o puntuación.');
  if (!prev) dataNotes.push('Primer check-in del cliente: sin comparación semanal.');

  const reds = signals.filter((s) => s.severity === 'red').length;
  const yellows = signals.filter((s) => s.severity === 'yellow').length;
  const level: Analysis['level'] = reds > 0 || yellows >= 3 ? 'red' : yellows > 0 ? 'yellow' : 'green';
  return { checkinId: current.id, date, level, needsAction: level !== 'green', signals, positives, comparisons, textsToReview, dataNotes };
}
