import { NextRequest, NextResponse } from 'next/server';
import { fetchCrmRows, syncCrm } from '@/lib/sync/crm';
import { syncJotform } from '@/lib/sync/jotform';
import { reconcileFathom, relinkUnassignedCalls } from '@/lib/sync/fathom';
import { refreshAll } from '@/lib/sync/engine';
import { userDb } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Sincronización manual desde Configuración (solo coaches autenticados). */
export async function POST(req: NextRequest) {
  const db = userDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 });
  const { data: coach } = await db.from('coach_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!coach) return NextResponse.json({ error: 'sin permiso' }, { status: 403 });
  const { action } = await req.json();
  try {
    if (action === 'crm') return NextResponse.json(await syncCrm(await fetchCrmRows(), 'manual'));
    if (action === 'jotform_backfill') return NextResponse.json(await syncJotform('manual', 'backfill'));
    if (action === 'fathom') return NextResponse.json({ ...(await reconcileFathom('manual', 120)), relinked: await relinkUnassignedCalls() });
    if (action === 'refresh') return NextResponse.json({ refreshed: await refreshAll() });
    return NextResponse.json({ error: 'acción desconocida' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
