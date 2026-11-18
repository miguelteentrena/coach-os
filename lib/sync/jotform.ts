import 'server-only';
import { JOTFORM_FORM_ID, JotformSubmission, matchClient, parseSubmission } from '../jotform';
import { adminDb, logError } from '../supabase';
import { refreshClientAlerts } from './engine';

const API = process.env.JOTFORM_API_BASE ?? 'https://api.jotform.com'; // cuentas EU: https://eu-api.jotform.com

async function jf<T>(path: string): Promise<T> {
  const key = process.env.JOTFORM_API_KEY;
  if (!key) throw new Error('JOTFORM_API_KEY no configurada');
  const res = await fetch(`${API}${path}`, { headers: { APIKEY: key }, cache: 'no-store' }); // cabecera: la clave no queda en URLs ni logs
  const json = await res.json();
  if (!res.ok || json.responseCode !== 200) throw new Error(`Jotform ${path.split('?')[0]}: ${json.message ?? res.status}`);
  return json.content as T;
}

export const getSubmission = (id: string) => jf<JotformSubmission>(`/submission/${id}`);

export async function listAllSubmissions(formId = JOTFORM_FORM_ID, sinceISO?: string): Promise<JotformSubmission[]> {
  const out: JotformSubmission[] = [];
  const filter = sinceISO ? `&filter=${encodeURIComponent(JSON.stringify({ 'created_at:gt': sinceISO.replace('T', ' ').slice(0, 19) }))}` : '';
  for (let offset = 0; ; offset += 1000) {
    const page = await jf<JotformSubmission[]>(`/form/${formId}/submissions?limit=1000&offset=${offset}&orderby=created_at${filter}`);
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out.filter((s) => s.status !== 'DELETED');
}

/** Ingesta idempotente de un envío (webhook, histórico o reconciliación). */
export async function ingestSubmission(s: JotformSubmission, via: 'webhook' | 'api_backfill' | 'api_reconcile') {
  const db = adminDb();
  if (s.form_id !== JOTFORM_FORM_ID && s.form_id !== process.env.JOTFORM_FORM_ID) throw new Error(`Formulario inesperado ${s.form_id}`);
  const p = parseSubmission(s);
  const { data: clients } = await db.from('clients').select('id,email,full_name,aliases');
  const m = matchClient(p, clients ?? []);
  const row = {
    jotform_submission_id: p.submissionId, form_id: p.formId, client_id: m.kind === 'matched' ? m.clientId : null,
    submitted_name: p.name, submitted_at: p.submittedAt, week_start: p.weekStart, ...p.values, ...p.texts,
    raw: s, received_via: via,
  };
  const { data: existing } = await db.from('checkins').select('id,client_id').eq('jotform_submission_id', p.submissionId).maybeSingle();
  // Si ya existía y estaba identificado manualmente, no se pisa la identificación
  if (existing?.client_id) row.client_id = existing.client_id;
  const { data: saved, error } = await db.from('checkins').upsert(row, { onConflict: 'jotform_submission_id' }).select('id,client_id').single();
  if (error) throw error;

  if (!saved.client_id && m.kind === 'review') {
    const { data: open } = await db.from('identity_reviews').select('id').eq('checkin_id', saved.id).is('resolved_at', null).maybeSingle();
    if (!open) await db.from('identity_reviews').insert({ checkin_id: saved.id, submitted_name: p.name, candidates: m.candidates, reason: m.reason });
  }
  if (p.unmappedLabels.length) await logError('jotform-map', `Preguntas sin mapear: ${p.unmappedLabels.join(' | ')}`, { submission: p.submissionId });
  if (saved.client_id) await refreshClientAlerts(saved.client_id);
  return { id: saved.id, matched: !!saved.client_id, isNew: !existing };
}

export async function syncJotform(trigger: string, mode: 'backfill' | 'reconcile') {
  const db = adminDb();
  const { data: run } = await db.from('sync_runs').insert({ source: 'jotform', trigger }).select('id').single();
  const stats = { fetched: 0, new: 0, unmatched: 0, errors: 0 };
  try {
    const since = mode === 'reconcile' ? new Date(Date.now() - 21 * 86400000).toISOString() : undefined;
    const subs = await listAllSubmissions(process.env.JOTFORM_FORM_ID ?? JOTFORM_FORM_ID, since);
    stats.fetched = subs.length;
    for (const s of subs) {
      try {
        const r = await ingestSubmission(s, mode === 'backfill' ? 'api_backfill' : 'api_reconcile');
        if (r.isNew) stats.new++;
        if (!r.matched) stats.unmatched++;
      } catch (e) { stats.errors++; await logError('jotform-ingest', e, { id: s.id }); }
    }
    await db.from('sync_runs').update({ finished_at: new Date().toISOString(), ok: stats.errors === 0, stats }).eq('id', run?.id);
    return stats;
  } catch (e) {
    await db.from('sync_runs').update({ finished_at: new Date().toISOString(), ok: false, error: String((e as Error).message), stats }).eq('id', run?.id);
    await logError('jotform-sync', e);
    throw e;
  }
}
