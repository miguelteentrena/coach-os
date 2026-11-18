'use client';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const db = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    // shouldCreateUser:false → nadie puede registrarse; solo cuentas creadas por ti en Supabase
    const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback` } });
    setState(error ? 'error' : 'sent');
  }
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm card p-8 space-y-5">
        <div className="flex items-center gap-2"><span className="logo-dot" /><h1 className="text-xl font-semibold tracking-tight">COACH OS</h1></div>
        <p className="text-sm text-ink-400">Acceso privado. Te enviaremos un enlace de inicio de sesión.</p>
        {!configured && <p className="text-sm text-sig-yellow">Supabase no está configurado todavía.</p>}
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" className="input w-full" />
        <button disabled={!configured} className="btn-primary w-full">Enviar enlace</button>
        {state === 'sent' && <p className="text-sm text-lime">Revisa tu correo.</p>}
        {state === 'error' && <p className="text-sm text-sig-red">No se pudo enviar. ¿La cuenta está autorizada?</p>}
      </form>
    </main>
  );
}
