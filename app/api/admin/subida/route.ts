import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sesionAdmin } from '@/lib/admin';
import { rutaOriginal } from '@/lib/almacen';
import { firmarSubidaR2, r2Activo } from '@/lib/r2';

export const runtime = 'nodejs';

const TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/tiff': 'tif' };
const esquema = z.object({ albumId: z.string().uuid(), tipo: z.enum(Object.keys(TIPOS) as [string, ...string[]]) });

/**
 * Dónde subir un original. Con R2 configurado devuelve una URL firmada (PUT directo desde el navegador);
 * si no, `url: null` y el navegador sube a Supabase Storage como siempre.
 */
export async function POST(pedido: Request) {
  const { usuario, esAdmin } = await sesionAdmin();
  if (!usuario) return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 });
  if (!esAdmin) return NextResponse.json({ error: 'No tenés permiso.' }, { status: 403 });

  const cuerpo = esquema.safeParse(await pedido.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  const { albumId, tipo } = cuerpo.data;

  const enR2 = r2Activo();
  const ruta = rutaOriginal(albumId, TIPOS[tipo], enR2);
  return NextResponse.json({ ruta, url: enR2 ? await firmarSubidaR2(ruta, tipo) : null });
}
