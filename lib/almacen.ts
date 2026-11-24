/** Dónde vive cada original: los guardados en Cloudflare R2 llevan el prefijo `r2-` en el nombre del archivo. */
export const PREFIJO_R2 = 'r2-';

export function esRutaR2(ruta: string): boolean {
  return (ruta.split('/')[1] ?? '').startsWith(PREFIJO_R2);
}

/** Ruta nueva para un original: `<album>/<uuid>.<ext>` (Supabase) o `<album>/r2-<uuid>.<ext>` (R2). */
export function rutaOriginal(albumId: string, extension: string, enR2: boolean, id: string = crypto.randomUUID()): string {
  return `${albumId}/${enR2 ? PREFIJO_R2 : ''}${id}.${extension}`;
}
