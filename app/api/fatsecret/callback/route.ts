import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/supabase';
import { finishAuthorization, syncClient } from '@/lib/sync/fatsecret';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('oauth_token'), verifier = req.nextUrl.searchParams.get('oauth_verifier');
  const go = (q: string) => NextResponse.redirect(new URL(`/conectar/listo${q}`, req.url));
  if (!token || !verifier) return go('?error=' + encodeURIComponent('Autorización cancelada.'));
  try {
    const clientId = await finishAuthorization(token, verifier);
    try { await syncClient(clientId); } catch { /* el error queda guardado; se reintenta cada noche */ }
    return go('');
  } catch (e) {
    await logError('fatsecret-callback', e);
    return go('?error=' + encodeURIComponent(String((e as Error).message)));
  }
}
