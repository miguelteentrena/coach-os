import Link from 'next/link';
import { MetricChart } from '@/components/Charts';
import { Empty, NotConnected, PageHeader } from '@/components/ui';
import { dbReady, getClient, getClients } from '@/lib/data';
import { fmtES } from '@/lib/dates';
import { METRICS } from '@/lib/metrics';

export default async function Evolucion({ searchParams }: { searchParams: { c?: string } }) {
  const header = <PageHeader title="Evolución" subtitle="Cada métrica de los check-ins a lo largo del tiempo" />;
  if (!dbReady()) return <>{header}<NotConnected /></>;
  const clients = (await getClients()).filter((c) => c.status === 'active' || c.status === 'upcoming' || c.lastCheckin);
  const sel = searchParams.c ?? clients.find((c) => c.lastCheckin)?.id;
  const data = sel ? await getClient(sel) : null;
  const series = (data?.checkins ?? []).map((c: any) => ({ label: fmtES(c.submitted_at.slice(0, 10)).slice(0, 5), ...c }));
  return (
    <>
      {header}
      <div className="mb-6 flex flex-wrap gap-2">
        {clients.map((c) => <Link key={c.id} href={`/evolucion?c=${c.id}`} className={c.id === sel ? 'btn-primary' : 'btn'}>{c.full_name}</Link>)}
      </div>
      {!series.length ? <Empty title="Sin check-ins para este cliente" /> : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {METRICS.map((m) => (
            <div key={m.key} className="card p-5">
              <div className="mb-1 flex items-baseline justify-between"><span className="label">{m.label}</span><span className="text-[11px] text-ink-500">{m.polarity === 'higher_better' ? '↑ mejor' : m.polarity === 'lower_better' ? '↓ mejor' : 'neutral'}</span></div>
              <MetricChart data={series} height={170} domain={m.scale ? [m.scale[0], m.scale[1]] : undefined} series={[{ key: m.key, label: m.label }]} />
              {m.note && <p className="mt-1 text-[11px] text-ink-500">{m.note}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
