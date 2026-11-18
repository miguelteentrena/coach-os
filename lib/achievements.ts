import { diffDays, ISODate } from './dates';
import { nameKey } from './normalize';

/** LOGROS: histórico acumulativo. Mismo logro en varias fuentes → un logro con varias menciones. */

export interface AchievementCandidate {
  clientId: string;
  sourceType: 'jotform' | 'fathom' | 'manual';
  sourceRef: string;            // id único de la mención
  mentionedOn: ISODate;
  achievedOn?: ISODate | null;  // si la fuente indica cuándo ocurrió
  title: string;
  context?: string | null;
  quote?: string | null;
  link?: string | null;
  basis?: string | null;
}
export interface AchievementLite { id: string; clientId: string; title: string; category: string; firstMentionedOn: ISODate; lastMentionedOn: ISODate }

const STOP = new Set(('a al algo algun alguna ante antes como con contra cual cuando de del desde donde durante e el ella ello en entre era es esa ese esta estaba este esto estoy fue ha han hasta hay he hice la las le les lo los mas me mi mis mucho muy no nos o para pero poco por porque que se ser si sin sobre su sus tambien te ten tiene todo tras tu un una uno unos y ya yo semana semanas dia dias hoy esta este estos estas logro logre consegui orgulloso orgullosa bien mejor').split(' '));

export function tokens(s: string): Set<string> {
  const t = nameKey(s).replace(/(\d)[.,](\d)/g, '$1p$2').split(' ').filter((w) => w.length > 2 && !STOP.has(w) || /\d/.test(w));
  return new Set(t.map((w) => w.replace(/s$/, '')));
}
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let i = 0; a.forEach((x) => { if (b.has(x)) i++; });
  return i / (a.size + b.size - i);
}

const CATS: [string, RegExp][] = [
  ['peso', /\b(kg|kilo|peso|bascula|baje|bajo|bajar|perd[ií])/i],
  ['medidas', /\b(cintura|cm|talla|pantal[oó]n|cintur[oó]n|ropa|vestido|bikini|desinflad|inflamaci)/i],
  ['fuerza', /\b(pesas?|press|prensa|sentadilla|plancha|repeticion|series|fallo|subi(mos)? (a|el peso)|kg por)/i],
  ['nutricion', /\b(comida|aliment|nutrici|dieta|prote[ií]na|calor|cumplea|celebraci|postre|comer)/i],
  ['actividad', /\b(pasos|camin|cardio|caminata|km)/i],
  ['habitos', /\b(rutina|constan|seguimiento|registr|h[aá]bito|todos los entrenamientos|entren[eé])/i],
  ['mentalidad', /\b(mentalidad|motivad|confianza|control|orgullo)/i],
];
export function categorize(text: string): string {
  for (const [c, re] of CATS) if (re.test(text)) return c;
  return 'otro';
}

/** Respuestas de «¿De qué estás más orgulloso?» que no describen un logro */
const NOT_ACHIEVEMENT = /^(nada|no s[eé]|nose|-|ninguno|ninguna|no)\.?$/i;
export function isAchievementText(t: string | null | undefined): t is string {
  const s = (t ?? '').trim();
  return s.length >= 8 && !NOT_ACHIEVEMENT.test(s);
}
export function cleanTitle(t: string): string {
  const s = t.replace(/\s+/g, ' ').trim().replace(/^(me (da|siento) orgullo(so|sa)? (de|ver)?|orgullos[oa] de( que)?|que)\s+/i, '');
  const first = s.charAt(0).toUpperCase() + s.slice(1);
  return first.length > 160 ? first.slice(0, 157) + '…' : first;
}

/** Busca un logro existente equivalente. Nunca fusiona entre clientes distintos. */
export function findDuplicate(c: AchievementCandidate, existing: AchievementLite[]): AchievementLite | null {
  const ct = tokens(c.title); const cat = categorize(c.title);
  let best: { a: AchievementLite; score: number } | null = null;
  for (const a of existing) {
    if (a.clientId !== c.clientId) continue;
    const near = Math.min(Math.abs(diffDays(c.mentionedOn, a.lastMentionedOn)), Math.abs(diffDays(c.mentionedOn, a.firstMentionedOn))) <= 21;
    if (!near) continue;
    if (cat !== 'otro' && a.category !== 'otro' && cat !== a.category) continue;
    const score = jaccard(ct, tokens(a.title));
    const sharedNumber = [...ct].some((w) => /\d/.test(w) && tokens(a.title).has(w));
    const ok = score >= 0.3 || (sharedNumber && score >= 0.15);
    if (ok && (!best || score > best.score)) best = { a, score };
  }
  return best?.a ?? null;
}
