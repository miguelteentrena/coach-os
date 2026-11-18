import { NextRequest, NextResponse } from 'next/server';
import { userDb } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (code) await userDb().auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL('/', req.url));
}
