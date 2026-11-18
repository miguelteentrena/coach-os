import 'server-only';
import { AchievementCandidate, AchievementLite, categorize, cleanTitle, findDuplicate, isAchievementText } from '../achievements';
import { analyzeCheckin, CheckinRecord } from '../analysis';
import { addDays, diffDays, fmtES, todayISO } from '../dates';
import { checkinEvidence, InsightRow, insightEvidence, systemEvidence } from '../evidence';
import { fingerprint } from '../fathom';
import { applyEvidence, archiveIfStale, Evidence, IssueState } from '../issues';
import { NUMERIC_FIELDS, TEXT_FIELDS } from '../jotform';
import { adminDb, logError } from '../supabase';
import { draftWhatsApp } from '../whatsapp';

export function rowToRecord(r: Record<string, any>): CheckinRecord {
  return {
    id: r.id, submittedAt: r.submitted_at,
    values: Object.fromEntries(NUMERIC_FIELDS.map((f) => [f, r[f] == null ? null : Number(r[f])])),
    texts: Object.fromEntries(TEXT_FIELDS.map((f) => [f, r[f]])),
  };
}

export const coachEmails = () => (process.env.FATHOM_COACH_EMAILS ?? 'migueljc2001@miguelteentrena.com,miguelteentrena@gmail.com').split(',').map((e) => e.trim().toLowerCase());

// ───────── issues <-> filas ─────────
export function rowToIssue(r: any): IssueState {
  return {
    id: r.id, clientId: r.client_id, programId: r.program_id, scopeKey: r.scope_key, category: r.category, title: r.title,
    status: r.status, severity: r.severity, trend: r.trend, firstDetectedOn: r.first_detected_on, lastEvidenceOn: r.last_evidence_on,
    lastProblemOn: r.last_problem_on, problemCount: r.problem_count, reopenedCount: r.reopened_count,
    statusChangedOn: String(r.status_changed_at).slice(0, 10), resolvedOn: r.resolved_on, resolutionKind: r.resolution_kind,
    resolutionNote: r.resolution_note, actionNote: r.action_note, improvementRefs: r.improvement_refs ?? [],
  };
}
export function issueToRow(s: IssueState) {
  return {
    client_id: s.clientId, program_id: s.programId ?? null, scope_key: s.scopeKey, category: s.category, title: s.title, status: s.status,
    severity: s.severity, trend: s.trend, first_detected_on: s.firstDetectedOn, last_evidence_on: s.lastEvidenceOn, last_problem_on: s.lastProblemOn,
    problem_count: s.problemCount, reopened_count: s.reopenedCount, status_changed_at: `${s.statusChangedOn}T12:00:00+01:00`,
    resolved_on: s.resolvedOn ?? null, resolved_at: s.resolvedOn ? new Date().toISOString() : null, resolution_kind: s.resolutionKind ?? null,
    resolution_note: s.resolutionNote ?? null, action_note: s.actionNote ?? null, improvement_refs: s.improvementRefs, updated_at: new Date().toISOString(),
  };
}

/** Aplica evidencias nuevas (idempotente: cada evidence_key se aplica una sola vez). */
async function applyEvidenceBatch(clientId: string, all: Evidence[]) {
  const db = adminDb();
  const { data: rows } = await db.from('issues').select('*').eq('client_id', clientId).order('updated_at');
  const byScope = new Map<string, IssueState>();
  for (const r of rows ?? []) {
    const cur = byScope.get(r.scope_key);
    const active = ['new', 'pending', 'monitoring'].includes(r.status);
    if (!cur || active || !['new', 'pending', 'monitoring'].includes(cur.status)) byScope.set(r.scope_key, rowToIssue(r));
  }
  const ids = (rows ?? []).map((r) => r.id);
  const seen = new Set<string>();
  if (ids.length) {
    const { data: ev } = await db.from('issue_evidence').select('evidence_key').in('issue_id', ids);
    ev?.forEach((e) => seen.add(e.evidence_key));
  }
  const fresh = all.filter((e) => !seen.has(e.key)).sort((a, b) => a.observedOn.localeCompare(b.observedOn) || (a.polarity === 'problem' ? -1 : 1));
  for (const e of fresh) {
    const prev = byScope.get(e.scopeKey) ?? null;
    const r = applyEvidence(prev, e);
    if (!r.attached || !r.state) continue;
    let id = r.state.id;
    if (r.created) {
      const { data, error } = await db.from('issues').insert(issueToRow(r.state)).select('id').single();
      if (error) { await logError('issues-insert', error, { scope: e.scopeKey }); continue; }
      id = data.id; r.state.id = id;
      // Importación de histórico: un problema que nace con evidencia de hace más de 14 días no es una advertencia viva.
      const t = archiveIfStale(r.state, addDays(todayISO(), -14));
      if (t) {
        t.note = `Importada del histórico: ${t.note}`;
        await db.from('issues').update(issueToRow(r.state)).eq('id', id);
        await db.from('issue_events').insert({ issue_id: id, actor: 'system', from_status: t.from, to_status: t.to, note: t.note });
      }
    } else if (r.state !== prev) {
      await db.from('issues').update(issueToRow(r.state)).eq('id', id);
    }
    const { data: evRow } = await db.from('issue_evidence').upsert({
      issue_id: id, source_type: e.sourceType, source_ref: e.sourceRef, observed_on: e.observedOn, polarity: e.polarity, severity: e.severity,
      basis: e.basis, text: e.text, link: e.link ?? null, evidence_key: e.key,
    }, { onConflict: 'evidence_key', ignoreDuplicates: true }).select('id').maybeSingle();
    if (r.transition) await db.from('issue_events').insert({ issue_id: id, actor: 'system', from_status: r.transition.from, to_status: r.transition.to, note: r.transition.note, evidence_id: evRow?.id ?? null });
    byScope.set(e.scopeKey, r.state);
  }
}

async function syncAchievements(clientId: string, checkins: CheckinRecord[], insights: InsightRow[]) {
  const db = adminDb();
  const { data: achRows } = await db.from('achievements').select('id,client_id,title,category,first_mentioned_on,last_mentioned_on,mentions_count').eq('client_id', clientId);
  const lite: (AchievementLite & { mentions: number })[] = (achRows ?? []).map((a) => ({ id: a.id, clientId: a.client_id, title: a.title, category: a.category, firstMentionedOn: a.first_mentioned_on, lastMentionedOn: a.last_mentioned_on, mentions: a.mentions_count }));
  const achIds = lite.map((a) => a.id);
  const known = new Set<string>();
  if (achIds.length) (await db.from('achievement_mentions').select('source_type,source_ref').in('achievement_id', achIds)).data?.forEach((m) => known.add(`${m.source_type}:${m.source_ref}`));

  const cands: AchievementCandidate[] = [];
  for (const c of checkins) {
    const t = c.texts.proud;
    if (isAchievementText(t)) cands.push({ clientId, sourceType: 'jotform', sourceRef: `checkin:${c.id}`, mentionedOn: c.submittedAt.slice(0, 10), title: cleanTitle(t), context: `Respuesta a «¿De qué estás más orgulloso esta semana?»`, quote: t.slice(0, 300), basis: 'formulario' });
  }
  for (const i of insights.filter((x) => x.kind === 'achievement'))
    cands.push({ clientId, sourceType: 'fathom', sourceRef: `insight:${i.id}`, mentionedOn: i.occurred_on, title: i.text, context: `Mencionado en la llamada del ${fmtES(i.occurred_on)}`, link: i.link, basis: i.basis });

  for (const c of cands.sort((a, b) => a.mentionedOn.localeCompare(b.mentionedOn))) {
    if (known.has(`${c.sourceType}:${c.sourceRef}`)) continue;
    const dup = findDuplicate(c, lite);
    let achId: string;
    if (dup) {
      achId = dup.id;
      const d = lite.find((x) => x.id === dup.id)!;
      d.lastMentionedOn = c.mentionedOn > d.lastMentionedOn ? c.mentionedOn : d.lastMentionedOn;
      d.mentions += 1;
      await db.from('achievements').update({ last_mentioned_on: d.lastMentionedOn, mentions_count: d.mentions, updated_at: new Date().toISOString() }).eq('id', achId);
    } else {
      const cat = categorize(c.title);
      const { data, error } = await db.from('achievements').insert({ client_id: clientId, title: c.title, category: cat, achieved_on: c.achievedOn ?? null, first_mentioned_on: c.mentionedOn, last_mentioned_on: c.mentionedOn }).select('id').single();
      if (error) { await logError('achievements', error); continue; }
      achId = data.id;
      lite.push({ id: achId, clientId, title: c.title, category: cat, firstMentionedOn: c.mentionedOn, lastMentionedOn: c.mentionedOn, mentions: 1 });
    }
    await db.from('achievement_mentions').upsert({ achievement_id: achId, source_type: c.sourceType, source_ref: c.sourceRef, mentioned_on: c.mentionedOn, context: c.context ?? null, quote: c.quote ?? null, link: c.link ?? null, basis: c.basis ?? null }, { onConflict: 'source_type,source_ref', ignoreDuplicates: true });
    known.add(`${c.sourceType}:${c.sourceRef}`);
  }
}

async function syncCommitments(clientId: string, calls: any[], insights: InsightRow[], activeClient: boolean) {
  const db = adminDb();
  const lastOn = calls.length ? String(calls[calls.length - 1].recorded_at).slice(0, 10) : null;
  const coach = coachEmails();
  const rows: any[] = [];
  for (const call of calls) {
    const items: any[] = call.action_items ?? [];
    const on = String(call.recorded_at).slice(0, 10);
    const fromInsights = insights.filter((x) => x.call_id === call.id && (x.kind === 'client_commitment' || x.kind === 'coach_commitment'));
    if (items.length && !fromInsights.length) {
      for (const a of items) {
        const owner = a.assigneeEmail && coach.includes(a.assigneeEmail) ? 'coach' : a.assigneeEmail ? 'client' : /miguel/i.test(a.assigneeName ?? '') ? 'coach' : null;
        if (!owner) continue;
        rows.push({ client_id: clientId, owner, text: a.description, source_type: 'fathom', source_ref: call.id, source_link: a.link ?? call.call_url, made_on: on, fingerprint: fingerprint('ai', call.id, a.description), status: a.completed ? 'done' : 'open' });
      }
    } else {
      for (const i of fromInsights)
        rows.push({ client_id: clientId, owner: i.kind === 'coach_commitment' ? 'coach' : 'client', text: i.text, source_type: 'fathom', source_ref: call.id, source_link: i.link, made_on: i.occurred_on, fingerprint: fingerprint('ins', i.id) });
    }
  }
  // Compromisos de llamadas anteriores a la última (o de clientes archivados) se guardan como histórico, no como pendientes.
  for (const r of rows) {
    r.status ??= 'open'; r.done_at ??= null; r.done_note ??= null;
    if (r.status === 'open' && (!activeClient || (lastOn && r.made_on < lastOn))) { r.status = 'done'; r.done_at = new Date().toISOString(); r.done_note = 'Histórico (importado)'; }
  }
  if (rows.length) await db.from('commitments').upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true });
}

/** Recalcula todo lo derivado de un cliente: análisis, logros, compromisos, advertencias y borrador de WhatsApp. Idempotente. */
export async function refreshClientAlerts(clientId: string) {
  const db = adminDb();
  const today = todayISO();
  const { data: client } = await db.from('clients').select('*').eq('id', clientId).single();
  if (!client) return;
  const [{ data: programs }, { data: rows }, { data: insightRows }, { data: calls }, { data: sent }] = await Promise.all([
    db.from('program_status').select('*').eq('client_id', clientId).order('start_date'),
    db.from('checkins').select('*').eq('client_id', clientId).order('submitted_at'),
    db.from('call_insights').select('*').eq('client_id', clientId).order('occurred_on'),
    db.from('calls').select('id,recorded_at,call_url,action_items').eq('client_id', clientId).order('recorded_at'),
    db.from('whatsapp_messages').select('id,sent_at,topics,status').eq('client_id', clientId).eq('status', 'sent'),
  ]);
  const program = programs?.[programs.length - 1] ?? null;
  const recs = (rows ?? []).map(rowToRecord);
  const insights = (insightRows ?? []) as InsightRow[];

  // 1) Análisis semanal de cada check-in
  const analyses = recs.map((c, i) => analyzeCheckin(c, recs.slice(0, i).reverse()));
  for (const a of analyses)
    await db.from('analyses').upsert({ client_id: clientId, checkin_id: a.checkinId, level: a.level, needs_action: a.needsAction,
      reasons: { signals: a.signals, comparisons: a.comparisons, textsToReview: a.textsToReview, dataNotes: a.dataNotes }, positives: a.positives }, { onConflict: 'checkin_id' });

  // 2) Logros y compromisos
  await syncAchievements(clientId, recs, insights);
  const activeClient = client.status === 'active' || client.status === 'upcoming';
  await syncCommitments(clientId, calls ?? [], insights, activeClient);
  if (!activeClient) return; // clientes archivados: solo análisis, logros e histórico; sin advertencias ni borradores

  // 3) Evidencias → advertencias
  const evs: Evidence[] = [];
  recs.forEach((c, i) => evs.push(...checkinEvidence(clientId, c, i ? recs[i - 1] : null)));
  insights.forEach((i) => { const e = insightEvidence(i); if (e) evs.push(e); });
  for (const m of sent ?? []) if (m.sent_at)
    evs.push({ key: `whatsapp:${m.id}`, clientId, scopeKey: `${clientId}:client_request`, category: 'client_request', title: 'Petición del cliente', polarity: 'improvement', severity: 'info',
      observedOn: String(m.sent_at).slice(0, 10), sourceType: 'manual', sourceRef: m.id, basis: 'mensaje enviado', text: 'Respuesta enviada por WhatsApp' });
  const lastCallOn = calls?.length ? String(calls[calls.length - 1].recorded_at).slice(0, 10) : null;
  const newer = programs && programs.length > 1 ? programs[programs.length - 1] : null;
  if (programs && programs.length > 1) {
    const prevProgram = programs[programs.length - 2];
    evs.push(...systemEvidence({ clientId, today, lastCheckinOn: null, programStart: null, lastCallOn, program: prevProgram, newerProgramId: newer!.id, status: 'finished' }));
  }
  evs.push(...systemEvidence({ clientId, today, lastCheckinOn: recs.length ? recs[recs.length - 1].submittedAt.slice(0, 10) : null, programStart: program?.start_date ?? null, lastCallOn, program, newerProgramId: null, status: client.status }));
  await applyEvidenceBatch(clientId, evs);

  // 4) Borrador de WhatsApp (solo último check-in, solo si necesita acción) con contexto de llamadas, logros y compromisos
  const latest = analyses[analyses.length - 1];
  const active = client.status === 'active' || client.status === 'upcoming';
  if (latest && active && latest.needsAction && diffDays(today, latest.date) <= 14) {
    const { data: an } = await db.from('analyses').select('id').eq('checkin_id', latest.checkinId).single();
    const { data: existing } = await db.from('whatsapp_messages').select('id').eq('analysis_id', an!.id).maybeSingle();
    if (!existing) {
      const since21 = addDays(today, -21), since14 = addDays(today, -14);
      const [{ data: achs }, { data: issueRows }, { data: commits }] = await Promise.all([
        db.from('achievements').select('title,last_mentioned_on').eq('client_id', clientId).eq('hidden', false).gte('last_mentioned_on', since14).order('last_mentioned_on', { ascending: false }),
        db.from('issues').select('category,status').eq('client_id', clientId),
        db.from('commitments').select('text').eq('client_id', clientId).eq('owner', 'coach').eq('status', 'open'),
      ]);
      const activeCats = new Set((issueRows ?? []).filter((r) => ['new', 'pending', 'monitoring'].includes(r.status)).map((r) => r.category));
      const draft = draftWhatsApp(client.full_name.split(' ')[0], latest, {
        daysRemaining: program?.days_remaining,
        recentAchievements: (achs ?? []).map((a) => ({ title: a.title, on: fmtES(a.last_mentioned_on) })),
        lifeContext: insights.filter((i) => ['life_change', 'availability', 'incident'].includes(i.kind) && !(i as any).sensitive && i.occurred_on >= since21).map((i) => ({ text: i.text, on: fmtES(i.occurred_on) })),
        resolvedCategories: [...new Set((issueRows ?? []).filter((r) => r.status === 'resolved' && !activeCats.has(r.category)).map((r) => r.category))],
        recentTopics: (sent ?? []).filter((m) => m.sent_at && String(m.sent_at).slice(0, 10) >= since21).flatMap((m) => m.topics ?? []),
        openCoachCommitments: (commits ?? []).map((c) => c.text),
      });
      if (draft) await db.from('whatsapp_messages').insert({ client_id: clientId, analysis_id: an!.id, draft: draft.text, topics: draft.topics, context_notes: draft.notes });
    }
  }
}

/** Recalcula todos los clientes. La primera vez archiva lo antiguo y respeta lo que ya marcaste como hecho en la versión anterior. */
export async function refreshAll() {
  const db = adminDb();
  const { data } = await db.from('clients').select('id');
  for (const c of data ?? []) {
    try { await refreshClientAlerts(c.id); } catch (e) { await logError('refresh', e, { client: c.id }); }
  }
  const { data: flag } = await db.from('app_settings').select('value').eq('key', 'issues_initialized').maybeSingle();
  if (!flag) await initializeIssues();
  return data?.length ?? 0;
}

async function initializeIssues() {
  const db = adminDb();
  const today = todayISO();
  const cutoff = addDays(today, -14);
  const { data: rows } = await db.from('issues').select('*').eq('status', 'new');
  let archived = 0, legacy = 0;
  for (const r of rows ?? []) {
    const s = rowToIssue(r);
    const t = archiveIfStale(s, cutoff);
    if (t) {
      archived++;
      await db.from('issues').update(issueToRow(s)).eq('id', r.id);
      await db.from('issue_events').insert({ issue_id: r.id, actor: 'system', from_status: t.from, to_status: t.to, note: t.note });
    }
  }
  // Lo marcado como "hecho" en la versión anterior (tabla alerts) se respeta
  const { data: done } = await db.from('alerts').select('dedupe_key,client_id,resolved_at,kind').eq('status', 'done');
  for (const a of done ?? []) {
    const m = a.dedupe_key.match(/^checkin:(.+)$/);
    const sourceRef = m?.[1];
    const { data: active } = await db.from('issues').select('*').eq('client_id', a.client_id).in('status', ['new', 'pending', 'monitoring']);
    for (const r of active ?? []) {
      let match = false;
      if (sourceRef) {
        const { data: ev } = await db.from('issue_evidence').select('source_ref,observed_on').eq('issue_id', r.id).eq('polarity', 'problem').order('observed_on', { ascending: false }).limit(1);
        match = ev?.[0]?.source_ref === sourceRef;
      } else if (a.kind === 'data_issue') match = r.category === 'crm_data';
      if (!match) continue;
      legacy++;
      const on = String(a.resolved_at ?? new Date().toISOString()).slice(0, 10);
      await db.from('issues').update({ status: 'resolved', resolved_on: on, resolved_at: a.resolved_at, resolution_kind: 'legacy_done', resolution_note: 'Marcada como hecha en la versión anterior de COACH OS.', status_changed_at: a.resolved_at, updated_at: new Date().toISOString() }).eq('id', r.id);
      await db.from('issue_events').insert({ issue_id: r.id, actor: 'system', from_status: r.status, to_status: 'resolved', note: 'Marcada como hecha en la versión anterior de COACH OS (migración).' });
    }
  }
  // Compromisos de llamadas anteriores a la última de cada cliente: se archivan (Miguel trabaja en orden cronológico)
  const { data: calls } = await db.from('calls').select('client_id,recorded_at').not('client_id', 'is', null);
  const lastCall = new Map<string, string>();
  for (const c of calls ?? []) { const d = String(c.recorded_at).slice(0, 10); if (d > (lastCall.get(c.client_id) ?? '')) lastCall.set(c.client_id, d); }
  let commitmentsArchived = 0;
  for (const [clientId, d] of lastCall) {
    const { data: upd } = await db.from('commitments').update({ status: 'done', done_at: new Date().toISOString(), done_note: 'Archivado al poner en marcha COACH OS: compromiso de una llamada anterior a la última.' })
      .eq('client_id', clientId).eq('status', 'open').eq('source_type', 'fathom').lt('made_on', d).select('id');
    commitmentsArchived += upd?.length ?? 0;
  }
  await db.from('app_settings').upsert({ key: 'issues_initialized', value: { at: new Date().toISOString(), cutoff, archived, legacy, commitmentsArchived } });
}
