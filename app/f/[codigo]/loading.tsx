// Esqueleto mientras se buscan las fotos: en 3G evita la pantalla en blanco.
export default function CargandoFotos() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 py-6" aria-busy="true" aria-label="Cargando tus fotos">
      <div className="h-5 w-24 rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="h-6 w-48 rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </main>
  );
}
