import 'server-only';
import sharp from 'sharp';
import { MOSAICO_PNG_BASE64, SELLO_PNG_BASE64 } from '@/lib/marca-agua';

/** Lado mayor de la preview, en píxeles: alcanza para elegir en el celu y no sirve para imprimir. */
export const LADO_PREVIEW = 900;
const CALIDAD_PREVIEW = 70;
/** Ancho del sello "MUESTRA" respecto del ancho de la foto. */
const ANCHO_SELLO = 0.85;

const mosaico = Buffer.from(MOSAICO_PNG_BASE64, 'base64');
const LADO_MOSAICO = 480;
const sello = Buffer.from(SELLO_PNG_BASE64, 'base64');

/**
 * Arma la preview pública a partir del original: la endereza según el EXIF, la achica, le pone la
 * trama con texto en mosaico y el sello central, y la pasa a WebP sin metadatos (ni GPS ni datos de la cámara).
 */
export async function crearPreview(original: Buffer): Promise<Buffer> {
  const { data: reducida, info } = await sharp(original, { failOn: 'none' })
    .rotate()
    .resize({ width: LADO_PREVIEW, height: LADO_PREVIEW, fit: 'inside', withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  // La baldosa no puede ser más grande que la foto (fotos muy chicas): en ese caso se achica.
  const ladoMin = Math.min(info.width, info.height);
  const baldosa = ladoMin < LADO_MOSAICO ? await sharp(mosaico).resize(ladoMin, ladoMin).toBuffer() : mosaico;

  const selloAjustado = await sharp(sello)
    .resize({ width: Math.max(1, Math.round(info.width * ANCHO_SELLO)), height: Math.max(1, info.height), fit: 'inside' })
    .toBuffer();

  return sharp(reducida)
    .composite([
      { input: baldosa, tile: true, blend: 'over' },
      { input: selloAjustado, gravity: 'center', blend: 'over' },
    ])
    .webp({ quality: CALIDAD_PREVIEW })
    .toBuffer();
}
