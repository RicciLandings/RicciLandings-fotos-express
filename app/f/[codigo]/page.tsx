import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Clock, ShieldAlert } from 'lucide-react';
import { GaleriaCliente } from '@/components/galeria-cliente';
import { codigoValido, normalizarCodigo } from '@/lib/codigos';
import { configurado } from '@/lib/config';
import { abrirGaleria } from '@/lib/galeria';

// Página privada de cada tarjeta: que no la indexen los buscadores.
export const metadata: Metadata = { title: 'Tus fotos', robots: { index: false, follow: false } };

export default async function PaginaCliente({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ pago?: string; payment_id?: string }>;
}) {
  const [{ codigo: crudo }, { pago, payment_id: paymentId }] = await Promise.all([params, searchParams]);
  let decodificado = crudo;
  try {
    decodificado = decodeURIComponent(crudo);
  } catch {
    notFound();
  }
  const codigo = normalizarCodigo(decodificado);
  if (!codigoValido(codigo)) notFound();
  if (codigo !== crudo) redirect(`/f/${codigo}${pago ? `?pago=${encodeURIComponent(pago)}` : ''}`);
  if (!configurado) throw new Error('Faltan las variables de Supabase (ver .env.example).');

  const cliente = await abrirGaleria(codigo, await headers(), true);
  if (!cliente) notFound();
  if (cliente === 'bloqueado') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold">Demasiados intentos</h1>
        <p className="text-sm text-muted-foreground">
          Por seguridad pausamos el acceso desde esta conexión. Probá de nuevo en 15 minutos, con el código tal cual figura en tu tarjeta.
        </p>
      </main>
    );
  }
  const hasta = cliente.disponible_hasta
    ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(cliente.disponible_hasta))
    : null;
  const cantidad = cliente.fotos.length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 pt-6 pb-44">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Otro código
      </Link>

      <header>
        <p className="font-mono text-sm tracking-widest text-muted-foreground">{cliente.codigo}</p>
        <h1 className="text-xl font-semibold">{cliente.titulo_album}</h1>
        <p className="text-sm text-muted-foreground">
          {cliente.ubicacion ? `${cliente.ubicacion} · ` : ''}
          {cantidad === 1 ? '1 foto' : `${cantidad} fotos`}
        </p>
      </header>

      {cantidad === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-muted p-10 text-center">
          <Clock className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{cliente.vencidas > 0 ? 'Tus fotos ya no están disponibles' : 'Tus fotos se están subiendo'}</p>
          <p className="text-sm text-muted-foreground">
            {cliente.vencidas > 0 ? 'Pasó el plazo para verlas y comprarlas.' : 'Volvé a entrar en un rato con el mismo código.'}
          </p>
        </div>
      ) : (
        <>
          {hasta && (
            <p className="text-xs text-muted-foreground">
              Disponibles para comprar hasta el {hasta}.{cliente.vencidas > 0 ? ' Algunas fotos anteriores ya vencieron.' : ''}
            </p>
          )}
          <GaleriaCliente cliente={cliente} esperandoPago={pago === 'pendiente'} paymentId={paymentId} />
        </>
      )}
    </main>
  );
}
