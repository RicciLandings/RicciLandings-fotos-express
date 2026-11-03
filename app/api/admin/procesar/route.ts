import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sesionAdmin } from '@/lib/admin';
import { BUCKET_ORIGINALES, BUCKET_PREVIEWS } from '@/lib/config';
import { crearPreview } from '@/lib/imagenes';
import { supabaseAdmin } from '@/lib/supabase/admin';

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
 */
export async function POST(pedido: Request) {
  const { supabase, usuario, esAdmin } = await sesionAdmin();
  if (!usuario) return error('Iniciá sesión.', 401);
  if (!esAdmin) return error('No tenés permiso.', 403);

  const cuerpo = esquema.safeParse(await pedido.json().catch(() => null));
  if (!cuerpo.success) return error('Pedido inválido.', 400);
  const { fotoId, rutaAlta } = cuerpo.data;

  // Lectura con la sesión del admin (RLS) para confirmar que la foto existe.
  const { data: foto } = await supabase.from('fotos').select('id, album_id, vendida').eq('id', fotoId).maybeSingle();
  if (!foto) return error('El código no existe.', 404);
  if (!rutaAlta.startsWith(`${foto.album_id}/`)) return error('El archivo no corresponde a este álbum.', 400);

  const admin = supabaseAdmin();
  const borrarOriginal = () => admin.storage.from(BUCKET_ORIGINALES).remove([rutaAlta]);

  if (foto.vendida) {
    await borrarOriginal();
    return error('Esa foto ya se vendió: no se puede reemplazar.', 409);
  }

  const { data: original, error: errorDescarga } = await admin.storage.from(BUCKET_ORIGINALES).download(rutaAlta);
  if (errorDescarga || !original) return error('No se encontró el archivo subido.', 400);

  let preview: Buffer;
  try {
    preview = await crearPreview(Buffer.from(await original.arrayBuffer()));
  } catch {
    await borrarOriginal();
    return error('No se pudo leer la imagen. ¿Está dañada?', 422);
  }

  const rutaPreview = `${foto.album_id}/${randomUUID()}.webp`;
  const { error: errorSubida } = await admin.storage
    .from(BUCKET_PREVIEWS)
    .upload(rutaPreview, preview, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (errorSubida) {
    await borrarOriginal();
    return error('No se pudo guardar la vista previa.', 500);
  }

  const { data: anteriores, error: errorCarga } = await admin
    .rpc('cargar_archivos_foto', { p_foto_id: fotoId, p_ruta_alta: rutaAlta, p_ruta_preview: rutaPreview })
    .maybeSingle<{ ruta_alta_anterior: string | null; ruta_preview_anterior: string | null }>();
  if (errorCarga) {
    await Promise.all([borrarOriginal(), admin.storage.from(BUCKET_PREVIEWS).remove([rutaPreview])]);
    return error(errorCarga.message.includes('vendió') ? 'Esa foto ya se vendió.' : 'No se pudo guardar la foto.', 409);
  }

  // Si se reemplazó una foto, se borran los archivos viejos (si falla, quedan huérfanos pero sin uso).
  await Promise.allSettled([
    anteriores?.ruta_alta_anterior && admin.storage.from(BUCKET_ORIGINALES).remove([anteriores.ruta_alta_anterior]),
    anteriores?.ruta_preview_anterior && admin.storage.from(BUCKET_PREVIEWS).remove([anteriores.ruta_preview_anterior]),
  ]);

  return NextResponse.json({ rutaPreview });
}
