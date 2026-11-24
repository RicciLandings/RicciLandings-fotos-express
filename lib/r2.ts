import 'server-only';
import { AwsClient } from 'aws4fetch';

/**
 * Originales en Cloudflare R2 (API compatible con S3). Se activa solo si están las 4 variables R2_*;
 * si no, todo sigue en Supabase Storage.
 */
function config() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return {
    base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
    cliente: new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' }),
  };
}

export function r2Activo(): boolean {
  return config() !== null;
}

function exigir() {
  const c = config();
  if (!c) throw new Error('R2 no está configurado (faltan variables R2_*).');
  return c;
}

const url = (base: string, ruta: string) => `${base}/${ruta.split('/').map(encodeURIComponent).join('/')}`;

async function firmar(metodo: 'GET' | 'PUT', ruta: string, segundos: number, extra: Record<string, string> = {}, cabeceras?: Record<string, string>) {
  const { base, cliente } = exigir();
  const u = new URL(url(base, ruta));
  u.searchParams.set('X-Amz-Expires', String(segundos));
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  const firmado = await cliente.sign(u.toString(), { method: metodo, headers: cabeceras, aws: { signQuery: true } });
  return firmado.url;
}

/** URL para que el navegador suba el original directo a R2 (PUT, 10 min). */
export function firmarSubidaR2(ruta: string, tipo: string): Promise<string> {
  return firmar('PUT', ruta, 600, {}, { 'content-type': tipo });
}

/** URL temporal de lectura; con `nombreDescarga`, el navegador lo baja como archivo. */
export function firmarLecturaR2(ruta: string, segundos: number, nombreDescarga?: string): Promise<string> {
  const extra: Record<string, string> = nombreDescarga
    ? { 'response-content-disposition': `attachment; filename="${nombreDescarga.replace(/"/g, '')}"` }
    : {};
  return firmar('GET', ruta, segundos, extra);
}

export async function leerR2(ruta: string): Promise<Buffer> {
  const { base, cliente } = exigir();
  const r = await cliente.fetch(url(base, ruta));
  if (!r.ok) throw new Error(`R2 GET ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function borrarR2(rutas: string[]): Promise<void> {
  const { base, cliente } = exigir();
  await Promise.all(
    rutas.map(async (ruta) => {
      const r = await cliente.fetch(url(base, ruta), { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error(`R2 DELETE ${r.status}`);
    }),
  );
}

/** Borra todo lo que esté bajo `<albumId>/`. */
export async function vaciarCarpetaR2(albumId: string): Promise<void> {
  const { base, cliente } = exigir();
  for (let vuelta = 0; vuelta < 200; vuelta++) {
    const r = await cliente.fetch(`${base}?list-type=2&max-keys=500&prefix=${encodeURIComponent(`${albumId}/`)}`);
    if (!r.ok) throw new Error(`R2 LIST ${r.status}`);
    const claves = [...(await r.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
    if (!claves.length) return;
    await borrarR2(claves);
  }
}
