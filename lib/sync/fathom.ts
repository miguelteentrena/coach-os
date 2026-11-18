import 'server-only';
import { EXTRACTION_SYSTEM, EXTRACTION_TOOL, ExtractedInsight, fingerprint, matchCall, CrmCallLinks, parseMeeting, validateQuotes } from '../fathom';
import { adminDb, logError } from '../supabase';
import { coachEmails, refreshClientAlerts } from './engine';

const API = 'https://api.fathom.ai/external/v1';

async function fathom<T>(path: string): Promise<T> {
  const key = process.env.FATHOM_API_KEY;
  if (!key) throw new Error('FATHOM_API_KEY no configurada');
  const res = await fetch(`${API}${path}`, { headers: { 'X-Api-Key': key }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Fathom ${path.split('?')[0]}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Enlaces de llamadas pegados en el CRM (llamadas + onboarding) por cliente. */
export async function crmLinks(): Promise<CrmCallLinks[]> {
  const db = adminDb();
  const [{ data: clients }, { data: programs }] = await Promise.all([
    db.from('clients').select('id,email'),
    db.from('programs').select('client_id,call_urls,onboarding_url'),
  ]);
  return (clients ?? []).map((c) => ({
    clientId: c.id, email: c.email,
    urls: (programs ?? []).filter((p) => p.client_id === c.id).flatMap((p) => [...(p.call_urls ?? []), p.onboarding_url].filter(Boolean)),
  }));
}

/** Guarda una reunión de Fathom. Solo se guarda el contenido (resumen, tareas) si la llamada es de un cliente. */
export async function ingestMeeting(raw: any, via: 'webhook' | 'api') {
  const db = adminDb();
  const m = parseMeeting(raw);
  if (!Number.isFinite(m.recordingId)) throw new Error('recording_id ausente');
  const coach = coachEmails();
  const match = matchCall(m, await crmLinks(), coach);
  const { data: existing } = await db.from('calls').select('id,client_id,match_method,extraction_status').eq('fathom_recording_id', m.recordingId).maybeSingle();
  // Privacidad: una llamada con invitados externos que no son clientes (p. ej. un posible cliente) no se guarda.
  // Las llamadas sin invitados («Impromptu») se guardan sin contenido hasta que su enlace aparezca en el CRM.
  if (!existing && !match && m.inviteeEmails.some((e) => !coach.includes(e))) return { id: null, matched: false, skipped: true };
  const clientId = existing?.client_id ?? match?.clientId ?? null;
  const row = {
    fathom_recording_id: m.recordingId, client_id: clientId, match_method: existing?.match_method ?? match?.method ?? null,
    title: m.title, recorded_at: m.recordedAt, call_url: m.url, share_url: m.shareUrl, invitee_emails: m.inviteeEmails,
    summary_md: clientId ? m.summaryMd : null, action_items: clientId ? m.actionItems : [], received_via: via, updated_at: new Date().toISOString(),
  };
  const { data: saved, error } = await db.from('calls').upsert(row, { onConflict: 'fathom_recording_id' }).select('id,client_id,extraction_status').single();
  if (error) throw error;
  if (saved.client_id && saved.extraction_status !== 'done') await extractCall(saved.id);
  if (saved.client_id) await refreshClientAlerts(saved.client_id);
  return { id: saved.id, matched: !!saved.client_id };
}

/** Extracción de información con IA sobre la transcripción (solo si hay ANTHROPIC_API_KEY).
 *  Sin clave: se conserva el resumen y las tareas de Fathom y la llamada queda como «sin extracción». */
export async function extractCall(callId: string) {
  const db = adminDb();
  const { data: call } = await db.from('calls').select('*').eq('id', callId).single();
  if (!call?.client_id) return;
  if (!process.env.ANTHROPIC_API_KEY) {
    await db.from('calls').update({ extraction_status: 'not_configured' }).eq('id', callId);
    return;
  }
  try {
    const t = await fathom<any>(`/recordings/${call.fathom_recording_id}/transcript`);
    const segments: any[] = t.transcript ?? t.items ?? [];
    const coach = coachEmails();
    const text = segments.map((s) => {
      const email = String(s.speaker?.matched_calendar_invitee_email ?? '').toLowerCase();
      const who = coach.includes(email) || /miguel/i.test(s.speaker?.display_name ?? '') ? 'Miguel (entrenador)' : 'Cliente';
      return `[${s.timestamp ?? ''}] ${who}: ${s.text}`;
    }).join('\n');
    if (!text.trim()) throw new Error('Transcripción vacía');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5', max_tokens: 4000, system: EXTRACTION_SYSTEM,
        tools: [EXTRACTION_TOOL], tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
        messages: [{ role: 'user', content: `Transcripción de la llamada del ${String(call.recorded_at).slice(0, 10)}:\n\n${text}` }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const out = await res.json();
    const items: ExtractedInsight[] = out.content?.find((c: any) => c.type === 'tool_use')?.input?.items ?? [];
    const validated = validateQuotes(items, text);
    const on = String(call.recorded_at).slice(0, 10);
    const rows = validated.map((i) => ({
      call_id: callId, client_id: call.client_id, kind: i.kind, speaker: i.speaker, basis: i.basis, text: i.text, quote: i.quote,
      timestamp_sec: i.timestamp_sec ?? null, link: i.timestamp_sec != null && call.call_url ? `${call.call_url}?timestamp=${i.timestamp_sec}` : call.call_url,
      issue_category: i.issue_category ?? null, polarity: i.polarity, sensitive: !!i.sensitive || i.kind === 'health', occurred_on: on,
      fingerprint: fingerprint(i.kind, i.text),
    }));
    if (rows.length) await db.from('call_insights').upsert(rows, { onConflict: 'call_id,fingerprint', ignoreDuplicates: true });
    await db.from('calls').update({ extraction_status: 'done', extraction_basis: 'transcript_llm', extracted_at: new Date().toISOString() }).eq('id', callId);
  } catch (e) {
    await db.from('calls').update({ extraction_status: 'failed' }).eq('id', callId);
    await logError('fathom-extract', e, { callId });
  }
}

/** Reconciliación: el webhook de Fathom se envía una sola vez; esto recupera lo perdido. */
export async function reconcileFathom(trigger: string, days = 30) {
  const db = adminDb();
  const { data: run } = await db.from('sync_runs').insert({ source: 'fathom', trigger }).select('id').single();
  const stats = { fetched: 0, matched: 0, errors: 0 };
  try {
    const after = new Date(Date.now() - days * 86400000).toISOString();
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const q = new URLSearchParams({ created_after: after, include_summary: 'true', include_action_items: 'true' });
      if (cursor) q.set('cursor', cursor);
      const res: any = await fathom<any>(`/meetings?${q}`);
      for (const m of res.items ?? []) {
        stats.fetched++;
        try { const r = await ingestMeeting(m, 'api'); if (r.matched) stats.matched++; } catch (e) { stats.errors++; await logError('fathom-ingest', e, { id: m.recording_id }); }
      }
      cursor = res.next_cursor ?? null;
      if (!cursor) break;
    }
    await db.from('sync_runs').update({ finished_at: new Date().toISOString(), ok: stats.errors === 0, stats }).eq('id', run?.id);
    return stats;
  } catch (e) {
    await db.from('sync_runs').update({ finished_at: new Date().toISOString(), ok: false, error: String((e as Error).message), stats }).eq('id', run?.id);
    throw e;
  }
}

/** Tras sincronizar el CRM: asigna llamadas que aún no tenían cliente (el enlace se pega después de la llamada). */
export async function relinkUnassignedCalls() {
  const db = adminDb();
  const { data: calls } = await db.from('calls').select('id,call_url,share_url,invitee_emails').is('client_id', null);
  if (!calls?.length) return 0;
  const links = await crmLinks();
  let n = 0;
  for (const c of calls) {
    const m = matchCall({ url: c.call_url, shareUrl: c.share_url, inviteeEmails: c.invitee_emails ?? [] }, links, coachEmails());
    if (!m) continue;
    await db.from('calls').update({ client_id: m.clientId, match_method: m.method }).eq('id', c.id);
    n++;
    if (process.env.FATHOM_API_KEY) {
      // recuperar resumen y tareas ahora que sabemos que es de un cliente
      try {
        const { data: row } = await db.from('calls').select('fathom_recording_id').eq('id', c.id).single();
        const s: any = await fathom<any>(`/recordings/${row!.fathom_recording_id}/summary`);
        await db.from('calls').update({ summary_md: s.summary?.markdown_formatted ?? s.markdown_formatted ?? null }).eq('id', c.id);
      } catch (e) { await logError('fathom-relink-summary', e, { callId: c.id }); }
    }
    await extractCall(c.id);
    await refreshClientAlerts(m.clientId);
  }
  return n;
}
