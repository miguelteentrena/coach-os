import { NextRequest, NextResponse } from 'next/server';
import { adminDb, logError } from '@/lib/supabase';
import { startAuthorization } from '@/lib/sync/fatsecret';

export const runtime = 'nodejs';
// Enlace que recibe el cliente: valida la invitación y le lleva a autorizar en FatSecret.
export async function GET(req: NextRequest, { params }: { params: { invite: string } }) {
  const bad = (m: string) => NextResponse.redirect(new URL(`/conectar/listo?error=${encodeURIComponent(m)}`, req.url));
  if (!/^[0-9a-f-]{36}$/i.test(params.invite)) return bad('Enlace no válido');
  const { data: inv } = await adminDb().from('fatsecret_invites').select('id, used_at, expires_at').eq('id', params.invite).maybeSingle();
  if (!inv) return bad('Enlace no válido');
  if (inv.used_at) return bad('Este enlace ya se ha usado. Pide uno nuevo a tu entrenador.');
  if (new Date(inv.expires_at) < new Date()) return bad('Este enlace ha caducado. Pide uno nuevo a tu entrenador.');
  try {
    const url = await startAuthorization(inv.id, new URL('/api/fatsecret/callback', req.url).toString());
    return NextResponse.redirect(url);
  } catch (e) {
    await logError('fatsecret-start', e);
    return bad('No se ha podido conectar con FatSecret. Inténtalo de nuevo en unos minutos.');
  }
}
