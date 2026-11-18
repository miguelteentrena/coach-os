import type { NumericField } from './jotform';

export type Polarity = 'higher_better' | 'lower_better' | 'neutral';

export interface MetricDef {
  key: NumericField;
  label: string;
  section: 'Entrenamiento' | 'Nutrición' | 'Descanso';
  polarity: Polarity;
  scale: [number, number] | null;
  /** Umbrales sobre el valor "malo" (respetando la polaridad) */
  warn?: number;
  alarm?: number;
  note?: string;
}

// OJO polaridad: cansancio, hambre y estrés altos son MALOS. Recuperación baja es MALA.
export const METRICS: MetricDef[] = [
  { key: 'sessions', label: 'Sesiones completadas', section: 'Entrenamiento', polarity: 'higher_better', scale: [0, 5], warn: 3, alarm: 1 },
  { key: 'fatigue', label: 'Cansancio', section: 'Entrenamiento', polarity: 'lower_better', scale: [0, 10], warn: 7, alarm: 9 },
  { key: 'recovery', label: 'Recuperación', section: 'Entrenamiento', polarity: 'higher_better', scale: [0, 10], warn: 5, alarm: 3 },
  { key: 'weight_kg', label: 'Peso en ayunas', section: 'Nutrición', polarity: 'neutral', scale: null, note: 'Sin objetivo de peso registrado: se muestran cambios, no se juzgan.' },
  { key: 'hunger', label: 'Hambre', section: 'Nutrición', polarity: 'lower_better', scale: [0, 10], warn: 7, alarm: 9 },
  { key: 'satiety', label: 'Saciedad', section: 'Nutrición', polarity: 'higher_better', scale: [0, 10], warn: 4, alarm: 2 },
  { key: 'hydration', label: 'Hidratación', section: 'Nutrición', polarity: 'higher_better', scale: [0, 10], warn: 5, alarm: 3 },
  { key: 'adherence', label: 'Seguimiento del plan', section: 'Nutrición', polarity: 'higher_better', scale: [0, 10], warn: 6, alarm: 4 },
  { key: 'sleep_hours', label: 'Horas de sueño', section: 'Descanso', polarity: 'higher_better', scale: [0, 10], warn: 6, alarm: 5,
    note: 'Campo 0-10 en Jotform: pendiente confirmar si son horas reales o una puntuación.' },
  { key: 'sleep_quality', label: 'Calidad del sueño', section: 'Descanso', polarity: 'higher_better', scale: [0, 10], warn: 5, alarm: 3 },
  { key: 'stress', label: 'Estrés', section: 'Descanso', polarity: 'lower_better', scale: [0, 10], warn: 7, alarm: 9 },
  { key: 'motivation', label: 'Motivación', section: 'Descanso', polarity: 'higher_better', scale: [0, 10], warn: 5, alarm: 3 },
];
export const METRIC = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<NumericField, MetricDef>;

/** 'alarm' | 'warn' | 'ok' según polaridad */
export function zone(m: MetricDef, v: number | null | undefined): 'alarm' | 'warn' | 'ok' | 'na' {
  if (v == null || m.polarity === 'neutral' || m.warn == null || m.alarm == null) return 'na';
  if (m.polarity === 'higher_better') return v <= m.alarm ? 'alarm' : v <= m.warn ? 'warn' : 'ok';
  return v >= m.alarm ? 'alarm' : v >= m.warn ? 'warn' : 'ok';
}

/** Cambio con signo "bueno": positivo = mejora, negativo = empeora */
export function goodDelta(m: MetricDef, from: number, to: number): number {
  if (m.polarity === 'neutral') return 0;
  return m.polarity === 'higher_better' ? to - from : from - to;
}
