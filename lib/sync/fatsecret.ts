import 'server-only';
import { FS_API, FS_AUTH, parseEntries, parseMonth, parseWeights, signedParams, toDateInt } from '../fatsecret';
import { addDays, todayISO } from '../dates';
import { adminDb, logError } from '../supabase';

const keys = () => {
  const key = process.env.FATSECRET_CONSUMER_KEY, secret = process.env.FATSECRET_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('FatSecret no configurado (FATSECRET_CONSUMER_KEY / FATSECRET_CONSUMER_SECRET)');
  return { key, secret };
};
const form = (t: string) => Object.fromEntries(new URLSearchParams(t));

/** Paso 1: token temporal y URL de autorización para el enlace de un cliente. */
export async function startAuthorization(inviteId: string, callbackUrl: string) {
  const url = `${FS_AUTH}/request_token`;
  const p = signedParams('POST', url, { oauth_callback: callbackUrl }, keys());
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(p), cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) throw new Error(`FatSecret request_token ${res.status}: ${text.slice(0, 200)}`);
  const r = form(text);
  if (!r.oauth_token || !r.oauth_token_secret) throw new Error(`FatSecret request_token sin token: ${text.slice(0, 200)}`);
  await adminDb().from('fatsecret_requests').insert({ oauth_token: r.oauth_token, token_secret: r.oauth_token_secret, invite_id: inviteId });
  return `${FS_AUTH}/authorize?oauth_token=${encodeURIComponent(r.oauth_token)}`;
}

/** Paso 3: intercambia el verificador por el permiso permanente y lo guarda en el cliente. */
export async function finishAuthorization(oauthToken: string, verifier: string) {
  const db = adminDb();
  const { data: req } = await db.from('fatsecret_requests').select('token_secret, invite_id, fatsecret_invites(client_id, used_at, expires_at)').eq('oauth_token', oauthToken).maybeSingle();
  const inv: any = (req as any)?.fatsecret_invites;
  if (!req || !inv) throw new Error('Enlace no válido o caducado');
  if (inv.used_at || new Date(inv.expires_at) < new Date()) throw new Error('Este enlace ya se usó o ha caducado');
  const url = `${FS_AUTH}/access_token`;
  const p = signedParams('GET', url, { oauth_verifier: verifier }, keys(), { token: oauthToken, secret: req.token_secret });
  const res = await fetch(`${url}?${new URLSearchParams(p)}`, { cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) throw new Error(`FatSecret access_token ${res.status}: ${text.slice(0, 200)}`);
  const r = form(text);
  if (!r.oauth_token || !r.oauth_token_secret) throw new Error(`FatSecret access_token sin token: ${text.slice(0, 200)}`);
  await db.from('fatsecret_links').upsert({ client_id: inv.client_id, access_token: r.oauth_token, access_secret: r.oauth_token_secret, connected_at: new Date().toISOString(), active: true, last_error: null });
  await db.from('fatsecret_invites').update({ used_at: new Date().toISOString() }).eq('id', req.invite_id);
  await db.from('fatsecret_requests').delete().eq('oauth_token', oauthToken);
  await db.from('audit_log').insert({ actor: 'client:fatsecret', action: 'fatsecret_connect', entity: 'client', entity_id: inv.client_id });
  return inv.client_id as string;
}

async function api(method: string, params: Record<string, string>, token: { token: string; secret: string }) {
  const p = signedParams('GET', FS_API, { method, format: 'json', ...params }, keys(), token);
  const res = await fetch(`${FS_API}?${new URLSearchParams(p)}`, { cache: 'no-store' });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) throw new Error(`FatSecret ${method}: ${json?.error?.message ?? res.status}`);
  return json;
}

/** Lee el diario (mes actual y anterior), las comidas de los últimos `detailDays` días y el peso. */
export async function syncClient(clientId: string, detailDays = 10) {
  const db = adminDb();
  const { data: link } = await db.from('fatsecret_links').select('*').eq('client_id', clientId).eq('active', true).maybeSingle();
  if (!link) return { days: 0, weights: 0 };
  const token = { token: link.access_token, secret: link.access_secret };
  try {
    const today = todayISO();
    const prevMonth = addDays(today.slice(0, 8) + '01', -1);
    const months = [prevMonth, today];
    const totals = (await Promise.all(months.map((d) => api('food_entries.get_month', { date: String(toDateInt(d)) }, token)))).flatMap(parseMonth);
    const meals = new Map<string, any>();
    for (let i = 0; i < detailDays; i++) {
      const d = addDays(today, -i);
      if (!totals.some((t) => t.day === d)) continue;
      meals.set(d, parseEntries(await api('food_entries.get', { date: String(toDateInt(d)) }, token)));
    }
    const rows = totals.map((t) => ({ client_id: clientId, ...t, ...(meals.has(t.day) ? { meals: meals.get(t.day) } : {}), synced_at: new Date().toISOString() }));
    for (const r of rows) await db.from('nutrition_days').upsert(r, { onConflict: 'client_id,day' });
    const weights = (await Promise.all(months.map((d) => api('weights.get_month', { date: String(toDateInt(d)) }, token)))).flatMap(parseWeights);
    if (weights.length) await db.from('measurements').upsert(weights.map((w) => ({
      client_id: clientId, measured_on: w.day, metric: 'weight_kg', value: w.kg, source_type: 'fatsecret', source_ref: 'fatsecret', basis: 'registro del cliente', note: w.comment,
    })), { onConflict: 'client_id,metric,measured_on,source_type,source_ref' });
    await db.from('fatsecret_links').update({ last_sync_at: new Date().toISOString(), last_error: null }).eq('client_id', clientId);
    return { days: rows.length, weights: weights.length };
  } catch (e) {
    await db.from('fatsecret_links').update({ last_error: String((e as Error).message).slice(0, 300) }).eq('client_id', clientId);
    await logError('fatsecret-sync', e, { clientId });
    throw e;
  }
}

export async function syncAllFatsecret(trigger: string) {
  const db = adminDb();
  const { data: run } = await db.from('sync_runs').insert({ source: 'fatsecret', trigger }).select('id').single();
  const { data: links } = await db.from('fatsecret_links').select('client_id').eq('active', true);
  const stats = { clients: links?.length ?? 0, ok: 0, errors: 0, days: 0 };
  for (const l of links ?? []) {
    try { const r = await syncClient(l.client_id); stats.ok++; stats.days += r.days; } catch { stats.errors++; }
  }
  await db.from('sync_runs').update({ finished_at: new Date().toISOString(), ok: stats.errors === 0, stats }).eq('id', run?.id);
  return stats;
}
