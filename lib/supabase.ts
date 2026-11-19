import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function integrationStatus() {
  const has = (k: string) => !!process.env[k];
  return {
    supabase: has('NEXT_PUBLIC_SUPABASE_URL') && has('NEXT_PUBLIC_SUPABASE_ANON_KEY') && has('SUPABASE_SERVICE_ROLE_KEY'),
    jotformApi: has('JOTFORM_API_KEY'),
    jotformWebhook: has('JOTFORM_WEBHOOK_TOKEN'),
    crmPush: has('CRM_WEBHOOK_SECRET'),
    crmPull: has('GOOGLE_SERVICE_ACCOUNT_JSON') && has('CRM_SPREADSHEET_ID'),
    cron: has('CRON_SECRET'),
    fathomApi: has('FATHOM_API_KEY'),
    fathomWebhook: has('FATHOM_WEBHOOK_SECRET'),
    aiExtraction: has('ANTHROPIC_API_KEY'),
    fatsecret: has('FATSECRET_CONSUMER_KEY') && has('FATSECRET_CONSUMER_SECRET'),
  };
}

/** Cliente con service_role: SOLO en servidor (rutas de sincronización). Nunca se expone al navegador. */
export function adminDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase no configurado (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Cliente con la sesión del usuario: RLS aplica (solo coaches en coach_users ven datos). */
export function userDb(): SupabaseClient {
  const store = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* RSC */ } },
    },
  });
}

export async function logError(scope: string, err: unknown, context?: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${scope}]`, message);
  try { await adminDb().from('error_log').insert({ scope, message, context: context ?? null }); } catch { /* sin BD */ }
}
