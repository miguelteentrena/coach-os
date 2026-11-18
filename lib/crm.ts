import { createHash } from 'crypto';
import { fromDMY, fromSheetSerial, ISODate } from './dates';
import { nameKey, normEmail } from './normalize';

/** Celda tal como la devuelve la Sheets API (spreadsheets.get con includeGridData). */
export interface SheetCell {
  formattedValue?: string;
  hyperlink?: string;
  userEnteredValue?: { stringValue?: string; numberValue?: number; formulaValue?: string };
  effectiveValue?: { stringValue?: string; numberValue?: number };
  chipRuns?: { chip?: { richLinkProperties?: { uri?: string } } }[];
}
export type SheetRow = { values?: SheetCell[] };

/** Cabeceras reales del CRM «CRM DE CLIENTES TMT» (auditadas el 18/11/2026). */
export const CRM_HEADERS = {
  name: 'Nombre', email: 'Email', phone: 'Teléfono', start: 'Fecha de Inicio', daysSince: 'Días desde el inicio',
  contracted: 'Tiempo contratado', end: 'Fecha final', report: 'Informe', contract: 'Contrato', onboarding: 'Onboarding',
  success: 'CASO DE ÉXITO',
} as const;

export interface CrmProgramRow {
  row: number;                 // nº de fila en la hoja (1 = cabecera)
  hash: string;
  fullName: string;
  nameKey: string;
  email: string | null;
  phone: string | null;
  startDate: ISODate | null;
  contractedRaw: string | null;
  crmEndDate: ISODate | null;
  crmStatusText: string | null; // texto en «Días desde el inicio» (p.ej. FINALIZADO)
  reportUrl: string | null;
  reportLabel: string | null;
  contractUrl: string | null;
  onboardingUrl: string | null;
  callUrls: string[];
  successUrl: string | null;
  abandonNote: string | null;
  issues: string[];
}

const text = (c?: SheetCell) => (c?.formattedValue ?? '').replace(/\r/g, '').trim() || null;
const link = (c?: SheetCell): string | null => {
  if (!c) return null;
  const chip = c.chipRuns?.find((r) => r.chip?.richLinkProperties?.uri)?.chip?.richLinkProperties?.uri;
  if (chip) return chip;
  if (c.hyperlink) return c.hyperlink;
  const t = text(c);
  const m = t?.match(/https?:\/\/\S+/);
  return m ? m[0] : null;
};
const date = (c?: SheetCell): ISODate | null => {
  const n = c?.userEnteredValue?.numberValue ?? c?.effectiveValue?.numberValue;
  if (typeof n === 'number') return fromSheetSerial(n);
  const t = text(c);
  return t ? fromDMY(t) : null;
};

export function parseCrm(rows: SheetRow[]): { programs: CrmProgramRow[]; headerIssues: string[] } {
  const header = (rows[0]?.values ?? []).map((c) => text(c) ?? '');
  const idx = (h: string) => header.findIndex((x) => x.toLowerCase() === h.toLowerCase());
  const headerIssues: string[] = [];
  const col: Record<string, number> = {};
  for (const [k, h] of Object.entries(CRM_HEADERS)) {
    col[k] = idx(h);
    if (col[k] < 0) headerIssues.push(`Falta la columna «${h}» en el CRM`);
  }
  const callCols = header.map((h, i) => (/^llamada\s*\d+/i.test(h) ? i : -1)).filter((i) => i >= 0);

  const programs: CrmProgramRow[] = [];
  rows.slice(1).forEach((r, i) => {
    const v = r.values ?? [];
    const fullName = text(v[col.name]);
    if (!fullName) return;
    const issues: string[] = [];
    const rawEmail = text(v[col.email]);
    const email = normEmail(rawEmail);
    if (!rawEmail) issues.push('Sin email en el CRM: se identifica por nombre exacto');
    else if (!email) issues.push(`Email no válido: «${rawEmail}»`);

    const daysCell = v[col.daysSince];
    const isFormula = !!daysCell?.userEnteredValue?.formulaValue;
    const daysText = text(daysCell);
    const crmStatusText = !isFormula && daysText && isNaN(Number(daysText)) ? daysText : null;

    const callCells = callCols.map((c) => v[c]);
    const abandon = callCells.map(text).find((t) => t && /abandono/i.test(t)) ?? null;
    const callUrls = callCells.map(link).filter((x): x is string => !!x);

    const rec: Omit<CrmProgramRow, 'hash'> = {
      row: i + 2,
      fullName,
      nameKey: nameKey(fullName),
      email,
      phone: text(v[col.phone]),
      startDate: date(v[col.start]),
      contractedRaw: text(v[col.contracted]),
      crmEndDate: date(v[col.end]),
      crmStatusText,
      reportUrl: link(v[col.report]),
      reportLabel: text(v[col.report]),
      contractUrl: link(v[col.contract]),
      onboardingUrl: link(v[col.onboarding]),
      callUrls,
      successUrl: link(v[col.success]),
      abandonNote: abandon,
      issues,
    };
    const hash = createHash('sha256').update(JSON.stringify(rec)).digest('hex').slice(0, 16);
    programs.push({ ...rec, hash });
  });
  return { programs, headerIssues };
}

export interface CrmClient {
  key: string;                 // email o "name:<nameKey>"
  email: string | null;
  fullName: string;            // nombre de la fila más reciente
  nameVariants: string[];
  programs: CrmProgramRow[];   // ordenados por inicio
  issues: string[];
}

/** Agrupa programas por cliente. Email = identificador principal. Nunca fusiona por nombre aproximado. */
export function groupClients(programs: CrmProgramRow[]): CrmClient[] {
  const map = new Map<string, CrmClient>();
  for (const p of programs) {
    const key = p.email ?? `name:${p.nameKey}`;
    const c = map.get(key) ?? { key, email: p.email, fullName: p.fullName, nameVariants: [], programs: [], issues: [] };
    c.programs.push(p);
    if (!c.nameVariants.includes(p.fullName)) c.nameVariants.push(p.fullName);
    map.set(key, c);
  }
  for (const c of map.values()) {
    c.programs.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
    c.fullName = c.programs[c.programs.length - 1].fullName;
    if (c.nameVariants.length > 1) c.issues.push(`Mismo email con nombres distintos: ${c.nameVariants.join(' / ')}`);
    if (c.programs.length > 1) c.issues.push(`${c.programs.length} programas en el CRM (renovación): filas ${c.programs.map((p) => p.row).join(', ')}`);
  }
  // Mismo nombre normalizado con emails distintos → posible duplicado, NO se fusiona
  const byName = new Map<string, CrmClient[]>();
  for (const c of map.values()) {
    const k = nameKey(c.fullName);
    byName.set(k, [...(byName.get(k) ?? []), c]);
  }
  for (const list of byName.values())
    if (list.length > 1) list.forEach((c) => c.issues.push(`Posible duplicado por nombre con otro email (${list.map((x) => x.email ?? 'sin email').join(', ')})`));
  return [...map.values()];
}
