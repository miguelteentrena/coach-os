import AssignCall from '@/components/AssignCall';
import CallCard from '@/components/CallCard';
import { Empty, NotConnected, PageHeader } from '@/components/ui';
import { dbReady, getCalls, getClients } from '@/lib/data';
import { fmtES } from '@/lib/dates';

export default async function Llamadas() {
  const header = <PageHeader title="Llamadas" subtitle="Llamadas de Fathom asociadas a tus clientes mediante los enlaces del CRM. Solo se guarda el contenido de llamadas de clientes." />;
  if (!dbReady()) return <>{header}<NotConnected /></>;
  const [calls, clients] = await Promise.all([getCalls(), getClients()]);
  const unassigned = calls.filter((c: any) => !c.client_id);
  const assigned = calls.filter((c: any) => c.client_id);
  return (
    <>
      {header}
      {unassigned.length > 0 && (
        <div className="card mb-6">
          <div className="card-h"><span className="text-sig-yellow">Sin asignar ({unassigned.length})</span></div>
          <p className="px-5 pb-3 text-xs text-ink-400">Se asignan solas en cuanto pegues su enlace en el CRM. También puedes asignarlas aquí.</p>
          {unassigned.map((c: any) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 border-t border-ink-800 px-5 py-3 text-sm">
              <span className="num w-24">{fmtES(String(c.recorded_at).slice(0, 10))}</span>
              <span className="flex-1 truncate text-ink-300">{c.title}{c.invitee_emails?.length ? ` · ${c.invitee_emails.join(', ')}` : ''}</span>
              {c.call_url && <a href={c.call_url} target="_blank" rel="noreferrer" className="text-xs text-lime hover:underline">Fathom ↗</a>}
              <AssignCall callId={c.id} clients={clients} />
            </div>
          ))}
        </div>
      )}
      {!assigned.length ? <Empty title="Aún no hay llamadas importadas" /> : (
        <div className="card"><div className="card-h"><span>Llamadas de clientes · {assigned.length}</span></div>{assigned.map((c: any) => <CallCard key={c.id} call={c} showClient />)}</div>
      )}
    </>
  );
}
