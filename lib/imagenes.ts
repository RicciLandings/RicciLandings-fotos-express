import 'server-only';
import sharp from 'sharp';
import { MARCA_AGUA_PNG_BASE64 } from '@/lib/marca-agua';

/** Lado mayor de la preview, en píxeles: alcanza para verla bien en el celu y no sirve para imprimir. */
export const LADO_PREVIEW = 1280;
const CALIDAD_PREVIEW = 68;

const marcaAgua = Buffer.from(MARCA_AGUA_PNG_BASE64, 'base64');

/**
 * Arma la preview pública a partir del original: la endereza según el EXIF, la achica,
 * le pone la marca de agua en mosaico y la pasa a WebP sin metadatos (ni GPS ni datos de la cámara).
 */
export async function crearPreview(original: Buffer): Promise<Buffer> {
  const reducida = await sharp(original, { failOn: 'none' })
    .rotate()
    .resize({ width: LADO_PREVIEW, height: LADO_PREVIEW, fit: 'inside', withoutEnlargement: true })
    .toBuffer();

  return sharp(reducida)
    .composite([{ input: marcaAgua, tile: true, blend: 'over' }])
    .webp({ quality: CALIDAD_PREVIEW })
    .toBuffer();
}
