import MessageCard from '@/components/MessageCard';
import { Empty, NotConnected, PageHeader } from '@/components/ui';
import { dbReady, getMessages } from '@/lib/data';

export default async function WhatsApp() {
  const header = <PageHeader title="WhatsApp" subtitle="Borradores para quien necesita atención. COACH OS nunca envía: tú editas, copias y marcas como enviado." />;
  if (!dbReady()) return <>{header}<NotConnected /></>;
  const msgs = await getMessages();
  const drafts = msgs.filter((m: any) => m.status === 'draft');
  const done = msgs.filter((m: any) => m.status !== 'draft').slice(0, 12);
  return (
    <>
      {header}
      {drafts.length === 0 ? <Empty title="No hay mensajes pendientes">Solo se redactan para check-ins en rojo o amarillo.</Empty> :
        <div className="grid gap-6 lg:grid-cols-2">{drafts.map((m: any) => <MessageCard key={m.id} m={m} />)}</div>}
      {done.length > 0 && (<><h2 className="label mb-4 mt-10">Historial</h2><div className="grid gap-6 opacity-80 lg:grid-cols-3">{done.map((m: any) => <MessageCard key={m.id} m={m} />)}</div></>)}
    </>
  );
}
