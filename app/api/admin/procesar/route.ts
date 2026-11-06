import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sesionAdmin } from '@/lib/admin';
import { BUCKET_ORIGINALES, BUCKET_PREVIEWS } from '@/lib/config';
import { crearPreview } from '@/lib/imagenes';

// sharp necesita Node (no Edge). Una foto grande tarda 1–3 s.
export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const esquema = z.object({
  clienteId: z.string().uuid(),
  rutaAlta: z.string().regex(new RegExp(`^${UUID}/${UUID}\\.(jpg|png|webp|tif)$`)),
});

function error(mensaje: string, estado: number) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/**
 * Recibe una foto ya subida al bucket privado, genera la preview con marca de agua,
 * la sube al bucket público y la agrega al final de las fotos del cliente.
 * Todo con la sesión del administrador: RLS le permite leer y escribir los dos buckets,
 * así que acá no hace falta la clave secreta.
 */
export async function POST(pedido: Request) {
  const { supabase, usuario, esAdmin } = await sesionAdmin();
  if (!usuario) return error('Iniciá sesión.', 401);
  if (!esAdmin) return error('No tenés permiso.', 403);

  const cuerpo = esquema.safeParse(await pedido.json().catch(() => null));
  if (!cuerpo.success) return error('Pedido inválido.', 400);
  const { clienteId, rutaAlta } = cuerpo.data;

  const originales = supabase.storage.from(BUCKET_ORIGINALES);
  const previews = supabase.storage.from(BUCKET_PREVIEWS);
  const borrarOriginal = () => originales.remove([rutaAlta]);

  const { data: cliente } = await supabase.from('clientes').select('id, album_id').eq('id', clienteId).maybeSingle();
  if (!cliente) {
    await borrarOriginal();
    return error('La tarjeta no existe.', 404);
  }
  if (!rutaAlta.startsWith(`${cliente.album_id}/`)) return error('El archivo no corresponde a este álbum.', 400);

  const { data: original, error: errorDescarga } = await originales.download(rutaAlta);
  if (errorDescarga || !original) {
    console.error('No se pudo leer el original', rutaAlta, errorDescarga);
    await borrarOriginal();
    return error('El servidor no pudo leer la foto subida. Probá de nuevo.', 500);
  }

  let preview: Buffer;
  try {
    preview = await crearPreview(Buffer.from(await original.arrayBuffer()));
  } catch {
    await borrarOriginal();
    return error('No se pudo leer la imagen. ¿Está dañada?', 422);
  }

  const rutaPreview = `${cliente.album_id}/${randomUUID()}.webp`;
  const { error: errorSubida } = await previews.upload(rutaPreview, preview, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });
  if (errorSubida) {
    console.error('No se pudo subir la preview', errorSubida);
    await borrarOriginal();
    return error('No se pudo guardar la vista previa.', 500);
  }

  const { data: foto, error: errorCarga } = await supabase
    .rpc('cargar_foto_cliente', { p_cliente_id: clienteId, p_ruta_alta: rutaAlta, p_ruta_preview: rutaPreview })
    .maybeSingle<{ id: string; posicion: number }>();
  if (errorCarga || !foto) {
    console.error('cargar_foto_cliente', errorCarga);
    await Promise.all([borrarOriginal(), previews.remove([rutaPreview])]);
    return error('No se pudo guardar la foto.', 409);
  }

  return NextResponse.json({ fotoId: foto.id, posicion: foto.posicion, rutaPreview });
}
