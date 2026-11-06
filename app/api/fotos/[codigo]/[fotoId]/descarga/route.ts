import { NextResponse } from 'next/server';
import { codigoValido, normalizarCodigo } from '@/lib/codigos';
import { firmarDescarga, supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServidor } from '@/lib/supabase/server';
import type { ClientePublico } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Descarga del original de una foto del cliente. Solo si está paga (lo decide ruta_descarga() en la base):
 * genera un enlace firmado de corta duración y redirige. Nunca se expone la ruta del archivo.
 */
export async function GET(pedido: Request, { params }: { params: Promise<{ codigo: string; fotoId: string }> }) {
  const { codigo: crudo, fotoId } = await params;
  const codigo = normalizarCodigo(crudo);
  if (!codigoValido(codigo) || !UUID.test(fotoId)) return NextResponse.json({ error: 'No existe.' }, { status: 404 });
  const volverALaGaleria = () => NextResponse.redirect(new URL(`/f/${codigo}`, pedido.url), 303);

  // Primero el chequeo público (no necesita la clave secreta): si no está paga, de vuelta a la galería.
  const supabase = await supabaseServidor();
  const { data } = await supabase.rpc('cliente_por_codigo', { p_codigo: codigo });
  const foto = (data as ClientePublico | null)?.fotos.find((f) => f.id === fotoId);
  if (!foto?.vendida) return volverALaGaleria();

  try {
    const { data: ruta, error } = await supabaseAdmin().rpc('ruta_descarga', { p_codigo: codigo, p_foto_id: fotoId });
    if (error) throw error;
    if (!ruta) return volverALaGaleria();

    const extension = String(ruta).split('.').pop();
    const url = await firmarDescarga(String(ruta), `${codigo}-${foto.posicion}.${extension}`);
    const respuesta = NextResponse.redirect(url, 302);
    respuesta.headers.set('Cache-Control', 'no-store');
    respuesta.headers.set('Referrer-Policy', 'no-referrer');
    return respuesta;
  } catch (e) {
    console.error('Descarga', codigo, fotoId, e);
    return NextResponse.json({ error: 'No se pudo preparar la descarga. Probá de nuevo en unos minutos.' }, { status: 500 });
  }
}
