// Verifica el parser contra el CRM REAL exportado (no se versiona: ruta por variable de entorno).
import { readFileSync, existsSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { groupClients, parseCrm, SheetRow } from '../lib/crm';
import { computeProgram } from '../lib/program';

const path = process.env.CRM_CSV;
const TODAY = '2026-11-18';

function csvToRows(csv: string): SheetRow[] {
  return csv.split(/\n/).filter((l) => l.trim()).map((line, i) => ({
    values: line.split(',').map((v, c) => {
      const val = v.replace(/\r$/, '');
      if (i > 0 && c === 4 && /^-?\d+$/.test(val)) return { formattedValue: val, userEnteredValue: { formulaValue: '=TODAY()-D' } };
      return { formattedValue: val };
    }),
  }));
}

describe.skipIf(!path || !existsSync(path!))('CRM real', () => {
  const { programs, headerIssues } = path && existsSync(path) ? parseCrm(csvToRows(readFileSync(path, 'utf8'))) : { programs: [], headerIssues: [] };
  const clients = groupClients(programs);
  const active = clients.filter((c) => {
    const last = c.programs[c.programs.length - 1];
    const s = computeProgram({ startDate: last.startDate, contractedRaw: last.contractedRaw, crmEndDate: last.crmEndDate, crmStatusText: last.crmStatusText }, TODAY);
    return s.status === 'active' || s.status === 'upcoming';
  });

  it('cabeceras completas', () => expect(headerIssues).toEqual([]));
  it('22 filas → 21 clientes (Roberto agrupado por email)', () => {
    expect(programs).toHaveLength(22);
    expect(clients).toHaveLength(21);
    const rob = clients.find((c) => c.email === 'robertopeirano@adinet.com.uy')!;
    expect(rob.programs.map((p) => p.startDate)).toEqual(['2026-07-20', '2026-10-12']);
  });
  it('5 clientes activos/próximos: los indicados por el coach', () => {
    expect(active.map((c) => c.fullName).sort()).toEqual(['Camilo Rivera', 'Ilian Griñán', 'Lorena Gonzalez', 'Manel Clavel', 'Roberto Peirano']);
  });
  it('días calculados a hoy coinciden con la fórmula del CRM', () => {
    const exp: Record<string, [number, number | null]> = {
      'Lorena Gonzalez': [114, 4], 'Manel Clavel': [72, 109], 'Camilo Rivera': [51, 39], 'Roberto Peirano': [37, 151], 'Ilian Griñán': [-5, 186],
    };
    for (const c of active) {
      const p = c.programs[c.programs.length - 1];
      const s = computeProgram({ startDate: p.startDate, contractedRaw: p.contractedRaw, crmEndDate: p.crmEndDate }, TODAY);
      expect([s.daysElapsed, s.daysRemaining], c.fullName).toEqual(exp[c.fullName]);
    }
  });
  it('detecta discrepancias sin corregirlas', () => {
    const issues = (n: string) => {
      const c = active.find((x) => x.fullName === n)!; const p = c.programs[c.programs.length - 1];
      return [...p.issues, ...computeProgram({ startDate: p.startDate, contractedRaw: p.contractedRaw, crmEndDate: p.crmEndDate }, TODAY).issues].join(' | ');
    };
    expect(issues('Ilian Griñán')).toMatch(/Sin email/);
    expect(issues('Ilian Griñán')).toMatch(/no es posterior al inicio/);
    expect(issues('Lorena Gonzalez')).toMatch(/extra ambiguo/);
    expect(issues('Roberto Peirano')).toMatch(/difiere \+6 días/);
    expect(issues('Manel Clavel')).toBe('');
  });
  it('emails normalizados (espacios y \\r eliminados)', () => {
    expect(clients.find((c) => c.fullName === 'Camilo Rivera')!.email).toBe('camilo.rivera93@gmail.com');
  });
});
