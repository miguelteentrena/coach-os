'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV = [
  ['/', 'Dashboard', 'M3 12h7V3H3zM14 21h7v-9h-7zM14 3v5h7V3zM3 21h7v-5H3z'],
  ['/clientes', 'Clientes', 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74'],
  ['/checkins', 'Check-ins', 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9'],
  ['/evolucion', 'Evolución', 'M3 17l6-6 4 4 8-8M14 7h7v7'],
  ['/alertas', 'Advertencias', 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0'],
  ['/nutricion', 'Nutrición', 'M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z'],
  ['/logros', 'Logros', 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3'],
  ['/llamadas', 'Llamadas', 'M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14M5 18h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z'],
  ['/whatsapp', 'WhatsApp', 'M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z'],
  ['/renovaciones', 'Renovaciones', 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5'],
  ['/configuracion', 'Configuración', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
] as const;

export default function Sidebar({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.map(([href, label, d]) => {
    const active = href === '/' ? path === '/' : path.startsWith(href);
    const n = counts[href];
    return (
      <Link key={href} href={href} onClick={() => setOpen(false)}
        className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active ? 'bg-ink-800 text-ink-100' : 'text-ink-400 hover:bg-ink-850 hover:text-ink-100'}`}>
        <svg viewBox="0 0 24 24" className={`h-[18px] w-[18px] ${active ? 'text-lime' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
        <span className="flex-1">{label}</span>
        {!!n && <span className="num rounded-md bg-lime/15 px-1.5 text-[11px] text-lime">{n}</span>}
      </Link>
    );
  });
  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-800 bg-ink-950/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2"><span className="logo-dot" /><span className="font-semibold tracking-tight">COACH OS</span></div>
        <button className="btn" onClick={() => setOpen(!open)} aria-label="Menú">☰</button>
      </div>
      <aside className={`${open ? 'block' : 'hidden'} fixed inset-y-0 left-0 z-40 w-64 border-r border-ink-800 bg-ink-950/95 p-4 backdrop-blur lg:block`}>
        <div className="mb-8 mt-2 flex items-center gap-2.5 px-2">
          <span className="logo-dot" />
          <span className="text-[15px] font-semibold tracking-tight">COACH OS</span>
          <span className="ml-auto rounded-md border border-ink-700 px-1.5 text-[10px] text-ink-400">2.0</span>
        </div>
        <nav className="space-y-0.5">{items}</nav>
        <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-ink-800 p-3 text-[11px] leading-relaxed text-ink-500">
          Capa de inteligencia sobre tu CRM, Jotform, Harbiz y FatSecret. No envía mensajes por ti.
        </div>
      </aside>
    </>
  );
}
