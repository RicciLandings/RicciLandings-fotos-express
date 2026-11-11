import { NextResponse } from 'next/server';
import { codigoValido, normalizarCodigo } from '@/lib/codigos';
import { abrirGaleria } from '@/lib/galeria';

export const dynamic = 'force-dynamic';

/** Estado liviano para que la galería se entere cuando se acredita un pago: ids de las fotos vendidas. */
export async function GET(pedido: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const codigo = normalizarCodigo((await params).codigo);
  if (!codigoValido(codigo)) return NextResponse.json({ error: 'Código inválido.' }, { status: 404 });

  const cliente = await abrirGaleria(codigo, pedido.headers);
  if (cliente === 'bloqueado') return NextResponse.json({ error: 'Demasiados intentos.' }, { status: 429 });
  if (!cliente) return NextResponse.json({ error: 'No existe.' }, { status: 404 });

  return NextResponse.json(
    { vendidas: cliente.fotos.filter((f) => f.vendida).map((f) => f.id) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
