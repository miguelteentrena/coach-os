import { NextRequest, NextResponse } from 'next/server';
import { verifyFathomWebhook } from '@/lib/fathom';
import { ingestMeeting } from '@/lib/sync/fathom';
import { logError } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Webhook de Fathom «New meeting content ready» (Standard Webhooks). */
export async function POST(req: NextRequest) {
  const secrets: [string, number][] = [[process.env.FATHOM_WEBHOOK_SECRET ?? '', 1], [process.env.FATHOM_WEBHOOK_SECRET_2 ?? '', 2]];
  const body = await req.text();
  const h = { id: req.headers.get('webhook-id'), timestamp: req.headers.get('webhook-timestamp'), signature: req.headers.get('webhook-signature') };
  const account = secrets.find(([sec]) => sec && verifyFathomWebhook(sec, h, body))?.[1];
  const ok = !!account;
  if (!ok) return NextResponse.json({ error: 'firma no válida' }, { status: 401 });
  try {
    const r = await ingestMeeting(JSON.parse(body), 'webhook', account);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    await logError('fathom-webhook', e);
    return NextResponse.json({ error: 'error interno' }, { status: 500 });
  }
}
