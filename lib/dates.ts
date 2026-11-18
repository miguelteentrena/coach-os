// Fechas como 'YYYY-MM-DD' (sin hora) para evitar errores de zona horaria.
export type ISODate = string;

export const TZ = 'Europe/Madrid';

export function todayISO(now: Date = new Date()): ISODate {
  // Fecha local de Madrid, no UTC
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function toUTC(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a) - toUTC(b)) / 86400000);
}

export function addDays(d: ISODate, n: number): ISODate {
  return new Date(toUTC(d) + n * 86400000).toISOString().slice(0, 10);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split('-').map(Number);
  const whole = Math.trunc(n);
  const target = new Date(Date.UTC(y, m - 1 + whole, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  let out = target.toISOString().slice(0, 10);
  const frac = n - whole;
  if (frac) out = addDays(out, Math.round(frac * 30));
  return out;
}

/** Serial de Google Sheets (días desde 1899-12-30) → ISO */
export function fromSheetSerial(serial: number): ISODate {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000).toISOString().slice(0, 10);
}

/** "27/7/2026" → "2026-07-27" (formato es-ES d/m/aaaa) */
export function fromDMY(s: string): ISODate | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isNaN(toUTC(iso)) ? null : iso;
}

export function mondayOf(d: ISODate): ISODate {
  const dow = new Date(toUTC(d)).getUTCDay(); // 0 domingo
  return addDays(d, -((dow + 6) % 7));
}

export function fmtES(d: ISODate | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
