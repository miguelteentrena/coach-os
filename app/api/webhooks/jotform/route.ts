import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSubmission, ingestSubmission } from '@/lib/sync/jotform';
import { logError } from '@/lib/supabase';

export const runtime = 'nodejs';

const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Webhook de Jotform: https://<app>/api/webhooks/jotform?token=<JOTFORM_WEBHOOK_TOKEN>
 *  No confiamos en el cuerpo: tomamos solo submissionID y releemos el envío por la API oficial. */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const expected = process.env.JOTFORM_WEBHOOK_TOKEN ?? '';
  if (!expected || !safeEq(token, expected)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const form = await req.formData();
    const id = String(form.get('submissionID') ?? '');
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'submissionID ausente' }, { status: 400 });
    const r = await ingestSubmission(await getSubmission(id), 'webhook');
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    await logError('jotform-webhook', e);
    // 500 → Jotform reintenta; la reconciliación diaria cubre lo que falte
    return NextResponse.json({ error: 'error interno' }, { status: 500 });
  }
}
