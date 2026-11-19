export default function Listo({ searchParams }: { searchParams: { error?: string } }) {
  const err = searchParams.error;
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="card w-full max-w-sm space-y-4 p-8 text-center">
        <div className="flex items-center justify-center gap-2"><span className="logo-dot" /><span className="font-semibold tracking-tight">Miguel Juárez Fitness Coach</span></div>
        {err ? (
          <>
            <h1 className="text-lg font-semibold">No se ha podido conectar</h1>
            <p className="text-sm text-ink-400">{err}</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-lime">¡FatSecret conectado!</h1>
            <p className="text-sm text-ink-300">Miguel podrá ver tu diario de comidas y tu peso de FatSecret para ayudarte mejor. Sigue usando FatSecret como siempre.</p>
            <p className="text-xs text-ink-500">Puedes retirar el permiso cuando quieras desde la configuración de tu cuenta de FatSecret.</p>
          </>
        )}
      </div>
    </main>
  );
}
