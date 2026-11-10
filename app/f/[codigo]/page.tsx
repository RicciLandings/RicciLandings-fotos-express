import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { GaleriaCliente } from '@/components/galeria-cliente';
import { codigoValido, normalizarCodigo } from '@/lib/codigos';
import { configurado } from '@/lib/config';
import { supabaseServidor } from '@/lib/supabase/server';
import type { ClientePublico } from '@/lib/tipos';

// Página privada de cada tarjeta: que no la indexen los buscadores.
export const metadata: Metadata = { title: 'Tus fotos', robots: { index: false, follow: false } };

async function buscarCliente(codigo: string): Promise<ClientePublico | null> {
  const supabase = await supabaseServidor();
  const [{ data, error }] = await Promise.all([
    supabase.rpc('cliente_por_codigo', { p_codigo: codigo }),
    supabase.rpc('registrar_vista', { p_codigo: codigo }),
  ]);
  if (error) throw new Error(`No se pudieron buscar las fotos: ${error.message}`);
  return data as ClientePublico | null;
}

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

  const cliente = await buscarCliente(codigo);
  if (!cliente) notFound();
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
          <p className="font-medium">Tus fotos se están subiendo</p>
          <p className="text-sm text-muted-foreground">Volvé a entrar en un rato con el mismo código.</p>
        </div>
      ) : (
        <GaleriaCliente cliente={cliente} esperandoPago={pago === 'pendiente'} paymentId={paymentId} />
      )}
    </main>
  );
}
