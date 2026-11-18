import Link from 'next/link';
import type { ReactNode } from 'react';

export type Level = 'red' | 'yellow' | 'green';
const LV: Record<Level, { label: string; cls: string; dot: string }> = {
  red: { label: 'Prioritario', cls: 'bg-sig-red/12 text-sig-red ring-1 ring-sig-red/25', dot: 'bg-sig-red' },
  yellow: { label: 'Seguimiento', cls: 'bg-sig-yellow/12 text-sig-yellow ring-1 ring-sig-yellow/25', dot: 'bg-sig-yellow' },
  green: { label: 'Positivo', cls: 'bg-lime/12 text-lime ring-1 ring-lime/25', dot: 'bg-lime' },
};

export function LevelBadge({ level }: { level: Level | null | undefined }) {
  if (!level) return <span className="pill bg-ink-800 text-ink-400 ring-1 ring-ink-700">Sin check-in</span>;
  const l = LV[level];
  return <span className={`pill ${l.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${l.dot}`} />{l.label}</span>;
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: 'lime' | 'red' | 'yellow' }) {
  const c = accent === 'lime' ? 'text-lime' : accent === 'red' ? 'text-sig-red' : accent === 'yellow' ? 'text-sig-yellow' : 'text-ink-100';
  return (
    <div className="card p-5">
      <div className="label">{label}</div>
      <div className={`num mt-3 text-4xl font-semibold tracking-tight ${c}`}>{value}</div>
      {hint && <div className="mt-2 text-xs text-ink-400">{hint}</div>}
    </div>
  );
}

export function Progress({ value }: { value: number | null }) {
  const v = Math.round((value ?? 0) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
      <div className="h-full rounded-full bg-gradient-to-r from-lime-dim to-lime" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card grid place-items-center px-6 py-14 text-center">
      <div className="mb-3 h-10 w-10 rounded-full border border-dashed border-ink-600" />
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-ink-400">{children}</div>}
    </div>
  );
}

/** Estado honesto cuando la base de datos no está conectada: nada de datos ficticios. */
export function NotConnected() {
  return (
    <Empty title="Base de datos no conectada">
      COACH OS no muestra datos simulados. Configura Supabase y la sincronización en{' '}
      <Link href="/configuracion" className="text-lime underline-offset-4 hover:underline">Configuración e integraciones</Link>.
    </Empty>
  );
}

export function DaysLeft({ days }: { days: number | null | undefined }) {
  if (days == null) return <span className="text-ink-500">—</span>;
  const cls = days <= 7 ? 'text-sig-red' : days <= 30 ? 'text-sig-yellow' : 'text-ink-100';
  return <span className={`num ${cls}`}>{days < 0 ? `hace ${-days} d` : `${days} d`}</span>;
}
