// Esqueleto mientras se busca la foto: en 3G evita la pantalla en blanco.
export default function CargandoFoto() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6" aria-busy="true" aria-label="Cargando tu foto">
      <div className="h-5 w-24 rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="h-6 w-48 rounded bg-muted" />
      </div>
      <div className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
      <div className="mx-auto h-9 w-32 rounded bg-muted" />
      <div className="h-12 rounded-lg bg-muted" />
    </main>
  );
}
