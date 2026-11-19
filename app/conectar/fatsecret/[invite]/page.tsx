import { adminDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conecta tu FatSecret · Miguel Juárez Fitness Coach' };

// Página que abre el cliente: explica en español qué va a pasar antes de ir a FatSecret.
export default async function Invitacion({ params }: { params: { invite: string } }) {
  const ok = /^[0-9a-f-]{36}$/i.test(params.invite);
  const { data: inv } = ok ? await adminDb().from('fatsecret_invites').select('used_at, expires_at, clients(full_name)').eq('id', params.invite).maybeSingle() : { data: null };
  const name = String((inv as any)?.clients?.full_name ?? '').split(' ')[0];
  const invalid = !inv ? 'Este enlace no es válido.' : inv.used_at ? 'Este enlace ya se ha usado.' : new Date(inv.expires_at) < new Date() ? 'Este enlace ha caducado.' : null;
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <div className="card w-full max-w-md space-y-6 p-7">
        <div className="flex items-center gap-2.5"><span className="logo-dot" /><span className="font-semibold tracking-tight">Miguel Juárez Fitness Coach</span></div>
        {invalid ? (
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">{invalid}</h1>
            <p className="text-sm text-ink-400">Pídele a Miguel un enlace nuevo por WhatsApp.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold leading-tight">{name ? `${name}, conecta` : 'Conecta'} tu FatSecret con tu seguimiento</h1>
              <p className="text-sm text-ink-300">Así Miguel puede ver tu diario de comidas y tu peso sin que tengas que mandarle capturas, y ajustar tu plan con datos reales.</p>
            </div>
            <ol className="space-y-3 text-sm">
              {[
                ['Pulsa el botón verde', 'Te llevará a la web oficial de FatSecret (está en inglés).'],
                ['Inicia sesión', 'Con el mismo email y contraseña que usas en la app de FatSecret. Tu contraseña no la ve nadie más que FatSecret.'],
                ['Pulsa «Allow»', 'Es «Permitir». Después volverás aquí y verás un mensaje de confirmación.'],
              ].map(([t, d], i) => (
                <li key={i} className="flex gap-3">
                  <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lime/15 text-xs text-lime">{i + 1}</span>
                  <div><div className="font-medium">{t}</div><div className="text-ink-400">{d}</div></div>
                </li>
              ))}
            </ol>
            <a href={`/conectar/fatsecret/${params.invite}/ir`} className="btn-primary block w-full py-3 text-center text-base">Conectar con FatSecret</a>
            <div className="space-y-1 border-t border-ink-800 pt-4 text-xs text-ink-500">
              <p>Solo se lee tu diario de comidas y tu peso. No se modifica nada de tu cuenta.</p>
              <p>Puedes retirar el permiso cuando quieras desde tu cuenta de FatSecret o pidiéndoselo a Miguel.</p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
