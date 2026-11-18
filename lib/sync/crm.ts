import 'server-only';
import { createSign } from 'crypto';
import { groupClients, parseCrm, SheetRow } from '../crm';
import { clientRecord, programRecord } from '../crm-map';
import { adminDb, logError } from '../supabase';
import { refreshClientAlerts } from './engine';

export const CRM_SHEET_RANGE = "'Gestión de Clientes'!A1:AE1000";
export const CRM_FIELDS = 'sheets.data.rowData.values(formattedValue,hyperlink,userEnteredValue,chipRuns)';

/** Lectura directa vía Sheets API con cuenta de servicio (respaldo diario / sincronización manual). */
export async function fetchCrmRows(): Promise<SheetRow[]> {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? 'null');
  const id = process.env.CRM_SPREADSHEET_ID;
  if (!sa || !id) throw new Error('Lectura del CRM no configurada (GOOGLE_SERVICE_ACCOUNT_JSON / CRM_SPREADSHEET_ID)');
  const token = await googleAccessToken(sa, 'https://www.googleapis.com/auth/spreadsheets.readonly');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}?includeGridData=true&ranges=${encodeURIComponent(CRM_SHEET_RANGE)}&fields=${encodeURIComponent(CRM_FIELDS)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.sheets?.[0]?.data?.[0]?.rowData ?? [];
}

async function googleAccessToken(sa: { client_email: string; private_key: string }, scope: string) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}`);
  return (await res.json()).access_token as string;
}

export interface CrmSyncStats { rows: number; clientsCreated: number; clientsUpdated: number; programsCreated: number; programsUpdated: number; unchanged: number; issues: number }

/** Importa/actualiza desde el CRM. Idempotente: compara hash por fila. Nunca borra. */
export async function syncCrm(rows: SheetRow[], trigger: string): Promise<CrmSyncStats> {
  const db = adminDb();
  const { data: run } = await db.from('sync_runs').insert({ source: 'crm', trigger }).select('id').single();
  const stats: CrmSyncStats = { rows: 0, clientsCreated: 0, clientsUpdated: 0, programsCreated: 0, programsUpdated: 0, unchanged: 0, issues: 0 };
  try {
    const { programs, headerIssues } = parseCrm(rows);
    if (headerIssues.length) throw new Error(headerIssues.join('; '));
    stats.rows = programs.length;
    const touched = new Set<string>();

    for (const c of groupClients(programs)) {
      const base = clientRecord(c);
      const nk = base.name_key;

      // Buscar cliente existente: por email; si no hay email, por nombre normalizado SIN email
      let q = db.from('clients').select('*');
      q = c.email ? q.eq('email', c.email) : q.is('email', null).eq('name_key', nk);
      const { data: existing } = await q.maybeSingle();
      const payload = { ...base, crm_last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      let clientId: string;
      if (!existing) {
        const { data, error } = await db.from('clients').insert(payload).select('id').single();
        if (error) throw error;
        clientId = data.id; stats.clientsCreated++;
        await db.from('audit_log').insert({ actor: `system:crm-${trigger}`, action: 'create', entity: 'client', entity_id: clientId, diff: payload });
      } else {
        clientId = existing.id;
        const diff = Object.fromEntries(Object.entries(payload).filter(([k, v]) => !['crm_last_seen_at', 'updated_at'].includes(k) && existing[k] !== v));
        await db.from('clients').update(payload).eq('id', clientId);
        if (Object.keys(diff).length) {
          stats.clientsUpdated++;
          await db.from('audit_log').insert({ actor: `system:crm-${trigger}`, action: 'update', entity: 'client', entity_id: clientId, diff });
        }
      }

      for (const p of c.programs) {
        const row = { ...programRecord(clientId, p, p === c.programs[c.programs.length - 1] ? c.issues : []), updated_at: new Date().toISOString() };
        stats.issues += row.data_issues.length;
        const programKey = row.program_key;
        const { data: ex } = await db.from('programs').select('id,crm_row_hash').eq('program_key', programKey).maybeSingle();
        if (!ex) { await db.from('programs').insert(row); stats.programsCreated++; }
        else if (ex.crm_row_hash !== p.hash) { await db.from('programs').update(row).eq('id', ex.id); stats.programsUpdated++; }
        else stats.unchanged++;
      }
      touched.add(clientId);
    }
    for (const id of touched) await refreshClientAlerts(id);
    try { const { relinkUnassignedCalls } = await import('./fathom'); await relinkUnassignedCalls(); } catch (e) { await logError('crm-relink-calls', e); }
    await db.from('sync_runs').update({ finished_at: new Date().toISOString(), ok: true, stats }).eq('id', run?.id);
    return stats;
  } catch (e) {
    await db.from('sync_runs').update({ finished_at: new Date().toISOString(), ok: false, error: String((e as Error).message ?? e), stats }).eq('id', run?.id);
    await logError('crm-sync', e, { trigger });
    throw e;
  }
}
