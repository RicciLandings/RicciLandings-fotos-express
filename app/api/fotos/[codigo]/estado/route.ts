import { NextResponse } from 'next/server';
import { codigoValido, normalizarCodigo } from '@/lib/codigos';
import { supabaseServidor } from '@/lib/supabase/server';
import type { ClientePublico } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

/** Estado liviano para que la galería se entere cuando se acredita un pago: ids de las fotos vendidas. */
export async function GET(_: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const codigo = normalizarCodigo((await params).codigo);
  if (!codigoValido(codigo)) return NextResponse.json({ error: 'Código inválido.' }, { status: 404 });

  const supabase = await supabaseServidor();
  const { data } = await supabase.rpc('cliente_por_codigo', { p_codigo: codigo });
  const cliente = data as ClientePublico | null;
  if (!cliente) return NextResponse.json({ error: 'No existe.' }, { status: 404 });

  return NextResponse.json(
    { vendidas: cliente.fotos.filter((f) => f.vendida).map((f) => f.id) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
