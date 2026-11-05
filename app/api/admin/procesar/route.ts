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
  fotoId: z.string().uuid(),
  rutaAlta: z.string().regex(new RegExp(`^${UUID}/${UUID}\\.(jpg|png|webp|tif)$`)),
});

function error(mensaje: string, estado: number) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/**
 * Recibe una foto ya subida al bucket privado, genera la preview con marca de agua,
 * la sube al bucket público y deja las dos rutas en la base.
 * Todo con la sesión del administrador: RLS le permite leer y escribir los dos buckets,
 * así que acá no hace falta la clave secreta.
 */
export async function POST(pedido: Request) {
  const { supabase, usuario, esAdmin } = await sesionAdmin();
  if (!usuario) return error('Iniciá sesión.', 401);
  if (!esAdmin) return error('No tenés permiso.', 403);

  const cuerpo = esquema.safeParse(await pedido.json().catch(() => null));
  if (!cuerpo.success) return error('Pedido inválido.', 400);
  const { fotoId, rutaAlta } = cuerpo.data;

  const originales = supabase.storage.from(BUCKET_ORIGINALES);
  const previews = supabase.storage.from(BUCKET_PREVIEWS);
  const borrarOriginal = () => originales.remove([rutaAlta]);

  const { data: foto } = await supabase.from('fotos').select('id, album_id, vendida').eq('id', fotoId).maybeSingle();
  if (!foto) return error('El código no existe.', 404);
  if (!rutaAlta.startsWith(`${foto.album_id}/`)) return error('El archivo no corresponde a este álbum.', 400);
  if (foto.vendida) {
    await borrarOriginal();
    return error('Esa foto ya se vendió: no se puede reemplazar.', 409);
  }

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

  const rutaPreview = `${foto.album_id}/${randomUUID()}.webp`;
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

  const { data: anteriores, error: errorCarga } = await supabase
    .rpc('cargar_archivos_foto', { p_foto_id: fotoId, p_ruta_alta: rutaAlta, p_ruta_preview: rutaPreview })
    .maybeSingle<{ ruta_alta_anterior: string | null; ruta_preview_anterior: string | null }>();
  if (errorCarga) {
    console.error('cargar_archivos_foto', errorCarga);
    await Promise.all([borrarOriginal(), previews.remove([rutaPreview])]);
    return error(errorCarga.message.includes('vendió') ? 'Esa foto ya se vendió.' : 'No se pudo guardar la foto.', 409);
  }

  // Si se reemplazó una foto, se borran los archivos viejos (si falla, quedan huérfanos pero sin uso).
  await Promise.allSettled([
    anteriores?.ruta_alta_anterior && originales.remove([anteriores.ruta_alta_anterior]),
    anteriores?.ruta_preview_anterior && previews.remove([anteriores.ruta_preview_anterior]),
  ]);

  return NextResponse.json({ rutaPreview });
}
