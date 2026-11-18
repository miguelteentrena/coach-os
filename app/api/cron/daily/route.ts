import { NextRequest, NextResponse } from 'next/server';
import { fetchCrmRows, syncCrm } from '@/lib/sync/crm';
import { syncJotform } from '@/lib/sync/jotform';
import { reconcileFathom, relinkUnassignedCalls } from '@/lib/sync/fathom';
import { refreshAll } from '@/lib/sync/engine';
import { integrationStatus, logError } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Vercel Cron diario: respaldo del CRM, reconciliación de Jotform (21 días) y recálculo de días/alertas. */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const st = integrationStatus();
  const out: Record<string, unknown> = {};
  if (st.crmPull) { try { out.crm = await syncCrm(await fetchCrmRows(), 'cron'); } catch (e) { out.crm = String(e); await logError('cron-crm', e); } }
  else out.crm = 'omitido: lectura directa del CRM no configurada (se depende del Apps Script)';
  if (st.jotformApi) { try { out.jotform = await syncJotform('cron', 'reconcile'); } catch (e) { out.jotform = String(e); } }
  else out.jotform = 'omitido: JOTFORM_API_KEY no configurada';
  if (st.fathomApi) { try { out.fathom = await reconcileFathom('cron', 30); out.relinked = await relinkUnassignedCalls(); } catch (e) { out.fathom = String(e); } }
  else out.fathom = 'omitido: FATHOM_API_KEY no configurada';
  out.refreshed = await refreshAll();
  return NextResponse.json(out);
}
