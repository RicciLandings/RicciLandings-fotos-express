import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { LADO_PREVIEW, crearPreview } from '@/lib/imagenes';

async function imagenDePrueba(ancho: number, alto: number, orientacion?: number) {
  let img = sharp({ create: { width: ancho, height: alto, channels: 3, background: { r: 40, g: 120, b: 200 } } }).jpeg();
  if (orientacion) img = img.withMetadata({ orientation: orientacion });
  return img.toBuffer();
}

describe('crearPreview', () => {
  it('achica, pasa a WebP y no deja metadatos', async () => {
    const original = await imagenDePrueba(4000, 3000, 1);
    const preview = await crearPreview(original);
    const meta = await sharp(preview).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(LADO_PREVIEW);
    expect(meta.width! / meta.height!).toBeCloseTo(4 / 3, 2);
    expect(meta.exif).toBeUndefined();
    expect(preview.length).toBeLessThan(original.length);
  });

  it('respeta la orientación del EXIF (foto vertical sacada con el celu)', async () => {
    const original = await imagenDePrueba(3000, 2000, 6); // 6 = rotada 90°
    const meta = await sharp(await crearPreview(original)).metadata();
    expect(meta.height!).toBeGreaterThan(meta.width!);
  });

  it('no agranda fotos chicas', async () => {
    const meta = await sharp(await crearPreview(await imagenDePrueba(800, 600))).metadata();
    expect(meta.width).toBe(800);
  });

  it('le pone la marca de agua (la imagen deja de ser lisa)', async () => {
    const preview = await crearPreview(await imagenDePrueba(1200, 900));
    const { channels } = await sharp(preview).stats();
    expect(channels[0].max - channels[0].min).toBeGreaterThan(50);
  });

  it('falla con un archivo que no es imagen', async () => {
    await expect(crearPreview(Buffer.from('no soy una foto'))).rejects.toThrow();
  });
});
