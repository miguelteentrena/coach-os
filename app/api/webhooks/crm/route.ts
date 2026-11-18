import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { syncCrm } from '@/lib/sync/crm';
import { logError } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Recibe el CRM completo desde Google Apps Script, firmado con HMAC-SHA256. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRM_WEBHOOK_SECRET;
  const body = await req.text();
  const sig = req.headers.get('x-coachos-signature') ?? '';
  if (!secret) return NextResponse.json({ error: 'CRM_WEBHOOK_SECRET no configurado' }, { status: 503 });
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    return NextResponse.json({ error: 'firma no válida' }, { status: 401 });
  try {
    const { rows, sentAt } = JSON.parse(body);
    if (Math.abs(Date.now() - Date.parse(sentAt)) > 5 * 60_000) return NextResponse.json({ error: 'petición caducada' }, { status: 401 });
    const stats = await syncCrm(rows, 'apps_script');
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    await logError('crm-webhook', e);
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
