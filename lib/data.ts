import 'server-only';
import { integrationStatus, userDb } from './supabase';

export type Level = 'red' | 'yellow' | 'green';

export interface ClientSummary {
  id: string; full_name: string; email: string | null; status: string;
  program: any | null; lastCheckin: any | null; lastAnalysis: any | null; openAlerts: number;
}

export const dbReady = () => integrationStatus().supabase;

export async function getClients(): Promise<ClientSummary[]> {
  const db = userDb();
  const [{ data: clients }, { data: programs }, { data: checkins }, { data: analyses }, { data: alerts }] = await Promise.all([
    db.from('clients').select('id,full_name,email,status').order('full_name'),
    db.from('program_status').select('*').order('start_date'),
    db.from('checkins').select('id,client_id,submitted_at,week_start').order('submitted_at', { ascending: false }),
    db.from('analyses').select('id,client_id,checkin_id,level,needs_action,reasons,positives,created_at'),
    db.from('alerts').select('id,client_id').eq('status', 'open'),
  ]);
  return (clients ?? []).map((c) => {
    const progs = (programs ?? []).filter((p) => p.client_id === c.id);
    const last = (checkins ?? []).find((k) => k.client_id === c.id) ?? null;
    return {
      ...c,
      program: progs[progs.length - 1] ?? null,
      lastCheckin: last,
      lastAnalysis: last ? (analyses ?? []).find((a) => a.checkin_id === last.id) ?? null : null,
      openAlerts: (alerts ?? []).filter((a) => a.client_id === c.id).length,
    };
  });
}

export async function getClient(id: string) {
  const db = userDb();
  const [{ data: client }, { data: programs }, { data: checkins }, { data: analyses }, { data: adjustments }, { data: alerts }] = await Promise.all([
    db.from('clients').select('*').eq('id', id).single(),
    db.from('program_status').select('*').eq('client_id', id).order('start_date'),
    db.from('checkins').select('*').eq('client_id', id).order('submitted_at'),
    db.from('analyses').select('*').eq('client_id', id),
    db.from('program_adjustments').select('*, programs!inner(client_id)').eq('programs.client_id', id),
    db.from('alerts').select('*').eq('client_id', id).eq('status', 'open').order('created_at', { ascending: false }),
  ]);
  return { client, programs: programs ?? [], checkins: checkins ?? [], analyses: analyses ?? [], adjustments: adjustments ?? [], alerts: alerts ?? [] };
}

export async function getCheckins() {
  const db = userDb();
  const [{ data: checkins }, { data: analyses }, { data: clients }, { data: reviews }] = await Promise.all([
    db.from('checkins').select('id,client_id,submitted_name,submitted_at,week_start,received_via,adherence,sessions,weight_kg').order('submitted_at', { ascending: false }).limit(300),
    db.from('analyses').select('checkin_id,level,needs_action,reasons'),
    db.from('clients').select('id,full_name'),
    db.from('identity_reviews').select('*').is('resolved_at', null),
  ]);
  return { checkins: checkins ?? [], analyses: analyses ?? [], clients: clients ?? [], reviews: reviews ?? [] };
}

export async function getAlerts() {
  const { data } = await userDb().from('alerts').select('*, clients(full_name)').eq('status', 'open').order('created_at', { ascending: false });
  return data ?? [];
}

export async function getMessages() {
  const { data } = await userDb().from('whatsapp_messages').select('*, clients(full_name,phone), analyses(level,reasons)').order('created_at', { ascending: false }).limit(100);
  return data ?? [];
}

export async function getOps() {
  const db = userDb();
  const [{ data: runs }, { data: errors }] = await Promise.all([
    db.from('sync_runs').select('*').order('started_at', { ascending: false }).limit(20),
    db.from('error_log').select('*').order('at', { ascending: false }).limit(20),
  ]);
  return { runs: runs ?? [], errors: errors ?? [] };
}

// ───────── v2.1: advertencias, logros, llamadas, compromisos ─────────
export async function getIssues(opts: { clientId?: string } = {}) {
  const db = userDb();
  let q = db.from('issues').select('*, clients(full_name)').order('last_evidence_on', { ascending: false });
  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  const { data: issues } = await q;
  const ids = (issues ?? []).map((i) => i.id);
  const [{ data: evidence }, { data: events }] = ids.length
    ? await Promise.all([
        db.from('issue_evidence').select('*').in('issue_id', ids).order('observed_on', { ascending: false }),
        db.from('issue_events').select('*').in('issue_id', ids).order('at', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];
  return (issues ?? []).map((i) => ({
    ...i,
    evidence: (evidence ?? []).filter((e) => e.issue_id === i.id),
    events: (events ?? []).filter((e) => e.issue_id === i.id),
  }));
}

export async function getAchievements(opts: { clientId?: string } = {}) {
  const db = userDb();
  let q = db.from('achievements').select('*, clients(full_name)').eq('hidden', false).order('last_mentioned_on', { ascending: false });
  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  const { data: achs } = await q;
  const ids = (achs ?? []).map((a) => a.id);
  const { data: mentions } = ids.length ? await db.from('achievement_mentions').select('*').in('achievement_id', ids).order('mentioned_on') : { data: [] };
  return (achs ?? []).map((a) => ({ ...a, mentions: (mentions ?? []).filter((m) => m.achievement_id === a.id) }));
}

export async function getCalls(opts: { clientId?: string } = {}) {
  const db = userDb();
  let q = db.from('calls').select('id,client_id,title,recorded_at,call_url,share_url,match_method,extraction_status,extraction_basis,summary_md,invitee_emails, clients(full_name)').order('recorded_at', { ascending: false }).limit(200);
  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  const { data: calls } = await q;
  const ids = (calls ?? []).map((c) => c.id);
  const { data: insights } = ids.length ? await db.from('call_insights').select('*').in('call_id', ids).order('timestamp_sec') : { data: [] };
  return (calls ?? []).map((c) => ({ ...c, insights: (insights ?? []).filter((i) => i.call_id === c.id) }));
}

export async function getCommitments(opts: { clientId?: string; owner?: 'coach' | 'client'; status?: string } = {}) {
  let q = userDb().from('commitments').select('*, clients(full_name)').order('made_on', { ascending: false });
  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  if (opts.owner) q = q.eq('owner', opts.owner);
  if (opts.status) q = q.eq('status', opts.status);
  const { data } = await q;
  return data ?? [];
}
