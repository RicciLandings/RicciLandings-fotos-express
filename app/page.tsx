import { Camera, Download, Images, KeyRound, ShieldCheck } from 'lucide-react';
import { FormularioCodigo } from '@/components/formulario-codigo';
import { NOMBRE_SITIO } from '@/lib/config';

const PASOS = [
  { icono: KeyRound, texto: 'Ingresá tu código' },
  { icono: Images, texto: 'Elegí tus fotos' },
  { icono: Download, texto: 'Descargalas en alta resolución' },
];

// Página estática: se sirve desde el CDN y el único JS es el del formulario.
export default function Inicio() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-8 pb-6">
      <header className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Camera className="size-5" aria-hidden />
        {NOMBRE_SITIO}
      </header>

      <section className="flex flex-1 flex-col justify-center gap-7 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-balance">Tus fotos, listas para vos</h1>
          <p className="text-muted-foreground">Ingresá el código de tu tarjeta o escaneá el QR para verlas.</p>
        </div>

        <FormularioCodigo />

        <ol className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
          {PASOS.map(({ icono: Icono, texto }, i) => (
            <li key={texto} className="flex flex-col items-center gap-1.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-foreground">
                <Icono className="size-4" aria-hidden />
              </span>
              <span>
                <span className="sr-only">Paso {i + 1}: </span>
                {texto}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        Pago seguro con Mercado Pago · Solo se accede con tu código
      </footer>
    </main>
  );
}
