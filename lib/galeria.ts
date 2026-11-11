import 'server-only';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ClientePublico } from '@/lib/tipos';

/** Hash de la IP del visitante (nunca se guarda la IP): identifica a quien prueba códigos al azar. */
export function huellaDe(cabeceras: Headers): string {
  const ip = cabeceras.get('x-real-ip') ?? cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocida';
  return createHash('sha256').update(`${ip}|${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`).digest('hex').slice(0, 32);
}

/**
 * Abre la galería de un código. Devuelve el cliente con sus fotos visibles, null si el código no
 * existe o 'bloqueado' si desde esa conexión hubo demasiados códigos erróneos (regla en abrir_galeria()).
 */
export async function abrirGaleria(codigo: string, cabeceras: Headers, contarVista = false): Promise<ClientePublico | 'bloqueado' | null> {
  const { data, error } = await supabaseAdmin().rpc('abrir_galeria', {
    p_codigo: codigo,
    p_huella: huellaDe(cabeceras),
    p_contar_vista: contarVista,
  });
  if (error) throw new Error(`No se pudo abrir la galería: ${error.message}`);
  if (!data) return null;
  if ((data as { bloqueado?: boolean }).bloqueado) return 'bloqueado';
  return data as ClientePublico;
}
