import { createHmac, randomBytes } from 'crypto';

// FatSecret Platform API — OAuth 1.0 (HMAC-SHA1). Docs: platform.fatsecret.com/docs/guides/authentication/oauth1/three-legged
export const FS_AUTH = 'https://authentication.fatsecret.com/oauth';
export const FS_API = 'https://platform.fatsecret.com/rest/server.api';

/** Codificación RFC 3986 que exige OAuth 1.0. */
export const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function signature(method: string, url: string, params: Record<string, string>, consumerSecret: string, tokenSecret = '') {
  const norm = Object.keys(params).map((k) => [enc(k), enc(params[k])]).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`).join('&');
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(norm)}`;
  return createHmac('sha1', `${enc(consumerSecret)}&${enc(tokenSecret)}`).update(base).digest('base64');
}

export function signedParams(method: string, url: string, extra: Record<string, string>, keys: { key: string; secret: string }, token?: { token: string; secret: string }) {
  const p: Record<string, string> = {
    ...extra,
    oauth_consumer_key: keys.key,
    oauth_nonce: randomBytes(12).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    ...(token ? { oauth_token: token.token } : {}),
  };
  p.oauth_signature = signature(method, url, p, keys.secret, token?.secret ?? '');
  return p;
}

/** Días desde 1970-01-01 (formato date_int de FatSecret) ⇄ ISO. */
export const toDateInt = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
export const fromDateInt = (n: number | string) => new Date(Number(n) * 86400000).toISOString().slice(0, 10);

const arr = <T,>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const n = (x: unknown) => (x == null || x === '' ? null : Number(x));

export interface DayTotals { day: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }
export function parseMonth(json: any): DayTotals[] {
  return arr(json?.month?.day).map((d: any) => ({ day: fromDateInt(d.date_int), calories: n(d.calories), protein: n(d.protein), carbs: n(d.carbohydrate), fat: n(d.fat) }));
}

const MEAL_ES: Record<string, string> = { breakfast: 'Desayuno', lunch: 'Comida', dinner: 'Cena', other: 'Otros' };
export interface Meal { meal: string; name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }
export function parseEntries(json: any): Meal[] {
  return arr(json?.food_entries?.food_entry).map((e: any) => ({
    meal: MEAL_ES[String(e.meal ?? '').toLowerCase()] ?? String(e.meal ?? 'Otros'),
    name: String(e.food_entry_name ?? e.food_entry_description ?? ''),
    calories: n(e.calories), protein: n(e.protein), carbs: n(e.carbohydrate), fat: n(e.fat),
  }));
}

export function parseWeights(json: any): { day: string; kg: number; comment: string | null }[] {
  return arr(json?.month?.day).filter((d: any) => d.weight_kg != null).map((d: any) => ({ day: fromDateInt(d.date_int), kg: Number(d.weight_kg), comment: d.weight_comment || null }));
}

/** Resumen de un periodo: medias sobre días registrados (los días sin registro no cuentan como 0). */
export function summarize(days: DayTotals[]) {
  const logged = days.filter((d) => d.calories != null && d.calories > 0);
  const avg = (k: keyof DayTotals) => (logged.length ? Math.round(logged.reduce((s, d) => s + Number(d[k] ?? 0), 0) / logged.length) : null);
  const p = avg('protein'), c = avg('carbs'), f = avg('fat');
  const kcalMacros = (p ?? 0) * 4 + (c ?? 0) * 4 + (f ?? 0) * 9;
  const pct = (g: number | null, k: number) => (kcalMacros && g != null ? Math.round(((g * k) / kcalMacros) * 100) : null);
  return { loggedDays: logged.length, calories: avg('calories'), protein: p, carbs: c, fat: f, pctProtein: pct(p, 4), pctCarbs: pct(c, 4), pctFat: pct(f, 9) };
}
