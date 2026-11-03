import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BUCKET_ORIGINALES, SUPABASE_URL } from '@/lib/config';

let admin: SupabaseClient | null = null;

/**
 * Cliente con service role: saltea RLS. Solo en el servidor y solo para tareas del sistema
 * (webhooks de pago, firmar descargas, procesar lotes).
 */
export function supabaseAdmin(): SupabaseClient {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave || !SUPABASE_URL) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_URL.');
  if (!admin) {
    admin = createClient(SUPABASE_URL, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

/** Segundos de vida del enlace de descarga (entre 1 y 30 minutos; 15 por defecto). */
export function duracionUrlFirmada(): number {
  const valor = Number(process.env.DURACION_URL_FIRMADA_SEG ?? 900);
  if (!Number.isFinite(valor)) return 900;
  return Math.min(1800, Math.max(60, Math.round(valor)));
}

/**
 * Enlace firmado y temporal al original en alta resolución.
 * Llamarlo SOLO después de verificar en la base que la foto está paga.
 */
export async function firmarDescarga(rutaAlta: string, nombreArchivo: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET_ORIGINALES)
    .createSignedUrl(rutaAlta, duracionUrlFirmada(), { download: nombreArchivo });
  if (error || !data) throw new Error(`No se pudo firmar la descarga: ${error?.message ?? 'sin datos'}`);
  return data.signedUrl;
}
