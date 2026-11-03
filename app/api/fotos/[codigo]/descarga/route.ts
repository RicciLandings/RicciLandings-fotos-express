import { NextResponse } from 'next/server';
import { codigoValido, normalizarCodigo } from '@/lib/codigos';
import { firmarDescarga, supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Descarga del original. Solo si la foto está paga (lo decide ruta_descarga() en la base):
 * genera un enlace firmado de corta duración y redirige. Nunca se expone la ruta del archivo.
 */
export async function GET(pedido: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const codigo = normalizarCodigo((await params).codigo);
  if (!codigoValido(codigo)) return NextResponse.json({ error: 'Código inválido.' }, { status: 404 });

  const { data: ruta, error } = await supabaseAdmin().rpc('ruta_descarga', { p_codigo: codigo });
  if (error) return NextResponse.json({ error: 'No se pudo preparar la descarga.' }, { status: 500 });
  if (!ruta) return NextResponse.redirect(new URL(`/f/${codigo}`, pedido.url), 303);

  const extension = String(ruta).split('.').pop();
  let url: string;
  try {
    url = await firmarDescarga(String(ruta), `${codigo}.${extension}`);
  } catch {
    return NextResponse.json({ error: 'No se pudo preparar la descarga. Probá de nuevo.' }, { status: 500 });
  }
  const respuesta = NextResponse.redirect(url, 302);
  respuesta.headers.set('Cache-Control', 'no-store');
  respuesta.headers.set('Referrer-Policy', 'no-referrer');
  return respuesta;
}
