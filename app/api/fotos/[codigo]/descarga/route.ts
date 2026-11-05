import { NextResponse } from 'next/server';
import { codigoValido, normalizarCodigo } from '@/lib/codigos';
import { firmarDescarga, supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServidor } from '@/lib/supabase/server';
import type { FotoPublica } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

/**
 * Descarga del original. Solo si la foto está paga (lo decide ruta_descarga() en la base):
 * genera un enlace firmado de corta duración y redirige. Nunca se expone la ruta del archivo.
 */
export async function GET(pedido: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const codigo = normalizarCodigo((await params).codigo);
  if (!codigoValido(codigo)) return NextResponse.json({ error: 'Código inválido.' }, { status: 404 });
  const volverALaFoto = () => NextResponse.redirect(new URL(`/f/${codigo}`, pedido.url), 303);

  // Primero el chequeo público (no necesita la clave secreta): si no está paga, de vuelta a la foto.
  const supabase = await supabaseServidor();
  const { data: foto } = await supabase.rpc('foto_por_codigo', { p_codigo: codigo }).maybeSingle<FotoPublica>();
  if (!foto?.vendida) return volverALaFoto();

  try {
    const { data: ruta, error } = await supabaseAdmin().rpc('ruta_descarga', { p_codigo: codigo });
    if (error) throw error;
    if (!ruta) return volverALaFoto();

    const extension = String(ruta).split('.').pop();
    const url = await firmarDescarga(String(ruta), `${codigo}.${extension}`);
    const respuesta = NextResponse.redirect(url, 302);
    respuesta.headers.set('Cache-Control', 'no-store');
    respuesta.headers.set('Referrer-Policy', 'no-referrer');
    return respuesta;
  } catch (e) {
    console.error('Descarga', codigo, e);
    return NextResponse.json({ error: 'No se pudo preparar la descarga. Probá de nuevo en unos minutos.' }, { status: 500 });
  }
}
