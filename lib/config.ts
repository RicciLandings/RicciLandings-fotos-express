export const NOMBRE_SITIO = 'Fotear';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const SITIO_URL = process.env.NEXT_PUBLIC_SITIO_URL ?? 'http://localhost:3000';

/** true cuando están las variables mínimas para hablar con Supabase. */
export const configurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const BUCKET_PREVIEWS = 'previews';
export const BUCKET_ORIGINALES = 'high-res-photos';

/** URL pública de una preview (bucket público, con marca de agua). */
export function urlPreview(ruta: string): string {
  const limpia = ruta.split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_PREVIEWS}/${limpia}`;
}
