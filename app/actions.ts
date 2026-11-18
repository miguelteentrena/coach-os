'use server';
import { revalidatePath } from 'next/cache';
import { adminDb, userDb } from '@/lib/supabase';
import { issueToRow, refreshClientAlerts, rowToIssue } from '@/lib/sync/engine';
import { manualTransition, ManualAction } from '@/lib/issues';
import { todayISO } from '@/lib/dates';

async function requireCoach() {
  const db = userDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data } = await db.from('coach_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!data) throw new Error('Sin permiso');
  return user;
}
async function audit(actor: string, action: string, entity: string, entityId: string, diff?: object) {
  await adminDb().from('audit_log').insert({ actor, action, entity, entity_id: entityId, diff: diff ?? null });
}

export async function setAlertStatus(id: string, status: 'done' | 'dismissed') {
  const u = await requireCoach();
  await userDb().from('alerts').update({ status, resolved_at: new Date().toISOString() }).eq('id', id);
  await audit(u.id, `alert_${status}`, 'alert', id);
  revalidatePath('/', 'layout');
}

export async function saveMessage(id: string, edited: string) {
  const u = await requireCoach();
  await userDb().from('whatsapp_messages').update({ edited }).eq('id', id);
  await audit(u.id, 'message_edit', 'whatsapp_message', id);
  revalidatePath('/whatsapp');
}

/** Solo MARCA como enviado: COACH OS nunca envía mensajes. */
export async function setMessageStatus(id: string, status: 'sent' | 'discarded' | 'draft') {
  const u = await requireCoach();
  await userDb().from('whatsapp_messages').update({ status, sent_at: status === 'sent' ? new Date().toISOString() : null }).eq('id', id);
  await audit(u.id, `message_${status}`, 'whatsapp_message', id);
  const { data: m } = await adminDb().from('whatsapp_messages').select('client_id').eq('id', id).single();
  if (m?.client_id) await refreshClientAlerts(m.client_id);
  revalidatePath('/', 'layout');
}

/** Identificación manual de un check-in. Si addAlias, el nombre enviado queda como alias confirmado. */
export async function resolveIdentity(reviewId: string, clientId: string, addAlias: boolean) {
  const u = await requireCoach();
  const db = adminDb();
  const { data: r } = await db.from('identity_reviews').select('*').eq('id', reviewId).single();
  if (!r) throw new Error('Revisión no encontrada');
  await db.from('checkins').update({ client_id: clientId }).eq('id', r.checkin_id);
  await db.from('identity_reviews').update({ resolved_client_id: clientId, resolved_at: new Date().toISOString() }).eq('id', reviewId);
  if (addAlias && r.submitted_name) {
    const { data: c } = await db.from('clients').select('aliases').eq('id', clientId).single();
    if (c && !c.aliases.includes(r.submitted_name)) await db.from('clients').update({ aliases: [...c.aliases, r.submitted_name] }).eq('id', clientId);
  }
  await audit(u.id, 'identity_resolve', 'checkin', r.checkin_id, { clientId, alias: addAlias ? r.submitted_name : null });
  await refreshClientAlerts(clientId);
  revalidatePath('/', 'layout');
}

export async function addAdjustment(form: FormData) {
  const u = await requireCoach();
  const programId = String(form.get('program_id'));
  const kind = String(form.get('kind')) as 'pause' | 'extension' | 'reduction';
  const days = Number(form.get('days'));
  if (!['pause', 'extension', 'reduction'].includes(kind) || !Number.isInteger(days) || days <= 0 || days > 365) throw new Error('Ajuste no válido');
  const row = { program_id: programId, kind, days, starts_on: (form.get('starts_on') as string) || null, note: (form.get('note') as string) || null };
  const { data } = await userDb().from('program_adjustments').insert(row).select('id, programs(client_id)').single();
  await audit(u.id, 'adjustment_add', 'program', programId, row);
  const clientId = (data as any)?.programs?.client_id;
  if (clientId) await refreshClientAlerts(clientId);
  revalidatePath('/', 'layout');
}

export async function signOut() {
  await userDb().auth.signOut();
}

// ───────── v2.1 ─────────

/** Cambia el estado de una advertencia con nota. Queda en el historial (issue_events + audit_log). */
export async function issueAction(id: string, action: ManualAction, note?: string) {
  const u = await requireCoach();
  const db = adminDb();
  const { data: row } = await db.from('issues').select('*').eq('id', id).single();
  if (!row) throw new Error('Advertencia no encontrada');
  const { state, transition } = manualTransition(rowToIssue(row), action, todayISO(), note?.trim() || undefined);
  await db.from('issues').update({ ...issueToRow(state), status_changed_at: new Date().toISOString(), reviewed_at: row.reviewed_at ?? new Date().toISOString(),
    resolved_at: ['resolved', 'dismissed'].includes(state.status) ? new Date().toISOString() : null }).eq('id', id);
  await db.from('issue_events').insert({ issue_id: id, actor: u.id, from_status: transition.from, to_status: transition.to, note: transition.note });
  await audit(u.id, `issue_${action}`, 'issue', id, { note: note ?? null });
  revalidatePath('/', 'layout');
}

export async function setCommitment(id: string, status: 'open' | 'done' | 'dropped', note?: string) {
  const u = await requireCoach();
  await userDb().from('commitments').update({ status, done_at: status === 'open' ? null : new Date().toISOString(), done_note: note ?? null }).eq('id', id);
  await audit(u.id, `commitment_${status}`, 'commitment', id, { note: note ?? null });
  revalidatePath('/', 'layout');
}

/** Oculta un logro (falso positivo). No se borra: queda en la base de datos. */
export async function setAchievementHidden(id: string, hidden: boolean) {
  const u = await requireCoach();
  await userDb().from('achievements').update({ hidden }).eq('id', id);
  await audit(u.id, hidden ? 'achievement_hide' : 'achievement_show', 'achievement', id);
  revalidatePath('/', 'layout');
}

/** Asigna manualmente una llamada sin cliente y lanza la extracción. */
export async function assignCall(callId: string, clientId: string) {
  const u = await requireCoach();
  const db = adminDb();
  await db.from('calls').update({ client_id: clientId, match_method: 'manual' }).eq('id', callId);
  await audit(u.id, 'call_assign', 'call', callId, { clientId });
  const { extractCall } = await import('@/lib/sync/fathom');
  await extractCall(callId);
  await refreshClientAlerts(clientId);
  revalidatePath('/', 'layout');
}
