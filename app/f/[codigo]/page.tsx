import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Clock, CreditCard, Download, Wallet } from 'lucide-react';
import { EsperandoPago } from '@/components/esperando-pago';
import { Button } from '@/components/ui/button';
import { codigoValido, normalizarCodigo } from '@/lib/codigos';
import { configurado, urlPreview } from '@/lib/config';
import { supabaseServidor } from '@/lib/supabase/server';
import type { FotoPublica } from '@/lib/tipos';
import { formatearPesos } from '@/lib/utils';

// Página privada de cada código: que no la indexen los buscadores.
export const metadata: Metadata = { title: 'Tu foto', robots: { index: false, follow: false } };

async function buscarFoto(codigo: string): Promise<FotoPublica | null> {
  const supabase = await supabaseServidor();
  const [{ data, error }] = await Promise.all([
    supabase.rpc('foto_por_codigo', { p_codigo: codigo }).maybeSingle<FotoPublica>(),
    supabase.rpc('registrar_vista', { p_codigo: codigo }),
  ]);
  if (error) throw new Error(`No se pudo buscar la foto: ${error.message}`);
  return data;
}

export default async function PaginaFoto({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ pago?: string }>;
}) {
  const [{ codigo: crudo }, { pago }] = await Promise.all([params, searchParams]);
  let decodificado = crudo;
  try {
    decodificado = decodeURIComponent(crudo);
  } catch {
    notFound();
  }
  const codigo = normalizarCodigo(decodificado);
  if (!codigoValido(codigo)) notFound();
  if (codigo !== crudo) redirect(`/f/${codigo}`);
  if (!configurado) throw new Error('Faltan las variables de Supabase (ver .env.example).');

  const foto = await buscarFoto(codigo);
  if (!foto) notFound();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Otro código
      </Link>

      <header>
        <p className="font-mono text-sm tracking-widest text-muted-foreground">{foto.codigo}</p>
        <h1 className="text-xl font-semibold">{foto.titulo_album}</h1>
        {foto.ubicacion && <p className="text-sm text-muted-foreground">{foto.ubicacion}</p>}
      </header>

      {foto.ruta_preview ? (
        // La capa transparente de arriba evita el "guardar imagen" con clic derecho o toque largo.
        <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted select-none">
          <Image
            src={urlPreview(foto.ruta_preview)}
            alt={`Vista previa de la foto ${foto.codigo}`}
            fill
            priority
            sizes="(max-width: 448px) 100vw, 448px"
            draggable={false}
            className="pointer-events-none object-contain [-webkit-touch-callout:none]"
          />
          <div className="absolute inset-0" aria-hidden />
        </div>
      ) : (
        <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl bg-muted p-6 text-center">
          <Clock className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">Tu foto se está subiendo</p>
          <p className="text-sm text-muted-foreground">Volvé a entrar en un rato con el mismo código.</p>
        </div>
      )}

      {foto.vendida ? (
        <section className="space-y-3" aria-label="Descarga">
          <p className="text-center font-medium">¡Listo! Tu foto ya es tuya.</p>
          {/* <a> y no <Link>: es una descarga, no hay que precargarla. */}
          <Button asChild size="lg" className="w-full">
            <a href={`/api/fotos/${foto.codigo}/descarga`} rel="nofollow">
              <Download aria-hidden />
              Descargar en alta resolución
            </a>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Podés volver a descargarla cuando quieras con el mismo código.
          </p>
        </section>
      ) : (
        <section className="space-y-3" aria-label="Pago">
          {pago === 'pendiente' && <EsperandoPago codigo={foto.codigo} />}
          <p className="text-center">
            <span className="text-3xl font-bold">{formatearPesos(foto.precio)}</span>
          </p>
          {/* Los pagos se conectan en el próximo paso (services/payments). */}
          <Button size="lg" className="w-full" disabled>
            <Wallet aria-hidden />
            Pagar con Mercado Pago
          </Button>
          <Button size="lg" variant="outline" className="w-full" disabled>
            <CreditCard aria-hidden />
            Tarjeta internacional (USD)
          </Button>
          <p className="text-center text-xs text-muted-foreground">Pagos disponibles muy pronto.</p>
        </section>
      )}
    </main>
  );
}
