// Escenarios pedidos para COACH OS 2.1 (datos sintéticos de prueba; no se muestran en la app)
import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { categorize, cleanTitle, findDuplicate, isAchievementText } from '../lib/achievements';
import { analyzeCheckin, CheckinRecord } from '../lib/analysis';
import { checkinEvidence, insightEvidence, systemEvidence } from '../lib/evidence';
import { matchCall, normFathomUrl, parseMeeting, validateQuotes, verifyFathomWebhook } from '../lib/fathom';
import { applyEvidence, archiveIfStale, bucket, Evidence, IssueState, manualTransition, sortIssues } from '../lib/issues';
import { draftWhatsApp } from '../lib/whatsapp';

const C = 'client-1';
const ev = (p: Partial<Evidence> & Pick<Evidence, 'polarity' | 'observedOn'>): Evidence => ({
  key: `${p.sourceRef ?? 'r'}:${p.observedOn}:${p.polarity}`, scopeKey: `${C}:nutrition_adherence`, clientId: C, category: 'nutrition_adherence',
  title: 'Adherencia nutricional', severity: 'yellow', sourceType: 'jotform', sourceRef: `r-${p.observedOn}`, basis: 'dato del formulario', text: 't', ...p,
});
const run = (evs: Evidence[], start: IssueState | null = null) => evs.reduce<{ s: IssueState | null; notes: string[] }>((acc, e) => {
  const r = applyEvidence(acc.s, e); if (r.transition) acc.notes.push(`${r.transition.from}->${r.transition.to}`); return { s: r.state, notes: acc.notes };
}, { s: start, notes: [] });

describe('ADVERTENCIAS: estados e historial', () => {
  it('detecta una incidencia nueva', () => {
    const { s } = run([ev({ polarity: 'problem', observedOn: '2026-11-10' })]);
    expect(s!.status).toBe('new');
  });
  it('dejar de mencionarse NO resuelve', () => {
    const { s } = run([ev({ polarity: 'problem', observedOn: '2026-09-01' })]);
    expect(s!.status).toBe('new'); // nada más ocurre: sigue abierta (el orden la manda abajo si es antigua)
    expect(bucket(s!, '2026-11-18').n).toBe(4);
  });
  it('una mejora → en seguimiento; dos mejoras independientes → resuelta por evidencia', () => {
    const { s, notes } = run([
      ev({ polarity: 'problem', observedOn: '2026-10-01' }),
      ev({ polarity: 'improvement', observedOn: '2026-10-08', sourceRef: 'chk-2' }),
      ev({ polarity: 'improvement', observedOn: '2026-10-15', sourceRef: 'chk-3' }),
    ]);
    expect(notes).toEqual(['null->new', 'new->monitoring', 'monitoring->resolved']);
    expect(s!.resolutionKind).toBe('auto_evidence');
  });
  it('una advertencia RESUELTA no reaparece por evidencia antigua', () => {
    let { s } = run([ev({ polarity: 'problem', observedOn: '2026-10-01' })]);
    s = manualTransition(s!, 'resolve', '2026-10-20', 'Ajusté la dieta').state;
    const r = applyEvidence(s, ev({ polarity: 'problem', observedOn: '2026-10-05', sourceRef: 'tarde' })); // llega tarde, fecha anterior
    expect(r.state!.status).toBe('resolved');
    expect(r.transition).toBeUndefined();
  });
  it('una incidencia resuelta REAPARECE con evidencia nueva y conserva el historial', () => {
    let { s } = run([ev({ polarity: 'problem', observedOn: '2026-10-01' })]);
    s = manualTransition(s!, 'resolve', '2026-10-20', 'Hecho').state;
    const r = applyEvidence(s, ev({ polarity: 'problem', observedOn: '2026-11-15', sourceRef: 'nuevo' }));
    expect(r.state!.status).toBe('new');
    expect(r.state!.reopenedCount).toBe(1);
    expect(r.state!.firstDetectedOn).toBe('2026-10-01');
    expect(r.transition!.note).toMatch(/Reaparece/);
  });
  it('una llamada posterior actualiza una advertencia de una llamada anterior', () => {
    const call1 = insightEvidence({ id: 'i1', client_id: C, call_id: 'call-1', kind: 'adherence', speaker: 'client', basis: 'fathom_summary',
      text: 'Le cuesta seguir la dieta los fines de semana', issue_category: 'nutrition_adherence', polarity: 'problem', occurred_on: '2026-10-14', link: null })!;
    const call2 = insightEvidence({ id: 'i2', client_id: C, call_id: 'call-2', kind: 'progress', speaker: 'client', basis: 'verbatim_quote',
      text: 'Confirma que ya sigue el plan correctamente', issue_category: 'nutrition_adherence', polarity: 'improvement', occurred_on: '2026-10-28', link: null })!;
    const jot = ev({ polarity: 'improvement', observedOn: '2026-11-02', sourceRef: 'chk-9' });
    const { s, notes } = run([call1, call2, jot]);
    expect(notes).toEqual(['null->new', 'new->monitoring', 'monitoring->resolved']);
    expect(s!.status).toBe('resolved');
  });
  it('una inferencia de IA puede abrir pero nunca resolver', () => {
    const p = ev({ polarity: 'problem', observedOn: '2026-10-01' });
    const ai = { ...ev({ polarity: 'improvement', observedOn: '2026-10-10', sourceRef: 'x' }), canResolve: false };
    const ai2 = { ...ev({ polarity: 'improvement', observedOn: '2026-10-11', sourceRef: 'y' }), canResolve: false };
    expect(run([p, ai, ai2]).s!.status).toBe('new');
  });
  it('en seguimiento tras actuar: si el problema vuelve después, pasa a pendiente', () => {
    let { s } = run([ev({ polarity: 'problem', observedOn: '2026-11-01' })]);
    s = manualTransition(s!, 'act', '2026-11-05', 'Le envié la tabla nueva').state;
    const r = applyEvidence(s, ev({ polarity: 'problem', observedOn: '2026-11-12', sourceRef: 'n' }));
    expect(r.state!.status).toBe('pending');
    expect(r.state!.trend).toBe('repeated');
  });
  it('si empeora (amarillo → rojo) se marca como empeorando', () => {
    const { s } = run([ev({ polarity: 'problem', observedOn: '2026-11-01' }), ev({ polarity: 'problem', observedOn: '2026-11-08', severity: 'red', sourceRef: 'b' })]);
    expect(s!.trend).toBe('worsening'); expect(s!.severity).toBe('red');
  });
  it('las recientes aparecen antes que las antiguas; resueltas al final', () => {
    const T = '2026-11-18';
    const mk = (status: any, lastProblemOn: string, trend: any = 'single', severity: any = 'yellow') => ({ status, lastProblemOn, lastEvidenceOn: lastProblemOn, trend, severity, id: `${status}-${lastProblemOn}` });
    const sorted = sortIssues([mk('new', '2026-09-01'), mk('resolved', '2026-11-17'), mk('monitoring', '2026-11-10'), mk('pending', '2026-11-16', 'repeated'), mk('new', '2026-11-15')], T);
    expect(sorted.map((x) => x.id)).toEqual(['new-2026-11-15', 'pending-2026-11-16', 'monitoring-2026-11-10', 'new-2026-09-01', 'resolved-2026-11-17']);
  });
  it('puesta en marcha: lo antiguo sin evidencia reciente se archiva (no es pendiente)', () => {
    const { s } = run([ev({ polarity: 'problem', observedOn: '2026-09-20' })]);
    expect(archiveIfStale(s!, '2026-11-04')).not.toBeNull();
    expect(s!.status).toBe('resolved'); expect(s!.resolutionKind).toBe('archived_initial');
    expect(applyEvidence(s, ev({ polarity: 'problem', observedOn: '2026-11-16', sourceRef: 'z' })).state!.status).toBe('new');
  });
});

describe('Evidencias de Jotform y del sistema', () => {
  const ck = (id: string, d: string, v: CheckinRecord['values'], t: CheckinRecord['texts'] = {}): CheckinRecord => ({ id, submittedAt: `${d}T10:00:00+01:00`, values: v, texts: t });
  it('estrés alto = problema; estrés bajo = mejora; cansancio alto nunca es "bueno"', () => {
    const e = checkinEvidence(C, ck('k1', '2026-11-15', { stress: 8, fatigue: 9, recovery: 8, adherence: 9 }), null);
    expect(e.find((x) => x.category === 'stress')!.polarity).toBe('problem');
    expect(e.find((x) => x.category === 'fatigue_recovery')!.polarity).toBe('problem');
    expect(e.find((x) => x.category === 'nutrition_adherence')!.polarity).toBe('improvement');
  });
  it('sin check-in: con llamada reciente baja a informativo', () => {
    const e = systemEvidence({ clientId: C, today: '2026-11-18', lastCheckinOn: null, programStart: '2026-09-07', lastCallOn: '2026-11-12', program: null, newerProgramId: null, status: 'active' });
    expect(e[0].severity).toBe('info'); expect(e[0].text).toMatch(/llamada el 12\/11/);
  });
});

describe('LOGROS', () => {
  it('un logro de Jotform se reconoce y categoriza', () => {
    expect(isAchievementText('Subimos a pesas de 8 kg')).toBe(true);
    expect(isAchievementText('Nada')).toBe(false);
    expect(categorize('Bajé una talla de pantalón')).toBe('medidas');
    expect(cleanTitle('Me da orgullo ver el cambio de mentalidad')).toBe('El cambio de mentalidad');
  });
  it('un logro de llamada aparece (sin duplicado previo)', () => {
    expect(findDuplicate({ clientId: C, sourceType: 'fathom', sourceRef: 'i1', mentionedOn: '2026-11-16', title: 'Bajó una talla de pantalón' }, [])).toBeNull();
  });
  it('el mismo logro en dos fuentes se agrupa', () => {
    const existing = [{ id: 'a1', clientId: C, title: 'Bajé 2 kg este mes', category: 'peso', firstMentionedOn: '2026-11-09', lastMentionedOn: '2026-11-09' }];
    expect(findDuplicate({ clientId: C, sourceType: 'fathom', sourceRef: 'i9', mentionedOn: '2026-11-12', title: 'Ha bajado 2 kg en el último mes' }, existing)?.id).toBe('a1');
    expect(findDuplicate({ clientId: 'otro', sourceType: 'fathom', sourceRef: 'i9', mentionedOn: '2026-11-12', title: 'Ha bajado 2 kg en el último mes' }, existing)).toBeNull();
    expect(findDuplicate({ clientId: C, sourceType: 'fathom', sourceRef: 'i9', mentionedOn: '2026-11-12', title: 'Subió la prensa a 60 kg' }, existing)).toBeNull();
  });
});

describe('Fathom', () => {
  const crm = [
    { clientId: 'manel', email: 'mclavel5151@gmail.com', urls: ['https://fathom.video/share/12XswgVcjiECzHKBd74yztB4-3WSBT6Z'] },
    { clientId: 'camilo', email: 'camilo.rivera93@gmail.com', urls: [] },
  ];
  it('asocia la llamada al cliente correcto por el enlace del CRM (llamada "Impromptu" sin invitados)', () => {
    expect(matchCall({ url: 'https://fathom.video/calls/900085485', shareUrl: 'https://fathom.video/share/12XswgVcjiECzHKBd74yztB4-3WSBT6Z', inviteeEmails: [] }, crm, [])).toEqual({ clientId: 'manel', method: 'crm_link' });
  });
  it('por email de invitado si no está en el CRM; nunca por nombre', () => {
    expect(matchCall({ url: null, shareUrl: null, inviteeEmails: ['camilo.rivera93@gmail.com', 'migueljc2001@miguelteentrena.com'] }, crm, ['migueljc2001@miguelteentrena.com'])).toEqual({ clientId: 'camilo', method: 'invitee_email' });
    expect(matchCall({ url: 'https://fathom.video/calls/1', shareUrl: null, inviteeEmails: [] }, crm, [])).toBeNull();
  });
  it('normaliza enlaces', () => expect(normFathomUrl('https://fathom.video/share/abc_D-1?x=1')).toBe('share/abc_D-1'));
  it('verifica la firma del webhook (Standard Webhooks) y rechaza manipulaciones', () => {
    const secret = 'whsec_' + Buffer.from('supersecretkey123').toString('base64');
    const body = JSON.stringify({ recording_id: 1 });
    const ts = '1794990000';
    const sig = createHmac('sha256', Buffer.from('supersecretkey123')).update(`msg_1.${ts}.${body}`).digest('base64');
    expect(verifyFathomWebhook(secret, { id: 'msg_1', timestamp: ts, signature: `v1,${sig}` }, body, 1794990010)).toBe(true);
    expect(verifyFathomWebhook(secret, { id: 'msg_1', timestamp: ts, signature: `v1,${sig}` }, body + ' ', 1794990010)).toBe(false);
    expect(verifyFathomWebhook(secret, { id: 'msg_1', timestamp: ts, signature: `v1,${sig}` }, body, 1794999999)).toBe(false);
  });
  it('parsea el payload (resumen, tareas con responsable)', () => {
    const m = parseMeeting({ recording_id: 7, title: 'x', created_at: '2026-11-12T16:00:00Z', share_url: 'https://fathom.video/share/a', calendar_invitees: [{ email: 'A@B.com' }],
      default_summary: { markdown_formatted: '## Resumen' }, action_items: [{ description: 'Enviar rutina', assignee: { name: 'Miguel', email: 'migueljc2001@miguelteentrena.com' }, recording_timestamp: '00:39:25' }] });
    expect(m.inviteeEmails).toEqual(['a@b.com']); expect(m.actionItems[0].timestampSec).toBe(2365); expect(m.summaryMd).toBe('## Resumen');
  });
  it('una cita que no está en la transcripción se degrada a inferencia', () => {
    const r = validateQuotes([{ kind: 'progress', speaker: 'client', text: 'x', quote: 'incluso algún pantalón ya me cae', polarity: 'improvement' },
      { kind: 'problem', speaker: 'client', text: 'y', quote: 'esto nunca se dijo en la llamada', polarity: 'problem' }], 'O sea, incluso algún pantalón ya me cae. Sí, ¿no?');
    expect(r.map((x) => x.basis)).toEqual(['verbatim_quote', 'ai_inference']);
  });
});

describe('WhatsApp con contexto', () => {
  const base = analyzeCheckin({ id: 'k', submittedAt: '2026-11-16T10:00:00+01:00', values: { adherence: 5, stress: 8 }, texts: {} }, []);
  it('tiene en cuenta situación personal, logros recientes y compromisos del coach', () => {
    const d = draftWhatsApp('Camilo', base, { lifeContext: [{ text: 'Viaje de trabajo a Río', on: '16/11' }], recentAchievements: [{ title: 'Bajó una talla de pantalón', on: '16/11' }], openCoachCommitments: ['Enviar rutina full-body para Río'] })!;
    expect(d.text).toMatch(/sin presión/); expect(d.text).toMatch(/talla de pantalón/);
    expect(d.text).not.toMatch(/Río/); // el contexto se muestra al coach, no se expone en el mensaje
    expect(d.notes.join(' ')).toMatch(/Enviar rutina/);
  });
  it('no insiste en un tema resuelto y no repite el mismo consejo', () => {
    const d1 = draftWhatsApp('Ana', base, { resolvedCategories: ['nutrition_adherence'] })!;
    expect(d1.topics).toEqual(['stress']);
    const d2 = draftWhatsApp('Ana', base, { recentTopics: ['nutrition_adherence'] })!;
    expect(d2.text).toMatch(/que ya comentamos/);
  });
});
