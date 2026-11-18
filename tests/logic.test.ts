import { describe, expect, it } from 'vitest';
import { analyzeCheckin, CheckinRecord } from '../lib/analysis';
import { renewalAlert, renewalMilestone, checkinAlert, missingCheckinAlert } from '../lib/alerts';
import { parseCrm } from '../lib/crm';
import { addMonths, fromSheetSerial, mondayOf } from '../lib/dates';
import { matchClient, parseSubmission } from '../lib/jotform';
import { computeProgram, parseDuration } from '../lib/program';
import { draftWhatsApp } from '../lib/whatsapp';

// Datos de prueba sintéticos de los TESTS (no se muestran en la app ni simulan integraciones).
const ck = (id: string, date: string, v: CheckinRecord['values'], t: CheckinRecord['texts'] = {}): CheckinRecord => ({ id, submittedAt: `${date}T10:00:00+01:00`, values: v, texts: t });
const good = { sessions: 5, fatigue: 4, recovery: 8, adherence: 8, sleep_quality: 7, stress: 3, motivation: 8, hunger: 4, satiety: 7, hydration: 8 };

describe('fechas y duración', () => {
  it('serial de Sheets', () => expect(fromSheetSerial(46230)).toBe('2026-07-27'));
  it('addMonths fin de mes', () => expect(addMonths('2026-08-31', 6)).toBe('2027-02-28'));
  it('lunes de la semana', () => expect(mondayOf('2026-11-22')).toBe('2026-11-16'));
  it('parseDuration', () => {
    expect(parseDuration('6 meses').months).toBe(6);
    expect(parseDuration('3 meses + 1').extraRaw).toBe('1');
    expect(parseDuration('12 semanas').months).toBeCloseTo(2.8, 1);
  });
  it('pausas y extensiones mueven el fin', () => {
    const s = computeProgram({ startDate: '2026-09-07', contractedRaw: '6 meses', crmEndDate: '2027-03-07', adjustments: [{ kind: 'pause', days: 14 }, { kind: 'extension', days: 30 }] }, '2026-11-18');
    expect(s.effectiveEnd).toBe('2027-04-20');
    expect(s.daysRemaining).toBe(153);
  });
  it('FINALIZADO del CRM manda', () => expect(computeProgram({ startDate: '2025-09-15', contractedRaw: null, crmEndDate: null, crmStatusText: 'FINALIZADO' }, '2026-11-18').status).toBe('finished'));
});

describe('parser de celdas de Sheets con chips', () => {
  it('lee la URL del chip del informe', () => {
    const hdr = ['Nombre','Email','Teléfono','Fecha de Inicio','Días desde el inicio','Tiempo contratado','Fecha final','Informe','Contrato','Onboarding','Llamada 1','CASO DE ÉXITO'].map((h) => ({ formattedValue: h }));
    const { programs } = parseCrm([{ values: hdr }, { values: [
      { formattedValue: 'Test Uno' }, { formattedValue: 'T@X.COM \r' }, {}, { userEnteredValue: { numberValue: 46272 }, formattedValue: '7/9/2026' },
      { userEnteredValue: { formulaValue: '=TODAY()-D2' }, formattedValue: '72' }, { formattedValue: '6 meses' }, { userEnteredValue: { numberValue: 46453 } },
      { formattedValue: 'Informe', chipRuns: [{ chip: { richLinkProperties: { uri: 'https://docs.google.com/document/d/abc' } } }] }, {}, {},
      { formattedValue: 'https://fathom.video/share/x' },
    ] }]);
    expect(programs[0]).toMatchObject({ email: 't@x.com', startDate: '2026-09-07', crmEndDate: '2027-03-07', reportUrl: 'https://docs.google.com/document/d/abc', callUrls: ['https://fathom.video/share/x'], crmStatusText: null });
  });
});

describe('Jotform', () => {
  const sub = { id: '1', form_id: '262472622960055', created_at: '2026-11-16 09:30:00', answers: {
    '3': { text: 'Nº de sesiones completadas/sem', type: 'control_scale', answer: '4' },
    '4': { text: 'Grado de cansancio al finalizar la semana', type: 'control_scale', answer: '6' },
    '7': { text: 'Peso en ayunas (kg)', type: 'control_textbox', answer: '72,4' },
    '30': { text: 'Nombre y Apellido', type: 'control_fullname', answer: { first: 'Lorena', last: 'González' } },
    '22': { text: '¿Hay algo de la nutrición que me quieras comentar?', type: 'control_textarea', answer: '¿Puedo cambiar la cena?' },
  } };
  it('parsea por etiqueta', () => {
    const p = parseSubmission(sub);
    expect(p.values).toMatchObject({ sessions: 4, fatigue: 6, weight_kg: 72.4 });
    expect(p.name).toBe('Lorena González');
    expect(p.texts.nutrition_comment).toBe('¿Puedo cambiar la cena?');
    expect(p.weekStart).toBe('2026-11-16');
    expect(p.missingFields).toContain('recovery');
  });
  const clients = [
    { id: 'L', email: 'lorenica81@hotmail.com', full_name: 'Lorena Gonzalez', aliases: [] },
    { id: 'R', email: 'robertopeirano@adinet.com.uy', full_name: 'Roberto Peirano', aliases: [] },
  ];
  it('tildes no impiden el emparejamiento', () => expect(matchClient({ name: 'Lorena González', email: null }, clients)).toMatchObject({ kind: 'matched', clientId: 'L' }));
  it('Peinaro ≠ Peirano → revisión manual, con candidato', () => expect(matchClient({ name: 'Roberto Peinaro', email: null }, clients)).toEqual({ kind: 'review', candidates: ['R'], reason: expect.any(String) }));
  it('alias confirmado empareja', () => expect(matchClient({ name: 'Roberto Peinaro', email: null }, [{ ...clients[1], aliases: ['Roberto Peinaro'] }])).toMatchObject({ kind: 'matched', by: 'alias' }));
  it('email gana al nombre', () => expect(matchClient({ name: 'Otro', email: 'lorenica81@hotmail.com' }, clients)).toMatchObject({ clientId: 'L', by: 'email' }));
});

describe('análisis', () => {
  it('verde: no genera tarea ni mensaje', () => {
    const a = analyzeCheckin(ck('c2', '2026-11-16', good, { proud: 'He entrenado todos los días', coach_feedback: 'Nada, todo bien' }), [ck('c1', '2026-11-09', good)]);
    expect(a.level).toBe('green');
    expect(checkinAlert('x', 'X', a)).toBeNull();
    expect(draftWhatsApp('X', a)).toBeNull();
  });
  it('cansancio ALTO es malo; recuperación BAJA es mala', () => {
    const a = analyzeCheckin(ck('c2', '2026-11-16', { ...good, fatigue: 9, recovery: 3 }), [ck('c1', '2026-11-09', good)]);
    expect(a.level).toBe('red');
    expect(a.signals.map((s) => s.metric)).toEqual(expect.arrayContaining(['Cansancio', 'Recuperación', 'Cansancio/Recuperación']));
  });
  it('cansancio BAJO y recuperación ALTA no alertan', () => {
    const a = analyzeCheckin(ck('c2', '2026-11-16', { ...good, fatigue: 1, recovery: 10 }), [ck('c1', '2026-11-09', good)]);
    expect(a.signals.filter((s) => /Cansancio|Recuperación/.test(s.metric))).toEqual([]);
  });
  it('repetido en zona de aviso: amarillo en el semáforo semanal (la repetición la gestiona el motor de advertencias)', () => {
    const a = analyzeCheckin(ck('c2', '2026-11-16', { ...good, adherence: 6 }), [ck('c1', '2026-11-09', { ...good, adherence: 5 })]);
    expect(a.level).toBe('yellow');
    expect(a.signals[0].text).toMatch(/dos semanas seguidas/);
  });
  it('«Todo perfecto» en la petición al coach no es una petición', () => {
    const a = analyzeCheckin(ck('c2', '2026-11-16', good, { coach_feedback: 'Todo perfecto' }), [ck('c1', '2026-11-09', good)]);
    expect(a.level).toBe('green');
    const b = analyzeCheckin(ck('c3', '2026-11-16', good, { coach_feedback: 'Más ejercicios' }), [ck('c1', '2026-11-09', good)]);
    expect(b.level).toBe('yellow');
  });
  it('comentario sensible → leer personalmente, sin diagnóstico', () => {
    const a = analyzeCheckin(ck('c2', '2026-11-16', good, { exercise_comment: 'Me duele la rodilla en sentadilla' }), []);
    expect(a.level).toBe('red');
    expect(draftWhatsApp('Ana', a)!.text).toMatch(/hablásemos|habláramos/);
  });
  it('compara con 4 semanas y 3 meses cuando hay datos', () => {
    const hist = Array.from({ length: 10 }, (_, i) => ck(`h${i}`, addMonths('2026-11-09', 0).replace(/\d\d$/, String(9).padStart(2,'0')), { ...good }));
    const histDated = hist.map((h, i) => ({ ...h, submittedAt: new Date(Date.UTC(2026, 10, 9 - i * 7)).toISOString() }));
    const a = analyzeCheckin(ck('c', '2026-11-16', good), histDated);
    const adh = a.comparisons.find((c) => c.metric === 'adherence')!;
    expect(adh.avg4).toBe(8); expect(adh.avg3m).toBe(8);
  });
});

describe('alertas', () => {
  it('hitos 30/15/7/0', () => {
    expect([45, 30, 20, 15, 8, 7, 1, 0, -3].map(renewalMilestone)).toEqual([null, 30, 30, 15, 15, 7, 7, 0, 0]);
  });
  it('renovación de Lorena (4 días) → rojo, aviso 7', () => {
    const a = renewalAlert({ clientId: 'L', clientName: 'Lorena', programId: 'p', effectiveEnd: '2026-11-22', daysRemaining: 4, lastLevel: null, redsLast4: 0, checkinsLast4: 0 })!;
    expect(a.kind).toBe('renewal_7'); expect(a.severity).toBe('red'); expect(a.detail).toMatch(/Revisar antes/);
  });
  it('check-in ausente', () => {
    expect(missingCheckinAlert('x', 'X', '2026-11-01', null, '2026-11-18')!.severity).toBe('red');
    expect(missingCheckinAlert('x', 'X', '2026-11-12', null, '2026-11-18')).toBeNull();
  });
});
describe('textos', () => {
  it('"No, me duele el hombro" no se descarta como respuesta vacía', () => {
    const a = analyzeCheckin(ck('c', '2026-11-16', good, { exercise_comment: 'No, me duele el hombro' }), []);
    expect(a.textsToReview).toHaveLength(1);
  });
});
