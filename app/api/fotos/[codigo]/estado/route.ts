import { NextResponse } from 'next/server';
import { codigoValido, normalizarCodigo } from '@/lib/codigos';
import { supabaseServidor } from '@/lib/supabase/server';
import type { FotoPublica } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

/** Estado liviano para que la página de la foto se entere cuando se acredita el pago. */
export async function GET(_: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const codigo = normalizarCodigo((await params).codigo);
  if (!codigoValido(codigo)) return NextResponse.json({ error: 'Código inválido.' }, { status: 404 });

  const supabase = await supabaseServidor();
  const { data } = await supabase.rpc('foto_por_codigo', { p_codigo: codigo }).maybeSingle<FotoPublica>();
  if (!data) return NextResponse.json({ error: 'No existe.' }, { status: 404 });

  return NextResponse.json({ vendida: data.vendida }, { headers: { 'Cache-Control': 'no-store' } });
}
