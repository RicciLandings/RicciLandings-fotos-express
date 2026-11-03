import { Camera } from 'lucide-react';
import { FormularioCodigo } from '@/components/formulario-codigo';
import { NOMBRE_SITIO } from '@/lib/config';

// Página estática: se sirve desde el CDN y el único JS es el del formulario.
export default function Inicio() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-8 pb-6">
      <header className="flex items-center gap-2 text-sm font-semibold">
        <Camera className="size-5" aria-hidden />
        {NOMBRE_SITIO}
      </header>

      <section className="flex flex-1 flex-col justify-center gap-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-balance">Tu foto, al toque</h1>
          <p className="text-muted-foreground">
            Ingresá el código de la tarjeta que te dio el fotógrafo o escaneá el QR.
          </p>
        </div>
        <FormularioCodigo />
      </section>

      <footer className="text-center text-xs text-muted-foreground">
        Pagás online y descargás la foto original en alta resolución.
      </footer>
    </main>
  );
}
