import Link from 'next/link';
import IdentityReview from '@/components/IdentityReview';
import { Empty, LevelBadge, NotConnected, PageHeader } from '@/components/ui';
import { dbReady, getCheckins } from '@/lib/data';
import { fmtES } from '@/lib/dates';

const VIA: Record<string, string> = { webhook: 'Webhook', api_backfill: 'Histórico', api_reconcile: 'Reconciliación' };

export default async function Checkins() {
  const header = <PageHeader title="Check-ins" subtitle="Formulario «Check-in semanal» de Jotform (ID 262472622960055)" />;
  if (!dbReady()) return <>{header}<NotConnected /></>;
  const { checkins, analyses, clients, reviews } = await getCheckins();
  const an = new Map(analyses.map((a: any) => [a.checkin_id, a]));
  const name = new Map(clients.map((c: any) => [c.id, c.full_name]));
  const ckDate = new Map(checkins.map((c: any) => [c.id, fmtES(c.submitted_at.slice(0, 10))]));
  return (
    <>
      {header}
      {reviews.length > 0 && (
        <div className="card mb-6 border-sig-yellow/30">
          <div className="card-h"><span className="text-sig-yellow">Identidad pendiente de confirmar ({reviews.length})</span></div>
          <p className="px-5 pb-3 text-xs text-ink-400">El formulario no pide email: estos envíos no coinciden exactamente con un nombre del CRM. No se asignan automáticamente.</p>
          {reviews.map((r: any) => <IdentityReview key={r.id} review={r} clients={clients} submittedAt={ckDate.get(r.checkin_id)} />)}
        </div>
      )}
      {checkins.length === 0 ? (
        <Empty title="Aún no hay check-ins importados">Configura la clave de API de Jotform y lanza la importación del histórico desde Configuración. Los nuevos envíos llegarán por webhook.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table w-full min-w-[760px]">
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Sesiones</th><th>Seguimiento</th><th>Peso</th><th>Motivo principal</th><th>Origen</th><th></th></tr></thead>
            <tbody>
              {checkins.map((c: any) => {
                const a: any = an.get(c.id);
                return (
                  <tr key={c.id} className="hover:bg-ink-850/60">
                    <td className="num">{fmtES(c.submitted_at.slice(0, 10))}</td>
                    <td>{c.client_id ? <Link className="hover:text-lime" href={`/clientes/${c.client_id}`}>{name.get(c.client_id)}</Link> : <span className="text-sig-yellow">{c.submitted_name ?? '—'} (sin identificar)</span>}</td>
                    <td className="num">{c.sessions ?? '—'}</td>
                    <td className="num">{c.adherence ?? '—'}</td>
                    <td className="num">{c.weight_kg ?? '—'}</td>
                    <td className="max-w-xs truncate text-xs text-ink-400">{a?.reasons?.signals?.[0]?.text ?? (a ? 'Sin incidencias' : '—')}</td>
                    <td className="text-xs text-ink-500">{VIA[c.received_via]}</td>
                    <td><LevelBadge level={a?.level} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
